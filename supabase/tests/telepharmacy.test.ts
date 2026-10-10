import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PH1 = "11111111-1111-4111-8111-111111111111";
const PH2 = "22222222-2222-4222-8222-222222222222";
const PA1 = "33333333-3333-4333-8333-333333333333";
const PA2 = "44444444-4444-4444-8444-444444444444";
const PA3 = "55555555-5555-4555-8555-555555555555";
const PA4 = "66666666-6666-4666-8666-666666666666";
const NOBODY = "99999999-9999-4999-8999-999999999999";

// Wednesday 2026-11-18, 10:00 in Bangkok
const NOW = "2026-11-18T03:00:00Z";
const slot = (hhmmBangkok: string, day = "2026-11-18") => `${day}T${hhmmBangkok}:00+07:00`;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN}', 'admin@x.test'), ('${PH1}', 'ph1@x.test'), ('${PH2}', 'ph2@x.test'),
      ('${PA1}', 'pa1@x.test'), ('${PA2}', 'pa2@x.test'), ('${PA3}', 'pa3@x.test'), ('${PA4}', 'pa4@x.test'),
      ('${NOBODY}', 'nobody@x.test');
    insert into public.admins (user_id) values ('${ADMIN}');
    insert into public.ekyc_verifications (user_id, doc_type, status)
      select u, 'thai_id', 'passed' from unnest(array['${PH1}', '${PH2}', '${PA1}', '${PA2}', '${PA3}']::uuid[]) as u;
  `);
}, 60_000);
afterAll(() => db.close());

const q = async <T = Record<string, unknown>>(sql: string) => {
  await actAsOwner(db);
  return (await db.query<T>(sql)).rows;
};
const one = async <T>(sql: string) => (await q<{ r: T }>(sql))[0].r;

let seq = 0;
const hex64 = (n: number) => n.toString(16).padStart(64, "0");

const requestInstant = (patient: string, now = NOW) => {
  seq += 1;
  return one<{ ok: boolean; reason?: string; id?: string }>(
    `select public.request_instant_consult('${patient}', 'ผู้ป่วย', 'general', null, null,
      '{"medicines":"paracetamol"}'::jsonb, array['profile'], '{"v":1,"profile":{"age":40}}'::jsonb,
      'v1', '${hex64(1)}', '{"consult":true,"record":true,"share_profile":true}'::jsonb,
      'room-instant-${seq}-abcdef', '${hex64(seq)}', 'jitsi', '${now}') as r`,
  );
};
const book = (patient: string, at: string, now = NOW) => {
  seq += 1;
  return one<{ ok: boolean; reason?: string; id?: string; slot_no?: number }>(
    `select public.book_consult_slot('${patient}', 'ผู้ป่วย', '${at}', 'medicine_use', null, null,
      '{}'::jsonb, array[]::text[], null,
      'v1', '${hex64(1)}', '{"consult":true,"record":true}'::jsonb,
      'room-booked-${seq}-abcdefg', '${hex64(seq)}', 'jitsi', '${now}') as r`,
  );
};
const presence = (user: string, online: boolean, now = NOW) =>
  one<string>(`select public.pharmacist_set_presence('${user}', ${online}, '${now}') as r`);
const claim = (ph: string, consult: string, now = NOW) =>
  one<{ ok: boolean; reason?: string }>(`select public.claim_consult('${ph}', '${consult}', '${now}') as r`);
const settle = async () => {
  await q(`update public.consults set status = 'cancelled', ended_at = now(), end_reason = 'patient_cancelled' where status in ('waiting', 'booked')`);
  await q(`update public.consults set status = 'done', ended_at = now(), end_reason = 'completed' where status = 'accepted'`);
  await q(`update public.pharmacists set active_consult_id = null`);
};
const status = async (id: string) =>
  (await q<{ status: string }>(`select status from public.consults where id = '${id}'`))[0].status;

describe("everything is off until an admin switches it on", () => {
  it("refuses a request and a booking while disabled", async () => {
    expect(await requestInstant(PA1)).toMatchObject({ ok: false, reason: "off" });
    expect(await book(PA1, slot("14:00"))).toMatchObject({ ok: false, reason: "off" });
  });
  it("the settings are readable but not writable by a signed-in user", async () => {
    await actAs(db, PA1);
    expect((await db.query(`select enabled from public.telepharmacy_settings`)).rows).toEqual([{ enabled: false }]);
    expect(await isRejected(db, `update public.telepharmacy_settings set enabled = true`)).toBe(true);
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select * from public.telepharmacy_settings`)).toBe(true);
  });
  it("keeps values in range and the hours in order", async () => {
    await actAsOwner(db);
    for (const sql of [
      `update public.telepharmacy_settings set slot_minutes = 5`,
      `update public.telepharmacy_settings set video_provider = 'zoom'`,
      `update public.telepharmacy_settings set open_from = '21:00'`,
      `update public.telepharmacy_settings set open_days = '{7}'`,
      `update public.telepharmacy_settings set retention_days = 1`,
    ])
      expect(await isRejected(db, sql), sql).toBe(true);
  });
  it("turns on", async () => {
    await q(`update public.telepharmacy_settings set enabled = true, open_days = '{0,1,2,3,4,5,6}', slot_capacity = 1, max_waiting = 2`);
  });
});

