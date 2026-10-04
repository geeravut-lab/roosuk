import { describe, expect, it } from "vitest";
import { parseTheme, themeAttribute } from "./theme";

describe("theme", () => {
  it("accepts the three choices and falls back to system", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("system")).toBe("system");
    for (const bad of [
      undefined,
      null,
      "",
      "DARK",
      "blue",
      3,
      ["dark"],
      "__proto__",
    ])
      expect(parseTheme(bad)).toBe("system");
  });
  it("only sets the attribute for an explicit choice", () => {
    expect(themeAttribute("system")).toBeUndefined();
    expect(themeAttribute("dark")).toBe("dark");
    expect(themeAttribute("light")).toBe("light");
  });
});
