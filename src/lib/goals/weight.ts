import type { Sex } from "@/lib/profile/profile";

/**
 * Weight goals, the numbers. Plain arithmetic with safety rails, all in code (never the
 * model): who may use a calorie target at all, how fast it may go, and the floors it may not
 * go below. DRAFT thresholds — a dietitian and a doctor must review them before launch
 * (master plan §13). A person with a condition, a pregnancy, an eating-disorder history or an
 * age under 18 never gets an aggressive plan from this code.
 */
export const DIRECTIONS = ["lose", "maintain", "gain"] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const PACES = ["gentle", "standard"] as const;
export type Pace = (typeof PACES)[number];
export const ACTIVITY_LEVELS = [
  "sedentary",
  "light",
  "moderate",
  "active",
] as const;
export type Activity = (typeof ACTIVITY_LEVELS)[number];

export interface WeightIntake {
  direction: Direction;
  sex: Sex | null;
  /** age in whole years */
  age: number;
  heightCm: number;
  weightKg: number;
  targetKg: number | null;
  pace: Pace;
  activity: Activity;
  /** ticked by the person in the "things to be careful about" step */
  flags: { pregnant: boolean; edHistory: boolean; medical: boolean };
}

export const LIMITS = {
  minAge: 18,
  height: { min: 120, max: 220 },
  weight: { min: 30, max: 250 },
  /** do not aim below this BMI (Asian cut-offs: under 18.5 is underweight) */
  minTargetBmi: 20,
  /** a gain goal stops here (25 is where Asian "obese" starts) */
  maxTargetBmi: 24.9,
  /** kcal per kg of body weight change — the usual rule of thumb */
  kcalPerKg: 7700,
  /** the deficit never exceeds this share of daily need */
  maxDeficitShare: 0.25,
  maxSurplus: 500,
  floors: { female: 1200, male: 1500, other: 1350 },
  seniorAge: 65,
} as const;

export const PACE_KG_PER_WEEK: Record<Pace, number> = {
  gentle: 0.25,
  standard: 0.5,
};
const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};
const ACTIVE_MINUTES: Record<Activity, number> = {
  sedentary: 20,
  light: 30,
  moderate: 35,
  active: 45,
};

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** Asia-Pacific cut-offs (the same ones the body scan uses). */
export function bmiBand(
  value: number,
): "underweight" | "normal" | "overweight" | "obese" {
  if (value < 18.5) return "underweight";
  if (value < 23) return "normal";
  if (value < 25) return "overweight";
  return "obese";
}

/** The weight (kg, one decimal) that gives a BMI at this height. */
export function weightForBmi(value: number, heightCm: number): number {
  const m = heightCm / 100;
  return Math.round(value * m * m * 10) / 10;
}

/** Mifflin–St Jeor; when sex is not given, the midpoint of the two constants. */
export function bmr(
  i: Pick<WeightIntake, "sex" | "age" | "heightCm" | "weightKg">,
): number {
  const base = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age;
  const k = i.sex === "male" ? 5 : i.sex === "female" ? -161 : -78;
  return Math.round(base + k);
}

export function tdee(i: WeightIntake): number {
  return Math.round(bmr(i) * ACTIVITY_FACTOR[i.activity]);
}

export type WeightNote =
  | "minor"
  | "pregnant"
  | "ed_history"
  | "underweight"
  | "target_missing"
  | "target_direction"
  | "target_low"
  | "target_high"
  | "medical_caution"
  | "senior_caution"
  | "already_normal"
  | "floor_applied"
  | "long_horizon"
  | "invalid_body";

export type WeightStatus = "ok" | "caution" | "blocked" | "fix";

export interface WeightAssessment {
  status: WeightStatus;
  notes: WeightNote[];
  /** a calorie number may be shown (never for an eating-disorder history or under 18) */
  showCalories: boolean;
  /** the pace actually allowed (may be gentler than asked) */
  pace: Pace;
  /** kg bounds a target may take for this height and direction, when it needs fixing */
  targetRange: { min: number; max: number } | null;
}

export function validBody(i: WeightIntake): boolean {
  return (
    Number.isFinite(i.age) &&
    i.age >= 10 &&
    i.age <= 110 &&
    i.heightCm >= LIMITS.height.min &&
    i.heightCm <= LIMITS.height.max &&
    i.weightKg >= LIMITS.weight.min &&
    i.weightKg <= LIMITS.weight.max &&
    (i.targetKg === null ||
      (i.targetKg >= LIMITS.weight.min && i.targetKg <= LIMITS.weight.max))
  );
}

