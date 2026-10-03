import type { ErrorKey } from "@/lib/i18n/dict";

/** Carries a user-facing error CODE (never a sentence — the client translates it). */
export class AppError extends Error {
  constructor(public readonly code: ErrorKey) {
    super(code);
    this.name = "AppError";
  }
}
