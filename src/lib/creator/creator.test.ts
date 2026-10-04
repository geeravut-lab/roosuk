import { describe, expect, it } from "vitest";
import { normalizeSlug, shareMessages } from "./creator";

describe("normalizeSlug", () => {
  it("tidies a code of 6–10 letters and digits from the safe alphabet", () => {
    expect(normalizeSlug(" maya-23 ")).toBe("MAYA23");
    expect(normalizeSlug("MAYAFIT2026")).toBeNull(); // 11 characters
    for (const bad of ["", "ab", "MAYA10", "ABCDEFO", "<script>", 5, null])
      expect(normalizeSlug(bad)).toBeNull();
  });
});

describe("shareMessages", () => {
  it("carry the link, in the person's language, and never promise a body result", () => {
    for (const lang of ["th", "en"] as const) {
      const msgs = shareMessages(lang, "https://roosuk.example/r/MAYA23");
      expect(msgs.map((m) => m.key)).toEqual(["short", "story", "invite"]);
      for (const m of msgs) {
        expect(m.text).toContain("https://roosuk.example/r/MAYA23");
        expect(m.text).not.toMatch(/ลดน้ำหนัก|ผอม|หุ่น|lose weight|slim|diet/i);
      }
    }
  });
});
