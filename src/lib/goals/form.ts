import { PARAM_SCHEMAS, type GoalKind, type GoalParams } from "./kinds";

type Get = (name: string) => FormDataEntryValue | null;
type Result = { ok: true; params: GoalParams } | { ok: false; field: string };

const str = (v: FormDataEntryValue | null): string =>
  typeof v === "string" ? v.trim() : "";

/**
 * Reads the intake form of a goal into validated params. Each kind asks only a handful of
 * questions; a field that is missing or out of range is named so the form can point at it.
 */
export function readGoalParams(
  kind: GoalKind,
  get: Get,
  getAll: (n: string) => string[] = () => [],
): Result {
  let raw: Record<string, unknown>;
  if (kind === "weight") {
    const careful = new Set(getAll("careful"));
    const direction = str(get("direction"));
    raw = {
      direction,
      heightCm: str(get("height_cm")),
      weightKg: str(get("weight_kg")),
      targetKg:
        direction === "maintain" || str(get("target_kg")) === ""
          ? null
          : str(get("target_kg")),
      pace: str(get("pace")) || "gentle",
      activity: str(get("activity")),
      flags: {
        pregnant: careful.has("pregnant"),
        edHistory: careful.has("ed"),
        medical: careful.has("medical"),
      },
      sex: str(get("sex")) || null,
      birthYear: str(get("birth_year")),
    };
  } else if (kind === "sleep") {
    raw = {
      avgHours: str(get("avg_hours")),
      problem: str(get("problem")),
      caffeine: str(get("caffeine")),
      wakeTime: str(get("wake_time")),
    };
  } else if (kind === "brain") {
    raw = {
      aim: str(get("aim")),
      sitHours: str(get("sit_hours")),
      sleepHours: str(get("sleep_hours")),
    };
  } else {
    raw = {
      condition: str(get("condition")),
      underCare: str(get("under_care")) === "yes",
    };
  }
  const parsed = PARAM_SCHEMAS[kind].safeParse(raw);
  if (parsed.success) return { ok: true, params: parsed.data as GoalParams };
  const key = String(parsed.error.issues[0]?.path[0] ?? "");
  const FIELD: Record<string, string> = {
    direction: "direction",
    heightCm: "height_cm",
    weightKg: "weight_kg",
    targetKg: "target_kg",
    pace: "pace",
    activity: "activity",
    sex: "sex",
    birthYear: "birth_year",
    avgHours: "avg_hours",
    problem: "problem",
    caffeine: "caffeine",
    wakeTime: "wake_time",
    aim: "aim",
    sitHours: "sit_hours",
    sleepHours: "sleep_hours",
    condition: "condition",
  };
  return { ok: false, field: FIELD[key] ?? key };
}
