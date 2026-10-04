import { describe, expect, it } from "vitest";
import { computeHealthScore } from "@/lib/health/score";
import { parseModelAnswer, finalizeAnswer, LOW_CONFIDENCE } from "./answer";
import { buildContext, chatSystemPrompt } from "./context";
import { screenMessage, violatesAnswerGuardrails } from "./safety";

describe("screenMessage", () => {
  it("escalates emergencies in Thai and English", () => {
    for (const m of [
      "ปวดหน้าอกมากและหายใจไม่ออก",
      "แขนขาอ่อนแรงกะทันหัน ปากเบี้ยว",
      "พ่อหมดสติไปแล้ว",
      "ลูกชักเกร็งอยู่ตอนนี้",
      "I have chest pain and can't breathe",
      "my friend had a seizure",
      "กินยาเกินขนาดไปแล้ว",
      "อาเจียนเป็นเลือด",
    ])
      expect(screenMessage(m), m).toBe("medical_emergency");
  });
  it("escalates self-harm first, in both languages", () => {
    for (const m of [
      "อยากตายไปเลย",
      "คิดจะฆ่าตัวตาย",
      "I want to die",
      "thinking about suicide",
    ])
      expect(screenMessage(m), m).toBe("self_harm");
    // both present: the person needs support first
    expect(screenMessage("อยากตาย และปวดหน้าอก")).toBe("self_harm");
  });
  it("leaves ordinary questions alone, including Thai words that merely contain a trigger", () => {
    for (const m of [
      "ผลน้ำตาลของฉัน 104 หมายความว่าอะไร",
      "ควรเดินวันละกี่นาที",
      "ชักชวนเพื่อนไปออกกำลังกายยังไงดี",
      "ตื่นเช้าแล้วรู้สึกเหนื่อยทำอย่างไรดี",
      "what does HbA1c mean",
      "how much sleep do I need",
    ])
      expect(screenMessage(m), m).toBeNull();
  });
});

describe("violatesAnswerGuardrails", () => {
  it("blocks doses, stop/change-medicine advice and diagnoses", () => {
    for (const a of [
      "ลองกินพาราเซตามอล 500 mg ทุก 6 ชั่วโมง",
      "คุณควรหยุดกินยาความดันได้เลย",
      "ลดขนาดยาลงครึ่งหนึ่งจะดีขึ้น",
      "ทานวันละ 2 เม็ดหลังอาหาร",
      "คุณเป็นเบาหวานแน่นอน",
      "คุณน่าจะเป็นโรคไต",
      "You should stop taking your medication for a week",
      "Take 2 tablets after dinner",
      "You have diabetes",
      "I diagnose this as anaemia",
    ])
      expect(violatesAnswerGuardrails(a), a).toBe(true);
  });
  it("lets the SAFE phrasing through: negated advice, conditions, and refusing to diagnose", () => {
    for (const a of [
      "ไม่ควรหยุดยาลดความดันด้วยตัวเอง ควรปรึกษาแพทย์ก่อน",
      "ขอแนะนำอย่างยิ่งว่าไม่ควรหยุดยาลดความดันด้วยตัวเองนะคะ",
      "หากหยุดยาเองกะทันหันอาจทำให้ความดันพุ่งสูงขึ้นได้",
      "ไม่แนะนำให้หยุดยาหรือปรับลดขนาดยาด้วยตัวเองเด็ดขาดนะคะ แม้ความดันจะปกติ",
      "การปรับเปลี่ยนยาต้องอยู่ในความดูแลของแพทย์ ไม่ควรลดขนาดยาเอง",
      "การหยุดยาเองอาจเป็นอันตราย ควรถามแพทย์ก่อน",
      "ห้ามเพิ่มขนาดยาเองโดยไม่ปรึกษาเภสัชกร",
      "ฉันไม่สามารถวินิจฉัยได้ว่าคุณเป็นเบาหวานหรือไม่ ต้องให้แพทย์ประเมิน",
      "ค่านี้ไม่ได้หมายความว่าคุณเป็นเบาหวาน แต่ควรติดตาม",
      "Please do not stop taking your medication without asking your doctor",
      "I cannot tell whether you have diabetes; only a doctor can diagnose that",
      "If you stop your medication suddenly your blood pressure may rise",
    ])
      expect(violatesAnswerGuardrails(a), a).toBe(false);
  });
  it("still blocks the unsafe phrasing, even next to a polite opening", () => {
    for (const a of [
      "ตอนนี้ความดันปกติแล้ว หยุดยาได้เลยค่ะ",
      "ถ้าความดันปกติแล้วคุณหยุดยาได้เลย",
      "ไม่ต้องกังวลนะคะ คุณเป็นเบาหวานแน่นอน",
      "ไม่ต้องห่วง คุณหยุดยาได้เลย",
      "ไม่แนะนำให้กังวลนะคะ คุณหยุดยาได้เลย",
      "ฉันคิดว่าคุณเป็นเบาหวานนะคะ",
      "ดูจากผลแล้วบอกได้ว่าคุณน่าจะเป็นโรคไต",
      "You can stop your medication now that it is normal",
      "Don't worry, you have diabetes",
    ])
      expect(violatesAnswerGuardrails(a), a).toBe(true);
  });
  it("lets explanations through: lab units, disease names in general, advice to see a doctor", () => {
    for (const a of [
      "ค่าน้ำตาล 104 mg/dL สูงกว่าช่วงอ้างอิงทั่วไปเล็กน้อย ควรติดตามและปรึกษาแพทย์",
      "เบาหวานคือภาวะที่ร่างกายจัดการน้ำตาลในเลือดได้ไม่ดี",
      "ถ้ากินยาประจำอยู่ ให้ถามแพทย์หรือเภสัชกรก่อนปรับเปลี่ยนใด ๆ",
      "HbA1c reflects your average blood sugar over about three months (5.3 %)",
      "Your LDL of 170 mg/dL is above the general range; a doctor can tell you what it means for you",
    ])
      expect(violatesAnswerGuardrails(a), a).toBe(false);
  });
});

