"use server";

import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { PLANS } from "@/config/plans";
import { runAi } from "@/lib/ai/server";
import { AiError } from "@/lib/ai/types";
import { trackEvent } from "@/lib/analytics/server";
import { appendMessages, createConversation } from "@/lib/ask/server";
import { requireUser } from "@/lib/auth/server";
import { tierFor } from "@/lib/billing/entitlement.server";
import { checkAndConsume, refundUsage } from "@/lib/billing/quota.server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import { getOrigin } from "@/lib/http/origin";
import type { ErrorKey } from "@/lib/i18n/dict";
import { getLang } from "@/lib/i18n/server";
import {
  BRIEF_SCHEMA,
  MAX_ACTIVE_LINKS,
  briefPrompt,
  briefSystemPrompt,
  buildSnapshot,
  hashToken,
  newToken,
  normalizeBrief,
  parsePassportForm,
} from "@/lib/passport/passport";
import { loadSnapshotInput } from "@/lib/passport/server";
import { createAdminClient } from "@/lib/supabase/admin";

const toErrorKey = (e: unknown): ErrorKey =>
  e instanceof AppError ? e.code : "err_unknown";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PassportState {
  error?: ErrorKey;
  /** The link, shown ONCE: only its hash is kept. */
  created?: { url: string; qrSvg: string; label: string; expiresAt: string };
}

/** Make a link. The content is frozen now; what was not ticked is never even read. */
export async function createPassportAction(
  _prev: PassportState,
  formData: FormData,
): Promise<PassportState> {
  try {
    await assertFeature("health_passport");
    const user = await requireUser();
    if (!PLANS[await tierFor(user.id)].healthPassport)
      return { error: "err_passport_plan" };

    const parsed = parsePassportForm(formData);
    if (!parsed.ok) return { error: parsed.error };
    const req = parsed.value;
    // the liver section is a feature of its own: switched off, it cannot be shared either
    if (req.sections.includes("liver")) await assertFeature("liver_check");

    const db = createAdminClient();
    const { count } = await db
      .from("health_passports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString());
    if ((count ?? 0) >= MAX_ACTIVE_LINKS) return { error: "err_passport_max" };

    const today = bangkokDate(new Date());
    const snapshot = buildSnapshot(
      await loadSnapshotInput(req.sections, today),
    );

    let model = "";
    if (req.withBrief) {
      const decision = await checkAndConsume(user.id, "aiChat");
      if (!decision.allowed) return { error: decision.error };
      const lang = await getLang();
      try {
        const ai = await runAi("doctor_brief", {
          system: briefSystemPrompt(lang),
          prompt: briefPrompt(snapshot),
          jsonSchema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
          maxTokens: 1024,
        });
        const brief = normalizeBrief(ai.json);
        if (!brief) throw new AiError("bad_output");
        snapshot.brief = brief;
        model = `${ai.provider}/${ai.model}`.slice(0, 100);
      } catch (err) {
        console.error(
          "[passport] brief failed:",
          err instanceof AiError ? err.code : err,
        );
        await refundUsage(user.id, "aiChat");
        return { error: "err_ai_unavailable" };
      }
    }

    const token = newToken();
    const expiresAt = new Date(Date.now() + req.expiryDays * 86_400_000);
    const { data, error } = await db
      .from("health_passports")
      .insert({
        user_id: user.id,
        token_hash: hashToken(token),
        label: req.label,
        holder_name: req.holderName,
        sections: req.sections,
        snapshot,
        expires_at: expiresAt.toISOString(),
      })
      .select("id");
    if (error || data?.length !== 1) {
      if (req.withBrief) await refundUsage(user.id, "aiChat");
      return { error: "err_save_failed" };
    }

    if (snapshot.brief) {
      const conversation = await createConversation(user.id, "doctor_brief");
      if (conversation)
        await appendMessages(conversation, user.id, [
          { role: "user", content: briefPrompt(snapshot) },
          { role: "assistant", content: snapshot.brief.summary, model },
        ]);
    }
    await db.from("privacy_audit_log").insert({
      user_id: user.id,
      action: "passport_created",
      detail: `sections ${req.sections.join(",")}; expires in ${req.expiryDays} d`,
      meta: { sections: req.sections, brief: !!snapshot.brief },
    });
    await trackEvent("passport_created", user.id);

    const url = `${await getOrigin()}/p/${token}`;
    const qrSvg = await QRCode.toString(url, {
      type: "svg",
      margin: 1,
      width: 192,
      errorCorrectionLevel: "M",
      color: { dark: "#1F2A30", light: "#FFFFFF" },
    });
    revalidatePath("/passport");
    return {
      created: {
        url,
        qrSvg,
        label: req.label,
        expiresAt: expiresAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("[passport] create failed:", err);
    return { error: toErrorKey(err) };
  }
}

/** Cancel a link now: anyone holding it sees "no longer available". */
export async function revokePassportAction(formData: FormData): Promise<void> {
  await assertFeature("health_passport");
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const db = createAdminClient();
  const { data, error } = await db
    .from("health_passports")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .select("id");
  if (error) throw new AppError("err_save_failed");
  if (data?.length) {
    await db.from("privacy_audit_log").insert({
      user_id: user.id,
      action: "passport_revoked",
      detail: null,
      meta: {},
    });
    await trackEvent("passport_revoked", user.id);
  }
  revalidatePath("/passport");
}

/** Remove a link that is no longer live from the list (a live one must be cancelled first). */
export async function deletePassportAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("health_passports")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .or(`revoked_at.not.is.null,expires_at.lte.${now}`);
  if (error) throw new AppError("err_save_failed");
  revalidatePath("/passport");
}
