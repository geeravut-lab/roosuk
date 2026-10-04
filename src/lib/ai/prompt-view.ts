import { bodyPrompt } from "@/lib/body/body";
import { foodPrompt } from "@/lib/food/food";
import { explainSystemPrompt } from "@/lib/lab/explain";
import { labPrompt } from "@/lib/lab/lab";
import { chatSystemPrompt } from "@/lib/ask/context";
import { computeQuiz, planPrompt } from "@/lib/quiz/quiz";
import type { TaskKind } from "./types";

/**
 * What /admin/prompts shows, read-only: the prompt each task really sends (from
 * the same builders the features use, so this can never drift from the code) and
 * a short description of the guardrails that the CODE enforces around it. The
 * descriptions live in the dictionary (`guardrails_<task>`), one line per rule.
 */
export interface BuiltinPrompt {
  system: string;
  /** The user-side instruction (the data — photo, report, message — is added at run time). */
  input: string;
}

const SAMPLE_QUIZ = computeQuiz(
  {
    birth_year: 1985,
    smoking: "never",
    alcohol: "occasional",
    exercise_days: 3,
    sleep_band: 2,
    produce_band: 2,
    stress: 3,
    checkup_last_year: false,
  },
  2026,
);

export function builtinPrompt(task: TaskKind): BuiltinPrompt | null {
  switch (task) {
    case "food_scan": {
      const p = foodPrompt();
      return { system: p.system, input: p.prompt };
    }
    case "body_scan": {
      const p = bodyPrompt({
        heightCm: 170,
        sex: "female",
        ageBand: "35-39",
        hasFace: true,
        hasPalm: true,
      });
      return { system: p.system, input: p.prompt };
    }
    case "lab_extract": {
      const p = labPrompt();
      return { system: p.system, input: p.prompt };
    }
    case "lab_explain":
      return {
        system: explainSystemPrompt("th"),
        input:
          "Profile + the user's lab values, each with the status the code decided and its reference range.",
      };
    case "chat":
      return {
        system: chatSystemPrompt("th"),
        input:
          "Context block (profile, health score, saved labs) + recent turns + the user's message.",
      };
    case "daily_plan": {
      const p = planPrompt(SAMPLE_QUIZ, "th");
      return { system: p.system, input: p.prompt };
    }
    default:
      return null;
  }
}

/** The dictionary key of a task's guardrail text. */
export const guardrailKey = (task: TaskKind) => `guardrails_${task}` as const;
