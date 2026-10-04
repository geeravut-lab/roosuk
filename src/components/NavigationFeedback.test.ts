// @vitest-environment node
import { describe, expect, it } from "vitest";
import { internalTarget } from "./NavigationFeedback";

const click = (over: Record<string, unknown> = {}) => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...over,
});
const a = (href: string, attrs: Record<string, string> = {}) =>
  ({
    href,
    hasAttribute: (n: string) => n in attrs,
    getAttribute: (n: string) => attrs[n] ?? null,
  }) as unknown as HTMLAnchorElement;
const here = { origin: "https://app.test", path: "/today" };

describe("internalTarget", () => {
  it("returns the destination of an ordinary in-app link", () => {
    expect(
      internalTarget(click(), a("https://app.test/timeline?range=7"), here),
    ).toBe("/timeline?range=7");
  });
  it("ignores everything the browser should handle itself", () => {
    expect(
      internalTarget(click({ button: 1 }), a("https://app.test/x"), here),
    ).toBeNull();
    expect(
      internalTarget(click({ metaKey: true }), a("https://app.test/x"), here),
    ).toBeNull();
    expect(
      internalTarget(click({ ctrlKey: true }), a("https://app.test/x"), here),
    ).toBeNull();
    expect(
      internalTarget(
        click({ defaultPrevented: true }),
        a("https://app.test/x"),
        here,
      ),
    ).toBeNull();
    expect(
      internalTarget(
        click(),
        a("https://app.test/f", { target: "_blank" }),
        here,
      ),
    ).toBeNull();
    expect(
      internalTarget(click(), a("https://app.test/f", { download: "" }), here),
    ).toBeNull();
    expect(internalTarget(click(), a("https://other.test/x"), here)).toBeNull();
    expect(internalTarget(click(), null, here)).toBeNull();
  });
  it("ignores the page you are already on and #hash jumps", () => {
    expect(
      internalTarget(click(), a("https://app.test/today"), here),
    ).toBeNull();
    expect(
      internalTarget(click(), a("https://app.test/today#top"), here),
    ).toBeNull();
    expect(internalTarget(click(), a("https://app.test/today?x=1"), here)).toBe(
      "/today?x=1",
    );
    expect(
      internalTarget(
        click(),
        a("https://app.test/x", { target: "_self" }),
        here,
      ),
    ).toBe("/x");
  });
});
