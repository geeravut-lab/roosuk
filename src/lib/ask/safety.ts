/**
 * Safety layers around Ask My Health (CLAUDE.md health guardrails). These are
 * plain code on purpose: they run BEFORE any model sees the message and AFTER
 * it answers, cost nothing, and behave the same every time.
 *
 * Thai has no spaces between words, so each phrase below is specific enough to
 * match as text (a bare "ชัก" would also match "ชักชวน"). The lists lean
 * towards over-triggering: a false alarm shows a safe, kind message, a miss
 * would not.
 */

export type Escalation = "medical_emergency" | "self_harm";

const SELF_HARM =
  /อยากตาย|ฆ่าตัวตาย|ทำร้ายตัวเอง|ไม่อยากมีชีวิต|ไม่อยากอยู่ต่อ|จบชีวิต|กรีดข้อมือ|suicid|kill myself|end my life|want to die|self[- ]?harm|hurt myself/i;

const MEDICAL_EMERGENCY =
  /ปวดหน้าอก|แน่นหน้าอก|หายใจไม่ออก|หายใจลำบากมาก|หมดสติ|ไม่รู้สึกตัว|ชักเกร็ง|ชักกระตุก|ลมชักกำเริบ|อ่อนแรงครึ่งซีก|แขนขาอ่อนแรง|แขนอ่อนแรง|ขาอ่อนแรง|ปากเบี้ยว|พูดไม่ชัดกะทันหัน|เลือดออกไม่หยุด|อาเจียนเป็นเลือด|ถ่ายเป็นเลือด|ไอเป็นเลือด|กินยาเกินขนาด|ได้รับพิษ|แพ้อย่างรุนแรง|แพ้ยารุนแรง|chest pain|can'?t breathe|cannot breathe|difficulty breathing|unconscious|seizure|stroke|overdos|severe bleeding|vomiting blood|anaphyla/i;

/** Self-harm wins over a medical emergency: that message needs a person, not a clinic address. */
export function screenMessage(text: string): Escalation | null {
  if (SELF_HARM.test(text)) return "self_harm";
  if (MEDICAL_EMERGENCY.test(text)) return "medical_emergency";
  return null;
}

/**
 * Things the assistant must never say: a dose, an instruction to stop or change
 * medicine, or a diagnosis addressed to the user. Educational sentences that
 * merely mention a disease or a lab unit (126 mg/dL) are fine and must pass.
 *
 * Doses are blocked outright. The other two are matched on phrases that are ALSO
 * what a good answer says in the negative — "ไม่ควรหยุดยาเอง" (do not stop your
 * medicine yourself), "ฉันวินิจฉัยไม่ได้ว่าคุณเป็นเบาหวานหรือไม่" (I cannot tell
 * whether you have diabetes) — so a match is ignored when a negation, a
 * condition ("if you stop…") or a question ("…or not?") sits right next to it.
 * Measured on real model answers: without this, the safest answers were the
 * ones being thrown away.
 */
const FORBIDDEN_STRICT = [
  /\b\d+(\.\d+)?\s?(mg|mcg|iu)\b(?!\s*\/)/i,
  /\d+\s?(มก\.?|มิลลิกรัม|ไมโครกรัม|ยูนิต)(?!\s*\/)/,
  /\d+\s?(เม็ด|แคปซูล)/,
  /\btake \d+ (tablets?|pills?|capsules?)\b/i,
];

const FORBIDDEN_CONTEXTUAL = [
  /(หยุด|เลิก|งด|ข้าม)(กิน|ทาน)?ยา/g,
  /(เพิ่ม|ลด)(ขนาด|ปริมาณ|โดส)ยา/g,
  /\b(stop|quit|skip|double|increase|reduce)\b[^.\n]{0,20}\b(medication|medicine|pills|insulin|dose)\b/gi,
  /คุณ(เป็น|ป่วยเป็น|น่าจะเป็น|คงเป็น)(โรค)?(มะเร็ง|เบาหวาน|ความดัน|หัวใจ|ไต|ตับ|ไทรอยด์|ซึมเศร้า)/g,
  /\byou (have|likely have|probably have|are suffering from|are diagnosed with) (cancer|diabetes|hypertension|heart disease|kidney disease|depression)\b/gi,
  /\bI (can )?diagnose\b|ฉันวินิจฉัย/gi,
];

/**
 * Right before the match: a negation whose reach can cover a whole coordinated
 * phrase ("ไม่แนะนำให้หยุดยาหรือปรับลดขนาดยา" negates BOTH actions), so it may sit
 * up to ~24 characters back — but never across a sentence particle (ค่ะ, นะ, ครับ…),
 * where a new sentence, and possibly new advice, begins. Known soft spot: a
 * negated aside ("ไม่ควรกังวล คุณหยุดยาได้") would pass; the system prompt
 * forbids that advice in the first place and this check is only the backstop.
 */
const DEFUSED_BEFORE_NEG =
  /(ไม่ควร|ไม่แนะนำ|ไม่สามารถ|ไม่ได้|อย่า|ห้าม|ไม่ใช่|ไม่ได้(หมายความ|บอก|แปลว่า|ชี้)ว่า|ไม่(สามารถ)?(วินิจฉัย|บอก|ฟันธง|ระบุ)ได้ว่า|don'?t|do not|never|should not|shouldn'?t|cannot|can'?t)(?:(?!ค่ะ|คะ|ครับ|นะ|[.,;\n]).){0,24}$/i;
/** A condition or "the act of …" must be right up against the match (หากหยุดยา, การหยุดยา): a distant "ถ้า" is just the start of advice. */
const DEFUSED_BEFORE_COND =
  /(หาก|ถ้า|เมื่อ|การ|if|when|whether|not)\s*.{0,6}$/i;
/** Right after the match: the sentence is a question. */
const DEFUSED_AFTER = /^.{0,8}(หรือไม่|หรือเปล่า|ไหม|or not|\?)/i;

export function violatesAnswerGuardrails(answer: string): boolean {
  if (FORBIDDEN_STRICT.some((re) => re.test(answer))) return true;
  for (const re of FORBIDDEN_CONTEXTUAL) {
    for (const m of answer.matchAll(re)) {
      const start = m.index ?? 0;
      const before = answer.slice(Math.max(0, start - 40), start);
      const after = answer.slice(start + m[0].length, start + m[0].length + 14);
      if (
        DEFUSED_BEFORE_NEG.test(before) ||
        DEFUSED_BEFORE_COND.test(before) ||
        DEFUSED_AFTER.test(after)
      )
        continue;
      return true;
    }
  }
  return false;
}
