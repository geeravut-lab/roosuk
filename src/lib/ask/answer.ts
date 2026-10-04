import { z } from "zod";
import { MAX_MESSAGE_CHARS } from "./limits";
import { violatesAnswerGuardrails } from "./safety";

/** What the model is asked to return: the answer plus its own read of urgency and certainty. */
export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    urgency: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["answer", "urgency", "confidence"],
} as const;

export type Urgency = "routine" | "see_doctor_soon" | "emergency";

export interface ModelAnswer {
  answer: string;
  urgency: Urgency;
  confidence: number;
}

export function parseModelAnswer(raw: unknown): ModelAnswer | null {
  const parsed = z
    .object({
      answer: z
        .string()
        .trim()
        .min(1)
        .max(MAX_MESSAGE_CHARS * 4),
      urgency: z.string().catch("routine"),
      confidence: z.coerce.number().finite().catch(0.5),
    })
    .safeParse(raw);
  if (!parsed.success) return null;
  const u = parsed.data.urgency;
  return {
    answer: parsed.data.answer,
    urgency: u === "emergency" || u === "see_doctor_soon" ? u : "routine",
    confidence: Math.min(1, Math.max(0, parsed.data.confidence)),
  };
}

export const LOW_CONFIDENCE = 0.5;

export type AnswerFlag =
  "emergency" | "guardrail" | "see_doctor" | "low_confidence";

export interface FinalAnswer {
  /** What is shown and stored. */
  text: string;
  /** Replaced by a fixed message in the user's language when set. */
  replace: "emergency" | "guardrail" | null;
  flag: AnswerFlag | null;
}

/**
 * The model's answer after OUR checks. Order matters: a forbidden statement or a
 * claimed emergency replaces the answer; "see a doctor" and low confidence keep
 * it but flag it for a banner and the audit log.
 */
export function finalizeAnswer(m: ModelAnswer): FinalAnswer {
  if (m.urgency === "emergency")
    return { text: "", replace: "emergency", flag: "emergency" };
  if (violatesAnswerGuardrails(m.answer))
    return { text: "", replace: "guardrail", flag: "guardrail" };
  if (m.urgency === "see_doctor_soon")
    return { text: m.answer, replace: null, flag: "see_doctor" };
  if (m.confidence < LOW_CONFIDENCE)
    return { text: m.answer, replace: null, flag: "low_confidence" };
  return { text: m.answer, replace: null, flag: null };
}
