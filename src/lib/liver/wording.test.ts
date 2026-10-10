import { describe, expect, it } from "vitest";
import { dict, fmt, type Dict, type Lang } from "@/lib/i18n/dict";
import { assessLiver, type LabPanel, type LabValue } from "./engine";
import { HEP_B, HEP_C, RED_FLAGS, type LiverAnswers } from "./questionnaire";
import { allResultText, buildResultView } from "./view";

/**
 * Wording guard for the Liver Health module. The module screens and navigates,
 * it never diagnoses: no sentence may tell a person what they "have", declare a
 * healthy liver, or advise a medicine / herb. These tests scan EVERY liver string
 * in both languages and every result the engine can produce.
 */
const LIVER_KEY =
  /^(liver|err_liver|flag_liver|navLiver|passportSection(Hint)?_liver)/;

const FORBIDDEN: { why: string; re: RegExp }[] = [
  { why: "says 'is a disease'", re: /เป็นโรค/ },
  { why: "'diagnosed that'", re: /วินิจฉัยว่า/ },
  { why: "names cirrhosis", re: /ตับแข็ง/ },
  {
    why: "tells the person they have a condition",
    re: /คุณ(เป็น|มี)(โรค|ไขมันพอกตับ|ไขมันในตับ|ตับอักเสบ|ไวรัสตับ|พังผืด|มะเร็ง|ตับ)/,
  },
  {
    why: "declares the liver healthy",
    re: /ตับ(ของคุณ)?(ปกติ|แข็งแรง|ดีแล้ว)/,
  },
  { why: "'no disease / no risk'", re: /ไม่มีโรค|ไม่เป็นอะไร|ไม่มีความเสี่ยง/ },
  {
    why: "medicine / herb advice",
    re: /หยุดยา|หยุดกิน|ควรกิน|ควรรับประทาน|แนะนำให้(กิน|ทาน|ใช้ยา)|ซิลิมาริน|ขมิ้น|ดีท็อกซ์|ยาบำรุงตับ/,
  },
  { why: "names cirrhosis (en)", re: /cirrhosis/i },
  {
    why: "tells the person they have a condition (en)",
    re: /you (have|are suffering from|suffer from) (fatty liver|fibrosis|hepatitis|liver disease|a liver (disease|condition)|cancer)/i,
  },
  {
    why: "diagnosis claim (en)",
    re: /you (are|were|have been) diagnosed|diagnosed with|your diagnosis/i,
  },
  {
    why: "declares the liver healthy (en)",
    re: /your liver is (healthy|normal|fine|in good)|liver is (healthy|normal)/i,
  },
  {
    why: "'no disease' (en)",
    re: /no (liver )?disease|you are (healthy|fine)|nothing wrong/i,
  },
  {
    why: "medicine / herb advice (en)",
    re: /stop taking|you should (take|eat|drink|use)|milk thistle|detox/i,
  },
];

const liverEntries = (lang: Lang) =>
  Object.entries(dict[lang]).filter(([k]) => LIVER_KEY.test(k));

describe("every liver string, in both languages", () => {
  for (const lang of ["th", "en"] as const)
    it(`contains no diagnostic claim, healthy-liver claim or medicine advice (${lang})`, () => {
      const entries = liverEntries(lang);
      expect(entries.length).toBeGreaterThan(100);
      for (const [key, text] of entries)
        for (const f of FORBIDDEN)
          expect(f.re.test(text), `${lang}.${key} ${f.why}: "${text}"`).toBe(
            false,
          );
    });

  it("has the same {placeholders} in Thai and English", () => {
    const names = (s: string) =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, th] of liverEntries("th"))
      expect(names(dict.en[key as keyof Dict]), key).toEqual(names(th));
  });

  it("the mandatory notice is the design document's wording", () => {
    expect(dict.th.liverDisclaimer).toBe(
      "นี่เป็นการประเมินความเสี่ยงเบื้องต้นจากข้อมูลที่คุณให้เท่านั้น ไม่ใช่การวินิจฉัยโรค โปรดปรึกษาแพทย์เพื่อตรวจและรักษาที่เหมาะสม",
    );
    expect(dict.en.liverDisclaimer).toMatch(/not a diagnosis/i);
  });

  it("the guard itself catches what it should", () => {
    const hit = (s: string) => FORBIDDEN.some((f) => f.re.test(s));
    for (const bad of [
      "คุณเป็นโรคไขมันพอกตับ",
      "คุณมีไขมันพอกตับ",
      "ผลบ่งชี้ว่าเป็นตับแข็ง",
      "ตับของคุณปกติ",
      "ตับแข็งระยะต้น",
      "ควรกินซิลิมาริน",
      "แนะนำให้หยุดยา",
      "You have fatty liver",
      "You were diagnosed with cirrhosis",
      "Your liver is healthy",
      "Stop taking your medicine",
    ])
      expect(hit(bad), bad).toBe(true);
    for (const fine of [
      "ไม่ใช่การวินิจฉัยโรค",
      "ควรพบแพทย์เพื่อตรวจประเมินเพิ่มเติม",
      "This is not a diagnosis",
      "Do you have diabetes?",
    ])
      expect(hit(fine), fine).toBe(false);
  });
});