describe("pharmacists", () => {
  it("only an admin adds one (by the e-mail of an existing account) and it is audited", async () => {
    expect(await one<string>(`select public.admin_add_pharmacist('${PA1}', 'ph1@x.test', 'x') as r`)).toBe("forbidden");
    expect(await one<string>(`select public.admin_add_pharmacist('${ADMIN}', 'nobody-here@x.test', 'x') as r`)).toBe("not_found");
    expect(await one<string>(`select public.admin_add_pharmacist('${ADMIN}', 'PH1@x.test', 'ภก. หนึ่ง') as r`)).toBe("ok");
    expect(await one<string>(`select public.admin_add_pharmacist('${ADMIN}', 'ph1@x.test', 'again') as r`)).toBe("already");
    expect(await one<string>(`select public.admin_add_pharmacist('${ADMIN}', 'ph2@x.test', '') as r`)).toBe("ok");
    const rows = await q(`select display_name, license_verified, online from public.pharmacists order by display_name`);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.display_name === "ภก. หนึ่ง")).toMatchObject({ license_verified: false, online: false });
    expect(
      await q(`select action from public.privacy_audit_log where user_id = '${PH1}' and action = 'pharmacist_added'`),
    ).toHaveLength(1);
  });

  it("a pharmacist can read their own row and change nothing — not even the licence mark", async () => {
    await actAs(db, PH1);
    expect((await db.query(`select user_id from public.pharmacists`)).rows).toEqual([{ user_id: PH1 }]);
    for (const sql of [
      `update public.pharmacists set license_verified = true`,
      `update public.pharmacists set license_no = 'ภ.12345'`,
      `update public.pharmacists set online = true`,
      `insert into public.pharmacists (user_id, display_name) values ('${PA1}', 'sneaky')`,
      `delete from public.pharmacists`,
    ])
      expect(await isRejected(db, sql), sql).toBe(true);
    await actAs(db, PA1);
    expect((await db.query(`select * from public.pharmacists`)).rows).toHaveLength(0);
    expect(await db.query(`select public.is_pharmacist() as r`).then((r) => r.rows[0])).toEqual({ r: false });
    await actAs(db, PH1);
    expect(await db.query(`select public.is_pharmacist() as r`).then((r) => r.rows[0])).toEqual({ r: true });
  });

  it("the licence is verified ONLY by an admin, needs a number, and a changed number loses the mark", async () => {
    expect(await one<string>(`select public.admin_set_license_verified('${ADMIN}', '${PH1}', true) as r`)).toBe("no_license");
    await q(`update public.pharmacists set license_no = 'ภ.12345' where user_id = '${PH1}'`);
    expect(await one<string>(`select public.admin_set_license_verified('${PH1}', '${PH1}', true) as r`)).toBe("forbidden");
    expect(await one<string>(`select public.admin_set_license_verified('${ADMIN}', '${PH1}', true) as r`)).toBe("ok");
    expect(await q(`select license_verified, license_verified_by from public.pharmacists where user_id = '${PH1}'`)).toEqual([
      { license_verified: true, license_verified_by: ADMIN },
    ]);
    // the pharmacist edits the number (server code, service role) -> verification is gone
    await q(`update public.pharmacists set license_no = 'ภ.99999', online = true where user_id = '${PH1}'`);
    expect(await q(`select license_verified, license_verified_by, online from public.pharmacists where user_id = '${PH1}'`)).toEqual([
      { license_verified: false, license_verified_by: null, online: false },
    ]);
    expect(await one<string>(`select public.admin_set_license_verified('${ADMIN}', '${PH1}', true) as r`)).toBe("ok");
    expect(await one<string>(`select public.admin_set_license_verified('${ADMIN}', '${NOBODY}', true) as r`)).toBe("not_found");
  });
});

