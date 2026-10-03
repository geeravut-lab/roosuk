import { z } from "zod";
import type { ErrorKey } from "@/lib/i18n/dict";
import { POST_LOGIN_PATH } from "@/config/routes";

/** Only same-site relative paths are allowed as a post-login destination (no open redirect). */
export function safeNextPath(
  value: unknown,
  fallback: string = POST_LOGIN_PATH,
): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return fallback;
  return value;
}

const email = z.string().trim().toLowerCase().pipe(z.email());
// 72: bcrypt, which GoTrue uses, ignores everything past 72 bytes.
const newPassword = z.string().min(8).max(72);

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

export const signupSchema = z.object({
  email,
  password: newPassword,
  displayName: z.string().trim().max(60).optional(),
});

interface AuthErrorLike {
  code?: string;
  status?: number;
}

/** Map a Supabase auth error to one of our user-facing error codes. */
export function mapAuthError(error: AuthErrorLike): ErrorKey {
  switch (error.code) {
    case "invalid_credentials":
      return "err_invalid_credentials";
    case "user_already_exists":
    case "email_exists":
      return "err_email_taken";
    case "weak_password":
      return "err_weak_password";
    case "email_not_confirmed":
      return "err_email_not_confirmed";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "err_rate_limited";
  }
  return error.status === 429 ? "err_rate_limited" : "err_unknown";
}
