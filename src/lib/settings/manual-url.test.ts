import { describe, expect, it } from "vitest";
import { parseManualUrl } from "./manual-url";

describe("parseManualUrl", () => {
  it("accepts https addresses and normalises them", () => {
    expect(
      parseManualUrl("https://drive.google.com/file/d/abc/view?usp=sharing"),
    ).toBe("https://drive.google.com/file/d/abc/view?usp=sharing");
    expect(parseManualUrl("  https://example.com/guide.pdf  ")).toBe(
      "https://example.com/guide.pdf",
    );
  });
  it("empty clears", () => {
    expect(parseManualUrl("")).toBe("");
    expect(parseManualUrl("   ")).toBe("");
  });
  it("refuses everything else", () => {
    for (const bad of [
      "http://example.com/guide.pdf",
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "ftp://example.com/x",
      "https://user:pass@example.com/x",
      "https://localhost/x",
      "https://exa mple.com",
      "example.com/guide",
      "https://" + "a".repeat(500) + ".com",
    ])
      expect(parseManualUrl(bad), bad).toBeNull();
    expect(parseManualUrl(42)).toBeNull();
    expect(parseManualUrl(undefined)).toBeNull();
  });
});