describe("presence and availability (computed from the heartbeat)", () => {
  it("a pharmacist whose licence is not verified cannot go online", async () => {
    expect(await presence(PH2, true)).toBe("license");
    expect(await presence(NOBODY, true)).toBe("not_pharmacist");
  });
  it("a pharmacist without a verified identity cannot go online while it is required", async () => {
    await q(`update public.pharmacists set license_no = 'ภ.22222' where user_id = '${PH2}'`);
    await one(`select public.admin_set_license_verified('${ADMIN}', '${PH2}', true) as r`);
    await q(`update public.ekyc_verifications set status = 'revoked' where user_id = '${PH2}'`);
    expect(await presence(PH2, true)).toBe("kyc");
    // …unless the admin switched that requirement off
    await q(`update public.telepharmacy_settings set require_kyc_for_pharmacist = false`);
    expect(await presence(PH2, true)).toBe("ok");
    expect(await presence(PH2, false)).toBe("ok");
    await q(`update public.telepharmacy_settings set require_kyc_for_pharmacist = true`);
    await q(`update public.ekyc_verifications set status = 'passed' where user_id = '${PH2}'`);
  });
  it("counts online pharmacists seen in the last 120 seconds who are not in a call", async () => {
    const count = (now: string) => one<number>(`select public.consult_available_count('${now}') as r`);
    expect(await count(NOW)).toBe(0);
    expect(await presence(PH1, true)).toBe("ok");
    expect(await count(NOW)).toBe(1);
    expect(await presence(PH2, true)).toBe("ok");
    expect(await count(NOW)).toBe(2);
    expect(await count("2026-11-18T03:01:59Z")).toBe(2);
    expect(await count("2026-11-18T03:02:01Z")).toBe(0); // heartbeat older than 120 s
    expect(await presence(PH2, false)).toBe("ok");
    expect(await count(NOW)).toBe(1);
  });
});

describe("mode B: talk now", () => {
  it("is for verified people only (while required), inside opening hours", async () => {
    expect(await requestInstant(PA4)).toMatchObject({ ok: false, reason: "kyc" });
    expect(await requestInstant(PA1, "2026-11-18T15:00:00Z")).toMatchObject({ ok: false, reason: "closed" }); // 22:00 Bangkok
    await q(`update public.telepharmacy_settings set require_kyc_for_consult = false`);
    expect(await requestInstant(PA4)).toMatchObject({ ok: true });
    await settle();
    await q(`update public.telepharmacy_settings set require_kyc_for_consult = true`);
  });

  it("needs a free pharmacist; one waiting request per person; the queue is capped", async () => {
    await presence(PH2, false);
    await presence(PH1, false);
    expect(await requestInstant(PA1)).toMatchObject({ ok: false, reason: "none_available" });
    await presence(PH1, true);
    const first = await requestInstant(PA1);
    expect(first).toMatchObject({ ok: true });
    expect(await requestInstant(PA1)).toMatchObject({ ok: false, reason: "busy_user" });
    expect(await requestInstant(PA2)).toMatchObject({ ok: true });
    expect(await requestInstant(PA3)).toMatchObject({ ok: false, reason: "queue_full" }); // max_waiting = 2
    await settle();
  });

  it("a person cannot have two live instant requests even if the function is bypassed", async () => {
    const a = await requestInstant(PA1);
    expect(a.ok).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.consults (mode, status, patient_id, topic, consent_version, consent_text_hash, consent_items, provider, room_name, access_key_hash)
         values ('instant', 'waiting', '${PA1}', 'general', 'v1', '${hex64(1)}', '{}', 'jitsi', 'room-bypass-123456789', '${hex64(9)}')`,
      ),
    ).toBe(true);
    await settle();
  });

  it("stores the consent version and the hash of the text the person saw", async () => {
    const r = await requestInstant(PA1);
    const [c] = await q(`select consent_version, consent_text_hash, consent_items, status, mode from public.consults where id = '${r.id}'`);
    expect(c).toMatchObject({ consent_version: "v1", consent_text_hash: hex64(1), status: "waiting", mode: "instant" });
    expect((c as { consent_items: Record<string, boolean> }).consent_items.consult).toBe(true);
    await settle();
  });
});

describe("who can see and change a consult", () => {
  let waiting = "";
  beforeAll(async () => {
    await settle();
    waiting = (await requestInstant(PA1)).id as string;
  });

  it("the patient sees their own; another patient sees nothing; nobody can write", async () => {
    await actAs(db, PA1);
    expect((await db.query(`select id, status from public.consults where status = 'waiting'`)).rows).toEqual([{ id: waiting, status: "waiting" }]);
    await actAs(db, PA2);
    expect((await db.query(`select id from public.consults where id = '${waiting}'`)).rows).toHaveLength(0);
    await actAs(db, PA1);
    for (const sql of [
      `update public.consults set status = 'accepted'`,
      `update public.consults set status = 'done'`,
      `update public.consults set pharmacist_id = '${PA1}'`,
      `delete from public.consults`,
      `insert into public.consults (mode, status, patient_id, topic, consent_version, consent_text_hash, consent_items, provider, room_name, access_key_hash)
         values ('instant', 'accepted', '${PA1}', 'general', 'v1', '${hex64(1)}', '{}', 'jitsi', 'room-forged-123456789', '${hex64(9)}')`,
    ])
      expect(await isRejected(db, sql), sql).toBe(true);
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select id from public.consults`)).toBe(true);
  });

  it("nobody reads the room name, the key hash, the intake or the snapshot through their own client", async () => {
    for (const user of [PA1, PH1]) {
      await actAs(db, user);
      for (const col of ["room_name", "access_key_hash", "intake", "snapshot", "consent_items", "consent_text_hash"])
        expect(await isRejected(db, `select ${col} from public.consults`), `${user} ${col}`).toBe(true);
      expect(await isRejected(db, `select * from public.consults`)).toBe(true);
    }
  });

  it("a serving pharmacist sees the waiting queue (name and topic only); a non-pharmacist does not", async () => {
    await actAs(db, PH1);
    expect((await db.query(`select id, patient_name, topic from public.consults`)).rows).toEqual([
      { id: waiting, patient_name: "ผู้ป่วย", topic: "general" },
    ]);
    await actAs(db, NOBODY);
    expect((await db.query(`select id from public.consults`)).rows).toHaveLength(0);
  });

  it("a pharmacist who may not serve (licence not verified) sees no queue", async () => {
    await q(`update public.pharmacists set license_no = 'ภ.1' where user_id = '${PH1}'`); // loses the mark
    await actAs(db, PH1);
    expect((await db.query(`select id from public.consults`)).rows).toHaveLength(0);
    await one(`select public.admin_set_license_verified('${ADMIN}', '${PH1}', true) as r`);
    await presence(PH1, true);
  });

  it("once taken, only the two parties see it", async () => {
    expect(await claim(PH1, waiting)).toMatchObject({ ok: true });
    await actAs(db, PH2);
    expect((await db.query(`select id from public.consults`)).rows).toHaveLength(0);
    await actAs(db, PH1);
    expect((await db.query(`select id, status from public.consults`)).rows).toEqual([{ id: waiting, status: "accepted" }]);
    await settle();
  });
});

