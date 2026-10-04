/**
 * Creator toolkit, the pure side: a creator's own referral code and the share
 * messages made for it. Copy never promises a result for the body or the weight.
 */
export function normalizeSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  return /^[2-9A-HJ-NP-Z]{6,10}$/.test(v) ? v : null;
}

export function shareMessages(
  lang: "th" | "en",
  link: string,
): { key: "short" | "story" | "invite"; text: string }[] {
  if (lang === "th")
    return [
      {
        key: "short",
        text: `ลองใช้ รู้สุข ดูแลสุขภาพแบบเช็กอินวันละนิด ไม่ต้องเครียด ${link}`,
      },
      {
        key: "story",
        text: `ฉันใช้ รู้สุข เช็กอินสุขภาพทุกวัน มันช่วยให้เห็นภาพรวมของนิสัยตัวเองชัดขึ้น ไม่มีเป้าน้ำหนักหรือรูปร่างมากดดัน ใครอยากลองใช้ลิงก์นี้ได้เลย ${link}`,
      },
      {
        key: "invite",
        text: `ชวนมาเช็กอินสุขภาพด้วยกันที่ รู้สุข สมัครผ่านลิงก์นี้: ${link}`,
      },
    ];
  return [
    {
      key: "short",
      text: `Try RooSuk — a small daily health check-in, no pressure. ${link}`,
    },
    {
      key: "story",
      text: `I check in with RooSuk every day. It shows me my own habits clearly — no weight or body-shape targets. If you want to try it, use this link: ${link}`,
    },
    {
      key: "invite",
      text: `Come check in on your health with me on RooSuk. Sign up with this link: ${link}`,
    },
  ];
}