/** Whether this goal can be offered, and with what warnings. Pure. */
export function assessWeightGoal(i: WeightIntake): WeightAssessment {
  const notes: WeightNote[] = [];
  const blocked = (
    n: WeightNote[],
    showCalories = false,
  ): WeightAssessment => ({
    status: "blocked",
    notes: n,
    showCalories,
    pace: "gentle",
    targetRange: null,
  });
  if (!validBody(i)) return blocked(["invalid_body"]);
  if (i.age < LIMITS.minAge) return blocked(["minor"]);
  if (i.flags.pregnant) return blocked(["pregnant"]);
  if (i.flags.edHistory) return blocked(["ed_history"]);

  const now = bmi(i.weightKg, i.heightCm);
  const band = bmiBand(now);
  if (i.direction === "lose" && band === "underweight")
    return blocked(["underweight"], true);
  if (i.direction === "gain" && band === "obese")
    return blocked(["target_high"], true);

  let pace = i.pace;
  let status: WeightStatus = "ok";
  if (i.flags.medical) {
    notes.push("medical_caution");
    pace = "gentle";
    status = "caution";
  }
  if (i.age >= LIMITS.seniorAge) {
    notes.push("senior_caution");
    pace = "gentle";
    status = "caution";
  }
  if (i.direction === "lose" && band === "normal") {
    notes.push("already_normal");
    pace = "gentle";
    status = "caution";
  }

  let targetRange: WeightAssessment["targetRange"] = null;
  if (i.direction !== "maintain") {
    const lo = weightForBmi(LIMITS.minTargetBmi, i.heightCm);
    const hi = weightForBmi(LIMITS.maxTargetBmi, i.heightCm);
    if (i.targetKg === null) {
      notes.push("target_missing");
      status = "fix";
    } else if (
      (i.direction === "lose" && i.targetKg >= i.weightKg) ||
      (i.direction === "gain" && i.targetKg <= i.weightKg)
    ) {
      notes.push("target_direction");
      status = "fix";
    } else if (i.direction === "lose" && i.targetKg < lo) {
      notes.push("target_low");
      status = "fix";
      targetRange = { min: lo, max: i.weightKg };
    } else if (i.direction === "gain" && i.targetKg > hi) {
      notes.push("target_high");
      status = "fix";
      targetRange = { min: i.weightKg, max: hi };
    }
  }
  return { status, notes, showCalories: true, pace, targetRange };
}

export interface WeightTargets {
  kcal: number;
  /** daily need estimate the target was built from */
  tdee: number;
  /** signed: negative = deficit */
  dailyBalance: number;
  proteinG: number | null;
  carbsG: number;
  fatG: number;
  waterMl: number | null;
  activeMinutes: number;
  /** whole weeks to reach the target at the allowed pace; null for maintenance */
  weeks: number | null;
  /** kg per week the plan really aims for (signed) */
  kgPerWeek: number;
  floorApplied: boolean;
  notes: WeightNote[];
}

const floorFor = (sex: Sex | null): number =>
  sex === "female"
    ? LIMITS.floors.female
    : sex === "male"
      ? LIMITS.floors.male
      : LIMITS.floors.other;

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/**
 * Daily targets from an intake that `assessWeightGoal` allowed. Returns null when the goal is
 * blocked or needs fixing, or when no calorie number may be shown.
 */
export function weightTargets(i: WeightIntake): WeightTargets | null {
  const a = assessWeightGoal(i);
  if (a.status === "blocked" || a.status === "fix" || !a.showCalories)
    return null;
  const need = tdee(i);
  const notes = [...a.notes];
  let balance = 0;
  if (i.direction === "lose")
    balance = -Math.min(
      Math.round((PACE_KG_PER_WEEK[a.pace] * LIMITS.kcalPerKg) / 7),
      Math.round(need * LIMITS.maxDeficitShare),
    );
  if (i.direction === "gain")
    balance = Math.min(
      Math.round((PACE_KG_PER_WEEK[a.pace] * LIMITS.kcalPerKg) / 7),
      LIMITS.maxSurplus,
    );
  let kcal = roundTo(need + balance, 10);
  let floorApplied = false;
  const floor = floorFor(i.sex);
  if (i.direction === "lose" && kcal < floor) {
    kcal = floor;
    balance = kcal - need;
    floorApplied = true;
    notes.push("floor_applied");
  }
  const kgPerWeek = Math.round(((balance * 7) / LIMITS.kcalPerKg) * 100) / 100;
  let weeks: number | null = null;
  if (i.direction !== "maintain" && i.targetKg !== null && kgPerWeek !== 0) {
    weeks = Math.ceil(Math.abs(i.targetKg - i.weightKg) / Math.abs(kgPerWeek));
    if (weeks > 52) notes.push("long_horizon");
  }

  // Protein is left out when a medical condition was ticked (kidney disease changes the advice).
  const proteinG = i.flags.medical
    ? null
    : Math.round(
        Math.min(
          130,
          Math.max(50, i.weightKg * (i.direction === "maintain" ? 1 : 1.3)),
          (kcal * 0.35) / 4,
        ),
      );
  const fatG = Math.round((kcal * 0.28) / 9);
  const carbsG = Math.max(
    0,
    Math.round(
      (kcal - (proteinG ?? Math.round((kcal * 0.18) / 4)) * 4 - fatG * 9) / 4,
    ),
  );
  return {
    kcal,
    tdee: need,
    dailyBalance: balance,
    proteinG,
    carbsG,
    fatG,
    // with a heart or kidney condition fluids may be limited by the doctor: no number
    waterMl: i.flags.medical
      ? null
      : Math.min(3000, Math.max(1500, roundTo(i.weightKg * 33, 250))),
    activeMinutes: ACTIVE_MINUTES[i.activity],
    weeks,
    kgPerWeek,
    floorApplied,
    notes,
  };
}

/** Least-squares slope of weight (kg per week) over dated weigh-ins; null with too little to say. */
export function weightTrend(
  points: readonly { date: string; kg: number }[],
): { kgPerWeek: number; first: number; last: number } | null {
  if (points.length < 3) return null;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = Date.parse(`${sorted[0].date}T00:00:00Z`);
  const days = (d: string) => (Date.parse(`${d}T00:00:00Z`) - t0) / 86_400_000;
  const span = days(sorted[sorted.length - 1].date);
  if (span < 7) return null;
  const n = sorted.length;
  const xs = sorted.map((p) => days(p.date));
  const ys = sorted.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let k = 0; k < n; k++) {
    num += (xs[k] - mx) * (ys[k] - my);
    den += (xs[k] - mx) ** 2;
  }
  if (den === 0) return null;
  return {
    kgPerWeek: Math.round((num / den) * 7 * 100) / 100,
    first: ys[0],
    last: ys[n - 1],
  };
}
