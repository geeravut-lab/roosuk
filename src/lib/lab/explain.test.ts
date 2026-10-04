import { describe, expect, it } from "vitest";
import {
  explainPrompt,
  explainSystemPrompt,
  normalizeExplanation,
  parseStoredExplanation,
} from "./explain";
import type { LabItem } from "./lab";

const item = (o: Partial<LabItem>): LabItem => ({
  name: "FBS",
  marker_key: "fasting_glucose",
  value: 104,
  unit: "mg/dL",
  value_std: 104,
  status: "watch",
  basis: "catalog",
  printed_range: "70-99",
  confidence: 0.9,
  ...o,
});
const items = [
  item({}),
  item({
    name: "LDL",
    marker_key: "ldl",
    value: 170,
    value_std: 170,
    status: "abnormal",
  }),
  item({
    name: "HbA1c",
    marker_key: "hba1c",
    value: 5.3,
    unit: "%",
    value_std: 5.3,
    status: "normal",
  }),
];
const good = {
  summary:
    "ภาพรวมส่วนใหญ่อยู่ในช่วงทั่วไป มีสองค่าที่ควรพูดคุยกับแพทย์เพื่อแปลผล",
  items: [
    {
      marker_key: "fasting_glucose",
      text: "ค่านี้วัดน้ำตาลในเลือดหลังอดอาหาร สูงกว่าช่วงทั่วไปเล็กน้อย ควรติดตามต่อ",
    },
    {
      marker_key: "ldl",
      text: "ค่านี้คือไขมันชนิดที่มักเรียกว่าไขมันเลว สูงกว่าช่วงทั่วไป ควรปรึกษาแพทย์",
    },
  ],
  see_doctor: false,
};

describe("normalizeExplanation", () => {
  it("keeps a clean explanation and notes for out-of-range markers only", () => {
    const r = normalizeExplanation(good, items)!;
    expect(r.summary).toContain("ภาพรวม");
    expect(Object.keys(r.items).sort()).toEqual(["fasting_glucose", "ldl"]);
  });
  it("ignores notes for normal markers, unknown markers and duplicates", () => {
    const r = normalizeExplanation(
      {
        ...good,
        items: [
          {
            marker_key: "hba1c",
            text: "ค่านี้ปกติ ไม่มีอะไรต้องกังวลเป็นพิเศษ",
          },
          {
            marker_key: "made_up",
            text: "ข้อความของรายการที่ไม่มีอยู่ในรายงาน",
          },
          ...good.items,
          {
            marker_key: "ldl",
            text: "ข้อความซ้ำของไขมัน LDL ที่ไม่ควรถูกนำมาใช้",
          },
        ],
      },
      items,
    )!;
    expect(Object.keys(r.items).sort()).toEqual(["fasting_glucose", "ldl"]);
    expect(r.items.ldl).toContain("ไขมันเลว");
  });
  it("always says see a doctor when any value is abnormal, whatever the model says", () => {
    expect(normalizeExplanation(good, items)!.seeDoctor).toBe(true);
    const onlyWatch = [items[0], items[2]];
    expect(normalizeExplanation(good, onlyWatch)!.seeDoctor).toBe(false);
    expect(
      normalizeExplanation({ ...good, see_doctor: true }, onlyWatch)!.seeDoctor,
    ).toBe(true);
  });
  it("drops a single note that breaks the guardrails but keeps the rest", () => {
    const r = normalizeExplanation(
      {
        ...good,
        items: [
          { marker_key: "ldl", text: "คุณเป็นโรคหัวใจแน่นอน ต้องกินยาทุกวัน" },
          good.items[0],
        ],
      },
      items,
    )!;
    expect(Object.keys(r.items)).toEqual(["fasting_glucose"]);
  });
  it("gives no explanation at all when the summary breaks the guardrails or is unusable", () => {
    expect(
      normalizeExplanation(
        { ...good, summary: "คุณเป็นเบาหวานแน่นอน ควรหยุดกินยา" },
        items,
      ),
    ).toBeNull();
    expect(
      normalizeExplanation({ ...good, summary: "สั้น" }, items),
    ).toBeNull();
    expect(
      normalizeExplanation({ ...good, summary: "x".repeat(1501) }, items),
    ).toBeNull();
    expect(normalizeExplanation(null, items)).toBeNull();
    expect(normalizeExplanation("text", items)).toBeNull();
  });
  it("tolerates missing items or see_doctor", () => {
    const r = normalizeExplanation({ summary: good.summary }, items)!;
    expect(r.items).toEqual({});
  });
  it("round-trips through jsonb", () => {
    const r = normalizeExplanation(good, items)!;
    expect(parseStoredExplanation(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(parseStoredExplanation({ summary: 1 })).toBeNull();
    expect(parseStoredExplanation(null)).toBeNull();
  });
});

describe("prompts", () => {
  it("states the statuses the app decided and the references, without identity", () => {
    const p = explainPrompt(items, "age 40-44; sex: female");
    expect(p).toContain("status=abnormal");
    expect(p).toContain("general reference 70–99 mg/dL");
    expect(p).not.toMatch(/@|email/);
  });
  it("forbids contradicting statuses, diagnosing and medicine advice", () => {
    const s = explainSystemPrompt("th");
    expect(s).toMatch(/Never contradict or change it/);
    expect(s).toMatch(/never diagnose/);
    expect(s).toMatch(/never give a medicine dose/);
    expect(s).toMatch(/Thai/);
  });
});
