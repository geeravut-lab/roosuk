import { createHash } from "node:crypto";
import type { LabPanel } from "./engine";
import type { LiverAnswers } from "./questionnaire";

/** JSON with sorted keys, so the same inputs always give the same text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/**
 * SHA-256 of exactly what the engine was given (the day, the answers, the lab
 * panels). Kept in the audit log so that, later, "what did the engine see?" can
 * be checked against the stored assessment without keeping a second copy of the
 * health data in the log.
 */
export function inputsDigest(input: {
  today: string;
  answers: LiverAnswers;
  panels: readonly LabPanel[];
}): string {
  const panels = [...input.panels].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  return createHash("sha256")
    .update(canonical({ ...input, panels }))
    .digest("hex");
}
