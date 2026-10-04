// Live: needs E2E_LIVE=1 and the Supabase env. Skipped in `npm test`.
// Runs the real tick against the shared project but ONLY for the users and rules named here,
// and never delivers to LINE, so no real person is notified.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { runTick } from "./server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const live = process.env.E2E_LIVE === "1" && !!url && !!service;

describe.skipIf(!live)("automation rules, live", () => {
  const d = createClient(url ?? "http://x", service ?? "x", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ids: string[] = [];
  afterAll(async () => {
    for (const id of ids) await d.auth.admin.deleteUser(id);
  });

  async function user(prefs = true) {
    const { data, error } = await d.auth.admin.createUser({
      email: `e2e${Date.now()}${randomBytes(3).toString("hex")}@line.roosuk.invalid`,
      password: `Pw-${randomBytes(9).toString("hex")}`,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("no user");
    ids.push(data.user.id);
    await d.from("line_links").insert({
      user_id: data.user.id,
      line_sub: `U${randomBytes(8).toString("hex")}`,
      display_name: "E2E",
    });
    if (prefs)
      await d.from("notification_prefs").upsert({
        user_id: data.user.id,
        line_transactional: true,
        line_reminders: true,
      });
    return data.user.id;
  }
  const inbox = async (id: string, kind: string) =>
    (
      await d
        .from("app_notifications")
        .select("title, href, dedupe_key")
        .eq("user_id", id)
        .eq("kind", kind)
    ).data ?? [];
  const day = (offset: number, from = Date.now()) =>
    new Date(from + 7 * 3600_000 + offset * 86_400_000)
      .toISOString()
      .slice(0, 10);
  const lab = async (id: string, collected: string, status: string) =>
    d.from("lab_reports").insert({
      user_id: id,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      collected_on: collected,
      model: "test/none",
      items: [
        {
          name: "LDL-C",
          marker_key: "ldl",
          value: 150,
          unit: "mg/dL",
          value_std: 150,
          status,
          printed_range: "",
          confidence: 0.9,
        },
      ],
    });

  it("check-up reminders: yearly and re-check, once per report, only for the chosen people", async () => {
    const yearly = await user();
    const recheck = await user();
    const recent = await user();
    const noOptIn = await user(false);
    expect((await lab(yearly, day(-400), "normal")).error).toBeNull();
    expect((await lab(recheck, day(-120), "watch")).error).toBeNull();
    expect((await lab(recent, day(-10), "watch")).error).toBeNull();
    expect((await lab(noOptIn, day(-400), "normal")).error).toBeNull();
    const only = {
      rules: ["checkup_reminder"],
      users: [yearly, recheck, recent, noOptIn],
    };

    const t1 = await runTick(new Date(), only);
    expect(t1.rules.checkup_reminder).toBe(2);
    expect(await inbox(yearly, "checkup_annual")).toHaveLength(1);
    expect(await inbox(recheck, "checkup_recheck")).toHaveLength(1);
    expect((await inbox(recheck, "checkup_recheck"))[0].href).toBe(
      "/checkup-interest",
    );
    expect(await inbox(recent, "checkup_recheck")).toHaveLength(0); // 10 days: too early
    expect(await inbox(noOptIn, "checkup_annual")).toHaveLength(0); // reminders are opt-in

    await runTick(new Date(), only); // nothing new the second time
    expect(await inbox(yearly, "checkup_annual")).toHaveLength(1);
    // nothing reached LINE's queue as "sent"
    const q =
      (
        await d
          .from("notification_queue")
          .select("status")
          .eq("user_id", yearly)
      ).data ?? [];
    expect(q.every((r) => r.status === "queued")).toBe(true);
  }, 120_000);

  it("streak last call: only a long streak that has not checked in", async () => {
    const long = await user();
    const short = await user();
    const done = await user();
    const rows = (id: string, n: number, skipToday = false) =>
      Array.from({ length: n }, (_, i) => ({
        user_id: id,
        checkin_date: day(-(i + (skipToday ? 1 : 0))),
        sleep_band: 3,
        activity_band: 2,
        energy: 4,
        mood: 4,
        nutrition: 3,
      }));
    await d.from("daily_checkins").insert(rows(long, 9, true)); // 9 days up to yesterday, not today
    await d.from("daily_checkins").insert(rows(short, 3, true));
    await d.from("daily_checkins").insert(rows(done, 9)); // checked in today
    await d
      .from("automation_rules")
      .update({ params: { hour: 0, min_streak: 7 } })
      .eq("key", "streak_at_risk");
    try {
      const t = await runTick(new Date(), {
        rules: ["streak_at_risk"],
        users: [long, short, done],
      });
      expect(t.rules.streak_at_risk).toBe(1);
      expect(await inbox(long, "streak_last_call")).toHaveLength(1);
      expect(await inbox(short, "streak_last_call")).toHaveLength(0);
      expect(await inbox(done, "streak_last_call")).toHaveLength(0);
    } finally {
      await d
        .from("automation_rules")
        .update({ params: { hour: 21, min_streak: 7 } })
        .eq("key", "streak_at_risk");
    }
  }, 120_000);

  it("monthly report ready: announced in the window to people with enough check-in days, once", async () => {
    const enough = await user();
    const few = await user();
    const month = (() => {
      const [y, m] = day(0).split("-").map(Number);
      return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    })();
    const mk = (id: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        user_id: id,
        checkin_date: `${month}-${String(i + 1).padStart(2, "0")}`,
        sleep_band: 3,
        activity_band: 2,
        energy: 4,
        mood: 4,
        nutrition: 3,
      }));
    await d.from("daily_checkins").insert(mk(enough, 4));
    await d.from("daily_checkins").insert(mk(few, 2));
    // pretend today is the 2nd of this month (the rule window), whatever day it really is
    const [y, m] = day(0).split("-").map(Number);
    const second = new Date(Date.UTC(y, m - 1, 2, 5)); // 12:00 in Bangkok on the 2nd
    const only = { rules: ["monthly_report_ready"], users: [enough, few] };
    const t = await runTick(second, only);
    expect(t.rules.monthly_report_ready).toBe(1);
    const n = await inbox(enough, "monthly_report_ready");
    expect(n).toHaveLength(1);
    expect(n[0].href).toBe(`/report?month=${month}`);
    expect(await inbox(few, "monthly_report_ready")).toHaveLength(0);
    await runTick(second, only);
    expect(await inbox(enough, "monthly_report_ready")).toHaveLength(1);
    // outside the window nothing is announced
    const later = new Date(Date.UTC(y, m - 1, 20, 5));
    const t2 = await runTick(later, {
      rules: ["monthly_report_ready"],
      users: [enough],
    });
    expect(t2.rules.monthly_report_ready).toBe(0);
  }, 120_000);
  it("agent reminders: sent once on the day (from the rule's hour), a stale one is closed unsent", async () => {
    const a = await user();
    const other = await user();
    const noon = new Date(`${day(0)}T05:00:00Z`); // 12:00 in Bangkok, whatever the real time is
    const early = new Date(`${day(0)}T00:00:00Z`); // 07:00 in Bangkok: before the rule's hour (8)
    const rem = (id: string, on: string, text: string) => ({
      user_id: id,
      remind_on: on,
      text,
    });
    const { error } = await d
      .from("agent_reminders")
      .insert([
        rem(a, day(0), "Ask the doctor about LDL"),
        rem(a, day(1), "Not due yet"),
        rem(a, day(-5), "Far too late to matter"),
        rem(other, day(0), "Someone else's"),
      ]);
    expect(error).toBeNull();
    const only = { rules: ["agent_reminders"], users: [a] };

    const tooEarly = await runTick(early, only);
    expect(tooEarly.rules.agent_reminders).toBe(0); // before the hour
    expect(await inbox(a, "agent_reminder")).toHaveLength(0);

    const t = await runTick(noon, only);
    expect(t.rules.agent_reminders).toBe(1);
    const got = await inbox(a, "agent_reminder");
    expect(got).toHaveLength(1);
    expect(got[0].href).toBe("/agent");
    const rows = (
      await d
        .from("agent_reminders")
        .select("text, notified_at")
        .eq("user_id", a)
    ).data!;
    const by = Object.fromEntries(rows.map((r) => [r.text, r.notified_at]));
    expect(by["Ask the doctor about LDL"]).not.toBeNull();
    expect(by["Not due yet"]).toBeNull();
    expect(by["Far too late to matter"]).not.toBeNull(); // closed, but nothing was sent for it

    await runTick(noon, only); // nothing new the second time
    expect(await inbox(a, "agent_reminder")).toHaveLength(1);
    // someone who was not named is untouched
    const o = (
      await d.from("agent_reminders").select("notified_at").eq("user_id", other)
    ).data!;
    expect(o[0].notified_at).toBeNull();
  }, 120_000);
});
