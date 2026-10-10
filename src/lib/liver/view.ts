import { biomarkerByKey } from "@/config/biomarkers";
import { fmt, type Dict, type Lang } from "@/lib/i18n/dict";
import type { LiverResult, LiverMarker, Reason } from "./engine";
import type { ScoreName, ScoreResult } from "./scores";

/**
 * Result → words. The engine stores codes; this is the ONLY place a level
 * becomes a sentence, and it is built so that every result carries (1) what to
 * do next, never what the person "has", (2) the mandatory "this is not a
 * diagnosis" notice, and (3) the reminder that finding nothing does not confirm
 * a healthy liver. The wording-guard test runs every level through it.
 */
export interface ScoreLine {
  name: ScoreName;
  title: string;
  what: string;
  /** "1.52" or null when no number could be made */
  valueText: string | null;
  /** band wording, or the "missing …" / "implausible …" explanation */
  meaning: string;
  notes: string[];
  band: "low" | "intermediate" | "high" | null;
}

export interface ResultView {
  level: 0 | 1 | 2 | 3;
  urgency: LiverResult["urgency"];
  /** show the 1669 button */
  emergency: boolean;
  levelShort: string;
  title: string;
  body: string;
  cta: string;
  reasons: string[];
  factors: string[];
  scores: ScoreLine[];
  gaps: string[];
  questions: string[];
  notRuledOut: string;
  disclaimer: string;
}

export const markerName = (key: LiverMarker, lang: Lang): string => {
  const m = biomarkerByKey(key);
  return m ? (lang === "th" ? m.th : m.en) : key;
};

const SCORES: ScoreName[] = ["fib4", "apri", "nfs", "fli"];

/** A name the user can read for an input a score is missing (a test, or one of their own answers). */
function inputName(raw: string, t: Dict, lang: Lang): string {
  const own = t[`liverInput_${raw}` as keyof Dict];
  if (own) return own;
  return biomarkerByKey(raw) ? markerName(raw as LiverMarker, lang) : raw;
}

export function reasonText(r: Reason, t: Dict, lang: Lang): string {
  const base = t[`liverReason_${r.code}` as keyof Dict] ?? r.code;
  return fmt(base, {
    markers: (r.markers ?? []).map((m) => markerName(m, lang)).join(", "),
  });
}

function scoreLine(
  name: ScoreName,
  s: ScoreResult,
  t: Dict,
  lang: Lang,
): ScoreLine {
  const title = t[`liverScore_${name}_name` as keyof Dict];
  const what = t[`liverScore_${name}_what` as keyof Dict];
  if (s.status === "ok")
    return {
      name,
      title,
      what,
      valueText: String(s.value),
      meaning: t[`liverBand_${name}_${s.band}` as keyof Dict],
      notes:
        name === "fib4" && s.ageNote
          ? [s.ageNote === "over65" ? t.liverFib4Over65 : t.liverFib4Under35]
          : [],
      band: s.band,
    };
  if (s.status === "insufficient")
    return {
      name,
      title,
      what,
      valueText: null,
      meaning: fmt(t.liverScoreInsufficient, {
        missing: s.missing.map((m) => inputName(m, t, lang)).join(", "),
      }),
      notes: [],
      band: null,
    };
  return {
    name,
    title,
    what,
    valueText: null,
    meaning: fmt(t.liverScoreInvalid, {
      fields: s.fields.map((m) => inputName(m, t, lang)).join(", "),
    }),
    notes: [],
    band: null,
  };
}

export function buildResultView(
  r: LiverResult,
  t: Dict,
  lang: Lang,
): ResultView {
  const urgent = r.level === 3;
  const key = urgent
    ? `liverUrgent_${r.urgency === "emergency" ? "emergency" : "soon"}`
    : `liverLevel_${r.level}`;
  return {
    level: r.level,
    urgency: r.urgency,
    emergency: r.urgency === "emergency",
    levelShort: t[`liverLevelShort_${r.level}` as keyof Dict],
    title: t[`${key}_title` as keyof Dict],
    body:
      t[`${key}_body` as keyof Dict] ??
      t[`liverLevel_${r.level}_body` as keyof Dict],
    cta: t[`${key}_cta` as keyof Dict],
    reasons: r.reasons.map((x) => reasonText(x, t, lang)),
    factors: r.factors.map((f) => t[`liverFactor_${f}` as keyof Dict]),
    // a score row is shown only when it has a number or is one of the two main ones with a reason
    scores: SCORES.map((n) => scoreLine(n, r.scores[n], t, lang)).filter(
      (s) => s.valueText !== null || s.name === "fib4" || s.name === "apri",
    ),
    gaps: r.gaps.map((g) => t[`liverGap_${g}` as keyof Dict]),
    questions: r.doctorQuestions.map((q) => t[`liverQ_${q}` as keyof Dict]),
    notRuledOut: t.liverNotRuledOut,
    disclaimer: t.liverDisclaimer,
  };
}

/** Every sentence a result shows, flattened — for the wording guard. */
export function allResultText(v: ResultView): string[] {
  return [
    v.levelShort,
    v.title,
    v.body,
    v.cta,
    ...v.reasons,
    ...v.factors,
    ...v.scores.flatMap((s) => [s.title, s.what, s.meaning, ...s.notes]),
    ...v.gaps,
    ...v.questions,
    v.notRuledOut,
    v.disclaimer,
  ];
}
