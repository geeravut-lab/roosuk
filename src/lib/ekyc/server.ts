import "server-only";
import { AppError } from "@/lib/errors";
import { featureEnabled } from "@/lib/flags/server";
import { getIappEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_EKYC_SETTINGS,
  ekycConfigured,
  parseEkycSettings,
  type EkycProvider,
  type EkycSettings,
} from "./ekyc";
import { createIappProvider } from "./iapp";
import type { KycStore } from "./service";

/** The admin's switches. If they cannot be read, identity verification is OFF (it fails closed). */
export async function loadEkycSettings(): Promise<EkycSettings> {
  try {
    const { data, error } = await createAdminClient()
      .from("ekyc_settings")
      .select("*")
      .maybeSingle<Record<string, unknown>>();
    if (error) throw error;
    return parseEkycSettings(data);
  } catch (err) {
    console.warn("[ekyc] could not read settings, treating as off:", err);
    return DEFAULT_EKYC_SETTINGS;
  }
}

/** The real provider, or null when no key is set. There is no fallback to a fake one. */
export function getEkycProvider(): EkycProvider | null {
  const env = getIappEnv();
  return env ? createIappProvider(env) : null;
}

/** Can a person start a verification right now? (feature flag, admin switch and a provider key) */
export async function ekycAvailable(settings?: EkycSettings): Promise<boolean> {
  if (!(await featureEnabled("ekyc"))) return false;
  const s = settings ?? (await loadEkycSettings());
  return ekycConfigured(s) && getEkycProvider() !== null;
}

/** Has this person's identity been verified (automatically or by an admin) and not taken back? Fails closed. */
export async function isKycVerified(userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("is_kyc_verified", {
    p_user: userId,
  });
  if (error) {
    console.error("[ekyc] is_kyc_verified failed:", error.message);
    return false;
  }
  return data === true;
}

/** Stop here unless the person is verified. Put it on the first lines of an action that needs a known person. */
export async function requireKyc(userId: string): Promise<void> {
  if (!(await isKycVerified(userId))) throw new AppError("err_kyc_required");
}

export function createKycStore(): KycStore {
  const db = createAdminClient();
  return {
    async beginAttempt(userId, max) {
      const { data, error } = await db.rpc("ekyc_begin_attempt", {
        p_user: userId,
        p_max: max,
      });
      if (error) {
        console.error("[ekyc] begin attempt failed:", error.message);
        return "error";
      }
      return data === "ok" ||
        data === "verified" ||
        data === "pending" ||
        data === "limit"
        ? data
        : "error";
    },
    async save(row) {
      const { data, error } = await db
        .from("ekyc_verifications")
        .insert({
          user_id: row.userId,
          doc_type: row.docType,
          status: row.status,
          doc_name: row.docName || null,
          doc_number_masked: row.docNumberMasked || null,
          nationality: row.nationality || null,
          liveness_score: row.livenessScore,
          ocr_score: row.ocrScore,
          face_score: row.faceScore,
          face_threshold: row.faceThreshold,
          steps: row.steps,
          reasons: row.reasons,
          provider: row.provider,
        })
        .select("id");
      if (error || data?.length !== 1) {
        console.error("[ekyc] saving the result failed:", error?.message);
        return false;
      }
      return true;
    },
  };
}

export interface KycView {
  verified: boolean;
  /** a failed check is waiting for an admin */
  pending: boolean;
  /** how the last attempt ended, for the calm explanation on /verify */
  last: "passed" | "approved" | "review" | "rejected" | "revoked" | null;
}

/** What the person sees about themselves: status only, never the masked document facts. */
export async function loadKycView(userId: string): Promise<KycView> {
  const { data } = await createAdminClient()
    .from("ekyc_verifications")
    .select("status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<{ status: NonNullable<KycView["last"]> }[]>();
  const rows = data ?? [];
  return {
    verified: rows.some(
      (r) => r.status === "passed" || r.status === "approved",
    ),
    pending: rows.some((r) => r.status === "review"),
    last: rows[0]?.status ?? null,
  };
}
