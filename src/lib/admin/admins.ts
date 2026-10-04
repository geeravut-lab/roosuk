import { z } from "zod";
import { PROTECTED_ADMIN_EMAIL } from "@/config/admin";
import { isLineSyntheticEmail } from "@/lib/line/login";

export function isProtectedAdminEmail(
  email: string | null | undefined,
): boolean {
  return !!email && email.trim().toLowerCase() === PROTECTED_ADMIN_EMAIL;
}

/** The address typed into "add an admin": trimmed, lower-cased, and shaped like an email — or null. */
export function parseGrantEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const r = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(254))
    .safeParse(raw);
  return r.success ? r.data : null;
}

export interface AdminRow {
  id: string;
  /** null for a LINE-only account (it has no real email) */
  email: string | null;
  displayName: string | null;
  since: string;
  isSelf: boolean;
  isProtected: boolean;
}

/** Newest first? No: the owner first, then the rest in the order they were added. */
export function describeAdmins(
  rows: {
    user_id: string;
    created_at: string;
    email: string | null | undefined;
    name: string | null | undefined;
  }[],
  selfId: string,
): AdminRow[] {
  return rows
    .map((r) => ({
      id: r.user_id,
      email: r.email && !isLineSyntheticEmail(r.email) ? r.email : null,
      displayName: r.name?.trim() || null,
      since: r.created_at,
      isSelf: r.user_id === selfId,
      isProtected: isProtectedAdminEmail(r.email),
    }))
    .sort(
      (a, b) =>
        Number(b.isProtected) - Number(a.isProtected) ||
        a.since.localeCompare(b.since),
    );
}

export type GrantResult = "ok" | "forbidden" | "not_found" | "already";
export type RevokeResult =
  "ok" | "forbidden" | "self" | "protected" | "not_admin";