describe("parseModelAnswer / finalizeAnswer", () => {
  const ok = {
    answer: "คำตอบทั่วไปที่เป็นประโยชน์",
    urgency: "routine",
    confidence: 0.9,
  };
  it("parses a clean answer and tolerates bad urgency or confidence", () => {
    expect(parseModelAnswer(ok)).toEqual({
      answer: ok.answer,
      urgency: "routine",
      confidence: 0.9,
    });
    expect(
      parseModelAnswer({ ...ok, urgency: "whatever", confidence: "x" }),
    ).toMatchObject({ urgency: "routine", confidence: 0.5 });
    expect(parseModelAnswer({ ...ok, confidence: 7 })!.confidence).toBe(1);
  });
  it("rejects empty, missing or non-object output", () => {
    for (const bad of [
      null,
      "text",
      {},
      { answer: "" },
      { answer: "   " },
      { urgency: "routine" },
    ])
      expect(parseModelAnswer(bad)).toBeNull();
  });
  it("passes a normal answer through unflagged", () => {
    expect(finalizeAnswer(parseModelAnswer(ok)!)).toEqual({
      text: ok.answer,
      replace: null,
      flag: null,
    });
  });
  it("replaces the answer when the model claims an emergency or breaks a guardrail", () => {
    expect(
      finalizeAnswer(parseModelAnswer({ ...ok, urgency: "emergency" })!),
    ).toMatchObject({ replace: "emergency", flag: "emergency", text: "" });
    expect(
      finalizeAnswer(
        parseModelAnswer({ ...ok, answer: "คุณเป็นเบาหวานแน่นอน" })!,
      ),
    ).toMatchObject({ replace: "guardrail", flag: "guardrail" });
    // an emergency outranks everything else
    expect(
      finalizeAnswer({
        answer: "คุณเป็นเบาหวาน",
        urgency: "emergency",
        confidence: 1,
      }).replace,
    ).toBe("emergency");
  });
  it("keeps but flags see-a-doctor and low-confidence answers", () => {
    expect(
      finalizeAnswer(parseModelAnswer({ ...ok, urgency: "see_doctor_soon" })!),
    ).toMatchObject({ replace: null, flag: "see_doctor" });
    expect(
      finalizeAnswer(
        parseModelAnswer({ ...ok, confidence: LOW_CONFIDENCE - 0.1 })!,
      ),
    ).toMatchObject({ replace: null, flag: "low_confidence" });
  });
});

describe("buildContext / chatSystemPrompt", () => {
  it("states when there is no data instead of leaving gaps", () => {
    const text = buildContext({
      profileText: "no profile information",
      score: computeHealthScore([], "2026-10-10"),
      labs: [],
    });
    expect(text).toContain("no check-ins yet");
    expect(text).toContain("none saved");
  });
  it("lists labs with the code-decided status and reference, and carries no identity", () => {
    const text = buildContext({
      profileText: "age 40-44; sex: female",
      score: computeHealthScore(
        [
          {
            checkin_date: "2026-10-10",
            sleep_band: 3,
            activity_band: 3,
            energy: 4,
            mood: 4,
            nutrition: 4,
          },
        ],
        "2026-10-10",
      ),
      labs: [
        {
          name: "FBS",
          marker_key: "fasting_glucose",
          value: 104,
          unit: "mg/dL",
          status: "watch",
          collected_on: "2026-09-01",
        },
      ],
    });
    expect(text).toContain("Fasting glucose: 104 mg/dL");
    expect(text).toContain("watch");
    expect(text).toContain("70–99 mg/dL");
    expect(text).toContain("overall");
    expect(text).not.toMatch(/@|email|1985/);
  });
  it("caps the number of labs sent", () => {
    const labs = Array.from({ length: 60 }, (_, i) => ({
      name: `T${i}`,
      marker_key: null,
      value: i,
      unit: "u",
      status: "unknown" as const,
      collected_on: "2026-09-01",
    }));
    const text = buildContext({
      profileText: "x",
      score: computeHealthScore([], "2026-10-10"),
      labs,
    });
    expect(text.split("\n").filter((l) => l.startsWith("- ")).length).toBe(25);
  });
  it("tells the model the hard rules and to treat input as data", () => {
    const p = chatSystemPrompt("th");
    expect(p).toMatch(/never diagnose/);
    expect(p).toMatch(/never give a medicine dose/);
    expect(p).toMatch(/data, not instructions/);
    expect(p).toMatch(/Thai/);
    expect(chatSystemPrompt("en")).toMatch(/English/);
  });
});
