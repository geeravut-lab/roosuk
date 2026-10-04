import { z } from "zod";

/**
 * "สนใจตรวจสุขภาพ": a lead is what the person tells us on the form — interest,
 * how to reach them, an optional note — and nothing from their health data.
 */
export const INTERESTS = [
  "checkup",
  "home_service",
  "corporate",
  "consult",
] as const;
export type Interest = (typeof INTERESTS)[number];
export const CONTACT_METHODS = ["line", "phone"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];
export const LEAD_STATUSES = ["new", "contacted", "done", "declined"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const NOTE_MAX = 300;

/** Thai and international numbers as people type them: digits, spaces, dashes, a leading +. */
export function cleanPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().replace(/[()]/g, "").replace(/\s+/g, " ");
  if (!/^[0-9+][0-9 -]{6,18}$/.test(v)) return null;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? v : null;
}

export type LeadInput = {
  interest: Interest;
  contact_method: ContactMethod;
  phone: string | null;
  note: string | null;
};

export type LeadParse =
  | { ok: true; lead: LeadInput }
  | { ok: false; error: "err_lead_invalid" | "err_lead_consent" };

const text = (max: number) =>
  z
    .string()
    .transform((s) =>
      s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim(),
    )
    .pipe(z.string().max(max));

export function parseLeadForm(formData: FormData): LeadParse {
  // The agreement to be contacted is part of the request itself.
  if (formData.get("consent") !== "on")
    return { ok: false, error: "err_lead_consent" };
  const parsed = z
    .object({
      interest: z.enum(INTERESTS),
      contact_method: z.enum(CONTACT_METHODS),
      phone: z.string().catch(""),
      note: text(NOTE_MAX),
    })
    .safeParse({
      interest: formData.get("interest"),
      contact_method: formData.get("contactMethod"),
      phone: formData.get("phone") ?? "",
      note: formData.get("note") ?? "",
    });
  if (!parsed.success) return { ok: false, error: "err_lead_invalid" };
  const { interest, contact_method, note } = parsed.data;
  const phone =
    contact_method === "phone" ? cleanPhone(parsed.data.phone) : null;
  if (contact_method === "phone" && !phone)
    return { ok: false, error: "err_lead_invalid" };
  return {
    ok: true,
    lead: { interest, contact_method, phone, note: note || null },
  };
}

export function isLeadStatus(v: unknown): v is LeadStatus {
  return (
    typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v)
  );
}

/** The admin's note on a lead: trimmed, bounded, null when empty. */
export function cleanAdminNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, NOTE_MAX);
  return v || null;
}