// ── every result the engine can produce ────────────────────────────────────
const base: LiverAnswers = {
  redFlags: [],
  birthYear: 1975,
  sex: "female",
  heightCm: 160,
  weightKg: 70,
  waistCm: 92,
  diabetes: "no",
  hypertension: "no",
  dyslipidemia: "no",
  history: [],
  familyLiver: "no",
  hepB: "never_tested",
  hepC: "unknown",
  alcohol: "none",
  meds: "no",
  symptoms: [],
};
const v = (value: number, status: LabValue["status"] = "normal"): LabValue => ({
  value,
  status,
});
const PANELS: Record<string, LabPanel[]> = {
  none: [],
  normal: [
    {
      date: "2026-09-20",
      values: {
        alt: v(25),
        ast: v(24),
        platelets: v(250),
        albumin: v(4.4),
        ggt: v(30),
        triglycerides: v(120),
      },
    },
  ],
  out: [
    {
      date: "2026-09-20",
      values: { alt: v(70, "watch"), ast: v(50, "watch"), platelets: v(180) },
    },
  ],
  fib: [
    {
      date: "2026-09-20",
      values: {
        alt: v(40),
        ast: v(90, "abnormal"),
        platelets: v(100, "watch"),
      },
    },
  ],
  severe: [
    {
      date: "2026-09-20",
      values: { alt: v(900, "abnormal"), total_bilirubin: v(6, "abnormal") },
    },
  ],
  odd: [
    {
      date: "2026-09-20",
      values: { alt: v(25), ast: v(24), platelets: v(250000) },
    },
  ],
};

function* situations() {
  const slim = {
    heightCm: 170,
    weightKg: 62,
    waistCm: 75,
    sex: "male",
  } as const;
  for (const [name, panels] of Object.entries(PANELS))
    for (const body of [{}, slim])
      for (const hepB of HEP_B)
        for (const hepC of HEP_C)
          for (const symptoms of [
            [],
            ["fatigue"],
            ["itching", "weight_loss"],
          ] as LiverAnswers["symptoms"][])
            for (const flags of [
              [],
              ...RED_FLAGS.map((f) => [f]),
            ] as LiverAnswers["redFlags"][])
              yield {
                name,
                answers: {
                  ...base,
                  ...body,
                  hepB,
                  hepC,
                  symptoms,
                  redFlags: flags,
                  birthYear: body === slim ? 1999 : base.birthYear,
                } satisfies LiverAnswers,
                panels,
              };
}

describe("every result the engine can produce", () => {
  const seenLevels = new Set<number>();
  let count = 0;
  for (const lang of ["th", "en"] as const) {
    it(`reads safely and carries the notice (${lang})`, () => {
      const t = dict[lang];
      const problems: string[] = [];
      const texts = new Set<string>();
      for (const s of situations()) {
        const result = assessLiver({
          today: "2026-10-10",
          answers: s.answers,
          panels: s.panels,
        });
        const view = buildResultView(result, t, lang);
        seenLevels.add(result.level);
        count++;
        // 1. the mandatory notice and the "finding nothing proves nothing" line, on every result
        if (view.disclaimer !== t.liverDisclaimer) problems.push("disclaimer");
        if (view.notRuledOut !== t.liverNotRuledOut)
          problems.push("notRuledOut");
        // 2. a next step, always
        if (view.cta.length < 10 || view.title.length < 5)
          problems.push("cta/title");
        // 3. the 1669 button only with an emergency, and the emergency always names 1669
        if (view.emergency !== (result.urgency === "emergency"))
          problems.push("emergency flag");
        if (view.emergency && !/1669/.test(view.cta))
          problems.push("emergency cta");
        if (result.level === 3 && !/1669|hospital|โรงพยาบาล/.test(view.cta))
          problems.push("level 3 cta");
        for (const text of allResultText(view)) texts.add(text);
      }
      expect(problems).toEqual([]);
      // 4. no raw keys or unfilled placeholders, nothing empty
      for (const text of texts) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text, text).not.toMatch(/\{\w+\}|undefined|\bliver[A-Z]\w+_/);
      }
      // 5. nothing diagnostic or medicinal
      const bad: string[] = [];
      for (const text of texts)
        for (const f of FORBIDDEN)
          if (f.re.test(text)) bad.push(`${f.why}: ${text}`);
      expect(bad).toEqual([]);
    });
  }
  it("covered all four levels", () => {
    expect([...seenLevels].sort()).toEqual([0, 1, 2, 3]);
    expect(count).toBeGreaterThan(1000);
  });
  it("an urgent result says 'soon' for a severe lab and 'emergency' for a red flag", () => {
    const t = dict.en;
    const soon = buildResultView(
      assessLiver({
        today: "2026-10-10",
        answers: base,
        panels: PANELS.severe,
      }),
      t,
      "en",
    );
    expect(soon.level).toBe(3);
    expect(soon.emergency).toBe(false);
    expect(soon.title).toBe(t.liverUrgent_soon_title);
    const emergency = buildResultView(
      assessLiver({
        today: "2026-10-10",
        answers: { ...base, redFlags: ["jaundice"] },
        panels: [],
      }),
      t,
      "en",
    );
    expect(emergency.emergency).toBe(true);
    expect(emergency.title).toBe(t.liverUrgent_emergency_title);
  });
  it("names the tests behind a lab reason, in the reader's language", () => {
    const r = assessLiver({
      today: "2026-10-10",
      answers: base,
      panels: PANELS.out,
    });
    const th = buildResultView(r, dict.th, "th").reasons.join(" ");
    expect(th).toContain("ALT");
    expect(fmt("{markers}", { markers: "x" })).toBe("x");
  });
});
