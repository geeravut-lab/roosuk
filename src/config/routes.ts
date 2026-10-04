/** Path prefixes that need a signed-in user (enforced in src/proxy.ts and again in the layouts). */
export const PROTECTED_PREFIXES = [
  "/today",
  "/timeline",
  "/scan",
  "/ask",
  "/settings",
  "/profile",
  "/notifications",
  "/achievements",
  "/report",
  "/vault",
  "/passport",
  "/wearables",
  "/install",
  "/agent",
  "/family",
  "/shop",
  "/company",
  "/creator",
  "/rewards",
  "/challenges",
  "/quiz-result",
  "/subscription",
  "/consent",
  "/admin",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const POST_LOGIN_PATH = "/today";
