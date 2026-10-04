/** Colour theme: "system" follows the device; light/dark are the person's own choice (a cookie, so the server paints the right one first time). */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "roosuk-theme";

export function parseTheme(v: unknown): Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v)
    ? (v as Theme)
    : "system";
}

/** The value of `<html data-theme>`; nothing for "system" so the media query decides. */
export function themeAttribute(theme: Theme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}
