import { describe, expect, it } from "vitest";
import { detectEnv, installSteps, isStandaloneMode } from "./install";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  iphoneLine:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.8.0",
  ipadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  androidFirefox:
    "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
  androidEdge:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.0.0",
  androidLine:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Line/14.8.0",
  androidFacebook:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0]",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  desktopEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  desktopSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  desktopFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
};

describe("detectEnv", () => {
  it.each([
    ["iphoneSafari", "ios", "safari", 5],
    ["iphoneChrome", "ios", "chrome", 5],
    ["iphoneFirefox", "ios", "firefox", 5],
    ["iphoneLine", "ios", "inapp", 5],
    ["ipadDesktopMode", "ios", "safari", 5],
    ["androidChrome", "android", "chrome", 5],
    ["androidSamsung", "android", "samsung", 5],
    ["androidFirefox", "android", "firefox", 5],
    ["androidEdge", "android", "edge", 5],
    ["androidLine", "android", "inapp", 5],
    ["androidFacebook", "android", "inapp", 5],
    ["desktopChrome", "desktop", "chrome", 0],
    ["desktopEdge", "desktop", "edge", 0],
    ["desktopSafari", "desktop", "safari", 0],
    ["desktopFirefox", "desktop", "firefox", 0],
  ] as const)("%s", (name, platform, browser, touch) => {
    expect(detectEnv(UA[name], touch)).toEqual({ platform, browser });
  });

  it("a Mac with no touch screen is a desktop, not an iPad", () => {
    expect(detectEnv(UA.ipadDesktopMode, 0).platform).toBe("desktop");
  });
});

describe("installSteps", () => {
  it("iPhone Safari: share, add to home screen, add", () => {
    expect(installSteps({ platform: "ios", browser: "safari" }, false)).toEqual(
      ["pwaStep_ios_safari_1", "pwaStep_ios_2", "pwaStep_ios_3"],
    );
  });
  it("other iOS browsers get their own first step; in-app browsers are told to leave first", () => {
    expect(installSteps({ platform: "ios", browser: "chrome" }, false)[0]).toBe(
      "pwaStep_ios_other_1",
    );
    expect(installSteps({ platform: "ios", browser: "inapp" }, false)[0]).toBe(
      "pwaStep_inapp_ios_1",
    );
    expect(
      installSteps({ platform: "android", browser: "inapp" }, true)[0],
    ).toBe("pwaStep_inapp_android_1");
  });
  it("Android and desktop need no steps when the browser offers the prompt", () => {
    expect(
      installSteps({ platform: "android", browser: "chrome" }, true),
    ).toEqual([]);
    expect(
      installSteps({ platform: "desktop", browser: "edge" }, true),
    ).toEqual([]);
  });
  it("…and fall back to the menu steps when it does not", () => {
    expect(
      installSteps({ platform: "android", browser: "chrome" }, false),
    ).toEqual(["pwaStep_android_chrome_1", "pwaStep_android_2"]);
    expect(
      installSteps({ platform: "android", browser: "samsung" }, false)[0],
    ).toBe("pwaStep_android_samsung_1");
    expect(
      installSteps({ platform: "android", browser: "firefox" }, false)[0],
    ).toBe("pwaStep_android_firefox_1");
    expect(
      installSteps({ platform: "desktop", browser: "chrome" }, false),
    ).toEqual(["pwaStep_desktop_1"]);
    expect(
      installSteps({ platform: "desktop", browser: "firefox" }, false),
    ).toEqual(["pwaStep_desktop_other"]);
  });
});

describe("isStandaloneMode", () => {
  it("is true from either signal", () => {
    expect(isStandaloneMode(true, undefined)).toBe(true);
    expect(isStandaloneMode(false, true)).toBe(true);
    expect(isStandaloneMode(false, false)).toBe(false);
    expect(isStandaloneMode(false, undefined)).toBe(false);
  });
});