describe("claiming is atomic", () => {
  it("two pharmacists claiming the same call: exactly one gets it", async () => {
    await settle();
    await presence(PH1, true);
    await presence(PH2, true);
    const id = (await requestInstant(PA1)).id as string;
    const a = await claim(PH1, id);
    const b = await claim(PH2, id);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(b).toMatchObject({ ok: false, reason: "taken" });
    const [c] = await q<{ pharmacist_id: string; pharmacist_name: string; pharmacist_license_no: string; status: string }>(
      `select pharmacist_id, pharmacist_name, pharmacist_license_no, status from public.consults where id = '${id}'`,
    );
    expect(c).toMatchObject({ pharmacist_id: PH1, status: "accepted", pharmacist_license_no: "ภ.1" });
    expect(c.pharmacist_name).toBe("ภก. หนึ่ง");
    expect(await q(`select active_consult_id from public.pharmacists where user_id = '${PH1}'`)).toEqual([{ active_consult_id: id }]);
  });

  it("a pharmacist in a call is not available and cannot take a second one", async () => {
    expect(await one<number>(`select public.consult_available_count('${NOW}') as r`)).toBe(1); // PH2 only
    const id2 = (await requestInstant(PA2)).id as string;
    expect(await claim(PH1, id2)).toMatchObject({ ok: false, reason: "busy" });
    // the database refuses it too, whatever the function says
    expect(
      await isRejected(db, `update public.consults set status = 'accepted', pharmacist_id = '${PH1}' where id = '${id2}'`),
    ).toBe(true);
  });

  it("a person who is not allowed to serve cannot claim", async () => {
    const waitingId = (await q<{ id: string }>(`select id from public.consults where status = 'waiting'`))[0].id;
    expect(await claim(NOBODY, waitingId)).toMatchObject({ ok: false, reason: "not_pharmacist" });
    expect(await claim(PH2, "00000000-0000-4000-8000-000000000000")).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("ending the call frees the pharmacist; only the pharmacist of the call can end it", async () => {
    const [{ id }] = await q<{ id: string }>(`select id from public.consults where status = 'accepted'`);
    expect(await one<string>(`select public.end_consult('${PH2}', '${id}', 'completed', '${NOW}') as r`)).toBe("forbidden");
    expect(await one<string>(`select public.end_consult('${PH1}', '${id}', 'completed', '2026-11-18T03:12:00Z') as r`)).toBe("ok");
    expect(await one<string>(`select public.end_consult('${PH1}', '${id}', 'completed', '${NOW}') as r`)).toBe("state");
    const [c] = await q<{ status: string; duration_sec: number; end_reason: string }>(
      `select status, duration_sec, end_reason from public.consults where id = '${id}'`,
    );
    expect(c).toMatchObject({ status: "done", end_reason: "completed" });
    expect(c.duration_sec).toBe(12 * 60);
    expect(await q(`select active_consult_id from public.pharmacists where user_id = '${PH1}'`)).toEqual([{ active_consult_id: null }]);
    await settle();
  });
});

describe("mode A: booking a slot", () => {
  it("books a slot on the grid and gives it a slot number", async () => {
    await settle();
    const r = await book(PA1, slot("14:00"));
    expect(r).toMatchObject({ ok: true, slot_no: 1 });
    expect(await status(r.id as string)).toBe("booked");
  });

  it("the same slot cannot be booked twice (capacity 1) — and the database refuses even a direct insert", async () => {
    expect(await book(PA2, slot("14:00"))).toMatchObject({ ok: false, reason: "taken" });
    expect(
      await isRejected(
        db,
        `insert into public.consults (mode, status, patient_id, topic, consent_version, consent_text_hash, consent_items, provider, room_name, access_key_hash, scheduled_at, slot_no)
         values ('scheduled', 'booked', '${PA2}', 'general', 'v1', '${hex64(1)}', '{}', 'jitsi', 'room-dup-slot-1234567', '${hex64(8)}', '${slot("14:00")}', 1)`,
      ),
    ).toBe(true);
    // another time is free
    expect(await book(PA2, slot("14:20"))).toMatchObject({ ok: true });
  });

  it("a larger capacity gives each person their own slot number, and no more than the capacity", async () => {
    await q(`update public.telepharmacy_settings set slot_capacity = 2`);
    expect(await book(PA3, slot("14:00"))).toMatchObject({ ok: true, slot_no: 2 });
    expect(await book(PA2, slot("14:00"))).toMatchObject({ ok: false, reason: "taken" });
    await q(`update public.telepharmacy_settings set slot_capacity = 1`);
  });

  it("the same person cannot hold the same time twice", async () => {
    expect(await book(PA1, slot("14:00"))).toMatchObject({ ok: false });
  });

  it("refuses times off the grid, outside hours, too soon, too far, or on a closed day", async () => {
    expect(await book(PA1, slot("14:05"))).toMatchObject({ reason: "bad_slot" });
    expect(await book(PA1, slot("08:40"))).toMatchObject({ reason: "bad_slot" });
    expect(await book(PA1, slot("19:40"))).toMatchObject({ ok: true }); // last slot ends at 20:00
    expect(await book(PA1, slot("20:00"))).toMatchObject({ reason: "bad_slot" });
    expect(await book(PA1, slot("10:40"))).toMatchObject({ reason: "too_soon" }); // lead time 60 min from 10:00
    expect(await book(PA1, slot("10:00", "2026-12-30"))).toMatchObject({ reason: "too_far" });
    await q(`update public.telepharmacy_settings set open_days = '{1,2,3,4,5,6}'`); // no Sundays
    expect(await book(PA1, slot("14:00", "2026-11-22"))).toMatchObject({ reason: "closed" }); // a Sunday
    await q(`update public.telepharmacy_settings set open_days = '{0,1,2,3,4,5,6}'`);
  });

  it("caps the number of open bookings per person", async () => {
    await settle();
    await q(`update public.telepharmacy_settings set max_active_bookings = 2`);
    expect(await book(PA1, slot("15:00"))).toMatchObject({ ok: true });
    expect(await book(PA1, slot("15:20"))).toMatchObject({ ok: true });
    expect(await book(PA1, slot("15:40"))).toMatchObject({ reason: "too_many" });
    await q(`update public.telepharmacy_settings set max_active_bookings = 3`);
  });

  it("cancelling frees the slot — only the owner can cancel, only before it starts", async () => {
    await settle();
    const r = await book(PA3, slot("16:00"));
    const id = r.id as string;
    expect(await one<string>(`select public.cancel_consult('${PA2}', '${id}') as r`)).toBe("not_found");
    expect(await one<string>(`select public.cancel_consult('${PA3}', '${id}') as r`)).toBe("ok");
    expect(await one<string>(`select public.cancel_consult('${PA3}', '${id}') as r`)).toBe("state");
    expect(await book(PA2, slot("16:00"))).toMatchObject({ ok: true });
  });

  it("a booked consult can be started only from 15 minutes before to the end of its slot + 30 minutes", async () => {
    await settle();
    await presence(PH1, true);
    const id = (await book(PA1, slot("12:00"))).id as string;
    expect(await claim(PH1, id, "2026-11-18T04:30:00Z")).toMatchObject({ reason: "too_early" }); // 11:30
    expect(await claim(PH1, id, "2026-11-18T06:00:00Z")).toMatchObject({ reason: "expired" }); // 13:00
    expect(await claim(PH1, id, "2026-11-18T04:50:00Z")).toMatchObject({ ok: true }); // 11:50
    await settle();
  });
});

describe("the sweep", () => {
  it("gives up on a call that waited too long, a booked time nobody started and a call that overran; clears stale presence", async () => {
    await settle();
    await q(`update public.telepharmacy_settings set wait_timeout_sec = 180, max_call_minutes = 30`);
    await presence(PH1, true);
    await presence(PH2, true);
    const w = (await requestInstant(PA1)).id as string;
    const b = (await book(PA2, slot("11:40"))).id as string;
    const running = (await requestInstant(PA3)).id as string;
    expect(await claim(PH1, running)).toMatchObject({ ok: true });

    // 2 minutes: nothing yet
    let r = await one<{ missed: unknown[]; ended: number; offline: number }>(`select public.sweep_consults('2026-11-18T03:02:00Z') as r`);
    expect(r.missed).toHaveLength(0);
    // 4 minutes: the waiting one is missed
    r = await one(`select public.sweep_consults('2026-11-18T03:04:00Z') as r`);
    expect(r.missed).toEqual([{ id: w, patient_id: PA1, mode: "instant" }]);
    expect(await status(w)).toBe("missed");
    expect(r.offline).toBe(2); // 4 minutes without a heartbeat
    // the booked time passed (12:00 + 20 + 30 minutes) => no-show
    r = await one(`select public.sweep_consults('2026-11-18T05:55:00Z') as r`);
    expect(r.missed).toEqual([{ id: b, patient_id: PA2, mode: "scheduled" }]);
    expect(await status(b)).toBe("missed");
    // the running call is closed long after its limit
    expect(r.ended).toBe(1);
    expect(await status(running)).toBe("done");
    expect(await q(`select active_consult_id, online from public.pharmacists order by user_id`)).toEqual([
      { active_consult_id: null, online: false },
      { active_consult_id: null, online: false },
    ]);
    // running it again finds nothing new
    r = await one(`select public.sweep_consults('2026-11-18T05:31:00Z') as r`);
    expect(r.missed).toHaveLength(0);
    expect(r.ended).toBe(0);
  });

  it("clears a 'busy' mark that no longer points at a running call", async () => {
    await q(`update public.pharmacists set active_consult_id = (select id from public.consults limit 1) where user_id = '${PH1}'`);
    await one(`select public.sweep_consults('${NOW}') as r`);
    expect(await q(`select active_consult_id from public.pharmacists where user_id = '${PH1}'`)).toEqual([{ active_consult_id: null }]);
  });
});

describe("the service record", () => {
  let consult = "";
  beforeAll(async () => {
    await settle();
    await presence(PH1, true);
    consult = (await requestInstant(PA1)).id as string;
    await claim(PH1, consult);
    await one(`select public.end_consult('${PH1}', '${consult}', 'completed', '2026-11-18T03:10:00Z') as r`);
  });

  const mkRecord = (finalized: boolean) =>
    q(
      `insert into public.consult_records (consult_id, patient_id, pharmacist_id, pharmacist_name, license_no, service_at, duration_sec, patient_context, advice, refer_doctor, products, follow_up_on, follow_up_note, finalized_at)
       values ('${consult}', '${PA1}', '${PH1}', 'ภก. หนึ่ง', 'ภ.1', '${NOW}', 600, '{"profile": {"age": 40}}', 'ดื่มน้ำ พักผ่อน', true,
         '[{"product_id": null, "name": "ผลิตภัณฑ์ A", "note": "ตามฉลาก"}]', '2026-11-25', 'ถามอาการ', ${finalized ? "now()" : "null"})`,
    );

  it("a draft is the pharmacist's only; the person sees it once it is final", async () => {
    await mkRecord(false);
    await actAs(db, PA1);
    expect((await db.query(`select id from public.consult_records`)).rows).toHaveLength(0);
    await actAs(db, PH1);
    expect((await db.query(`select id from public.consult_records`)).rows).toHaveLength(1);
    await actAs(db, PH2);
    expect((await db.query(`select id from public.consult_records`)).rows).toHaveLength(0);
    await q(`update public.consult_records set finalized_at = now() where consult_id = '${consult}'`);
    await actAs(db, PA1);
    expect((await db.query(`select advice, refer_doctor from public.consult_records`)).rows).toEqual([
      { advice: "ดื่มน้ำ พักผ่อน", refer_doctor: true },
    ]);
    await actAs(db, PA2);
    expect((await db.query(`select id from public.consult_records`)).rows).toHaveLength(0);
  });

  it("nobody writes a record through their own client", async () => {
    for (const user of [PA1, PH1]) {
      await actAs(db, user);
      for (const sql of [
        `update public.consult_records set advice = 'changed'`,
        `delete from public.consult_records`,
        `insert into public.consult_records (consult_id, pharmacist_name, service_at) values ('${consult}', 'x', now())`,
      ])
        expect(await isRejected(db, sql), `${user} ${sql}`).toBe(true);
    }
  });

  it("a final record cannot be changed — not even by the service role — except its follow-up part", async () => {
    await actAsOwner(db);
    for (const sql of [
      `update public.consult_records set advice = 'rewritten'`,
      `update public.consult_records set refer_doctor = false`,
      `update public.consult_records set products = '[]'`,
      `update public.consult_records set follow_up_on = '2027-01-01'`,
      `update public.consult_records set service_at = now()`,
      `update public.consult_records set finalized_at = null`,
      `update public.consult_records set patient_context = '{}'`,
      `update public.consult_records set patient_id = '${PA2}'`,
    ])
      await expect(db.query(sql), sql).rejects.toThrow(/finalized consult record/);
    await db.query(
      `update public.consult_records set follow_up_outcome = 'ดีขึ้น', follow_up_done_at = now(), follow_up_reply = 'ทานตามที่แนะนำ', follow_up_reply_at = now(), follow_up_notified_at = now()`,
    );
    expect(await q(`select follow_up_outcome, advice from public.consult_records`)).toEqual([
      { follow_up_outcome: "ดีขึ้น", advice: "ดื่มน้ำ พักผ่อน" },
    ]);
  });

  it("one record per consult", async () => {
    await actAsOwner(db);
    expect(await isRejected(db, `insert into public.consult_records (consult_id, pharmacist_name, service_at) values ('${consult}', 'x', now())`)).toBe(true);
  });
});

describe("the access log is append-only", () => {
  let consult = "";
  beforeAll(async () => {
    consult = (await q<{ id: string }>(`select id from public.consults where patient_id = '${PA1}' and status = 'done' limit 1`))[0].id;
  });
  const log = (actor: string, role: string, action: string) =>
    q(`select public.consult_log_access('${consult}', '${actor}', '${role}', '${action}', '{"k":1}') as r`);

  it("the log function looks up the patient itself", async () => {
    await log(PH1, "pharmacist", "open_record");
    await log(PH1, "pharmacist", "open_context");
    const rows = await q<{ patient_id: string; actor_id: string; action: string }>(
      `select patient_id, actor_id, action from public.consult_access_log order by id`,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.patient_id === PA1 && r.actor_id === PH1)).toBe(true);
  });

  it("the person reads the log of their own record; nobody else does", async () => {
    await actAs(db, PA1);
    expect((await db.query(`select action from public.consult_access_log order by id`)).rows).toEqual([
      { action: "open_record" },
      { action: "open_context" },
    ]);
    await actAs(db, PA2);
    expect((await db.query(`select * from public.consult_access_log`)).rows).toHaveLength(0);
    await actAs(db, PH1);
    expect((await db.query(`select * from public.consult_access_log`)).rows).toHaveLength(0);
    expect(await isRejected(db, `select public.consult_log_access('${consult}', '${PH1}', 'pharmacist', 'x', '{}')`)).toBe(true);
  });

  it("no one can add, edit, delete or truncate through their own client", async () => {
    for (const user of [PA1, PH1]) {
      await actAs(db, user);
      for (const sql of [
        `insert into public.consult_access_log (consult_id, actor_role, action) values ('${consult}', 'patient', 'forged')`,
        `update public.consult_access_log set action = 'x'`,
        `delete from public.consult_access_log`,
        `truncate public.consult_access_log`,
      ])
        expect(await isRejected(db, sql), `${user} ${sql}`).toBe(true);
    }
  });

  it("not even the service role can edit, delete or truncate it", async () => {
    await actAsOwner(db);
    for (const sql of [
      `update public.consult_access_log set action = 'x'`,
      `update public.consult_access_log set at = now()`,
      `update public.consult_access_log set actor_id = '${PA2}'`,
      `delete from public.consult_access_log`,
      `truncate public.consult_access_log`,
    ])
      await expect(db.query(sql), sql).rejects.toThrow(/append-only/);
    expect(await q(`select 1 from public.consult_access_log`)).toHaveLength(2);
  });
});

describe("history outlives the account, but not the identity", () => {
  it("deleting the patient keeps the consult, the pharmacist's record and the log — detached and scrubbed", async () => {
    const before = await q<{ id: string }>(`select id from public.consults where patient_id = '${PA1}'`);
    expect(before.length).toBeGreaterThan(0);
    await q(`delete from auth.users where id = '${PA1}'`);
    const consults = await q<{ patient_id: string | null; patient_name: string | null; snapshot: unknown; intake: unknown; pharmacist_name: string | null }>(
      `select patient_id, patient_name, snapshot, intake, pharmacist_name from public.consults where id = any ('{${before.map((b) => b.id).join(",")}}'::uuid[])`,
    );
    expect(consults).toHaveLength(before.length);
    for (const c of consults) {
      expect(c.patient_id).toBeNull();
      expect(c.patient_name).toBeNull();
      expect(c.snapshot).toBeNull();
      expect(c.intake).toEqual({});
    }
    expect(consults.some((c) => c.pharmacist_name === "ภก. หนึ่ง")).toBe(true); // the professional stays on the record
    const [rec] = await q<{ patient_id: string | null; patient_context: unknown; advice: string }>(
      `select patient_id, patient_context, advice from public.consult_records`,
    );
    expect(rec).toEqual({ patient_id: null, patient_context: {}, advice: "ดื่มน้ำ พักผ่อน" });
    expect(await q(`select 1 from public.consult_access_log where patient_id is null`)).toHaveLength(2);
  });

  it("deleting a pharmacist keeps what they wrote, with their name and licence", async () => {
    await q(`delete from auth.users where id = '${PH1}'`);
    const [rec] = await q<{ pharmacist_id: string | null; pharmacist_name: string; license_no: string }>(
      `select pharmacist_id, pharmacist_name, license_no from public.consult_records`,
    );
    expect(rec).toEqual({ pharmacist_id: null, pharmacist_name: "ภก. หนึ่ง", license_no: "ภ.1" });
    expect(await q(`select 1 from public.pharmacists where user_id = '${PH1}'`)).toHaveLength(0);
  });
});

describe("removing a pharmacist and purging by retention", () => {
  it("an admin removes a pharmacist who is not in a call (audited); others cannot", async () => {
    expect(await one<string>(`select public.admin_remove_pharmacist('${PA2}', '${PH2}') as r`)).toBe("forbidden");
    await q(`update public.pharmacists set active_consult_id = (select id from public.consults limit 1) where user_id = '${PH2}'`);
    expect(await one<string>(`select public.admin_remove_pharmacist('${ADMIN}', '${PH2}') as r`)).toBe("busy");
    await q(`update public.pharmacists set active_consult_id = null where user_id = '${PH2}'`);
    expect(await one<string>(`select public.admin_remove_pharmacist('${ADMIN}', '${PH2}') as r`)).toBe("ok");
    expect(await one<string>(`select public.admin_remove_pharmacist('${ADMIN}', '${PH2}') as r`)).toBe("not_found");
  });

  it("purge deletes only finished consults older than the retention period, only for an admin, and logs it", async () => {
    await settle();
    await q(`update public.consults set ended_at = '2020-01-01T00:00:00Z' where id = (select id from public.consults where status = 'done' order by created_at limit 1)`);
    const total = (await q(`select 1 from public.consults`)).length;
    expect(await one<number>(`select public.admin_purge_consults('${PA2}') as r`)).toBe(-1);
    expect(await one<number>(`select public.admin_purge_consults('${ADMIN}') as r`)).toBe(1);
    expect((await q(`select 1 from public.consults`)).length).toBe(total - 1);
    expect(await q(`select meta from public.privacy_audit_log where action = 'consults_purged'`)).toHaveLength(1);
    // the audit trail of who opened the record is NOT purged
    expect(await q(`select 1 from public.consult_access_log`)).toHaveLength(2);
  });
});
