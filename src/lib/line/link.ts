import { isLineSyntheticEmail } from "@/lib/line/login";

/**
 * "This LINE account is already linked to another user": which kind of other
 * user holds it decides what the person is told to do. Nothing is ever taken
 * from, or removed from, another account automatically.
 *
 *  - a real account (email / Google): unlink it THERE (Settings has the button),
 *    then link here;
 *  - an account that exists only because someone pressed "Sign in with LINE"
 *    (no email, no password — typically from an earlier test): sign in with LINE
 *    to reach it; if it is not wanted, delete it from its own Settings.
 */
export type LinkConflictKind = "other_user" | "other_login_account";

export function classifyLinkConflict(
  otherEmail: string | null | undefined,
): LinkConflictKind {
  return isLineSyntheticEmail(otherEmail)
    ? "other_login_account"
    : "other_user";
}

/** A LINE-only account has no other way in, so it must not remove its LINE link. */
export function canUnlinkLine(email: string | null | undefined): boolean {
  return !isLineSyntheticEmail(email);
}
