import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const noHorizontalScroll = () =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth;

test.describe("public pages", () => {
  test("landing: headline, both calls to action, disclaimer, no horizontal scroll", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "AI ที่รู้จักสุขภาพของคุณ",
    );
    await expect(
      page.getByRole("link", { name: "เริ่มต้นใช้งานฟรี" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "เข้าสู่ระบบ" })).toBeVisible();
    await expect(page.getByText("ไม่ใช่บริการทางการแพทย์")).toBeVisible();
    expect(await page.evaluate(noHorizontalScroll)).toBe(true);
  });

  test("auth: login form, switching to sign-up reveals the name field", async ({
    page,
  }) => {
    await page.goto("/auth");
    await expect(page.getByLabel("อีเมล")).toBeVisible();
    await expect(page.getByLabel("รหัสผ่าน")).toBeVisible();
    await expect(page.getByLabel("ชื่อที่ใช้แสดง (ไม่บังคับ)")).toHaveCount(0);
    await page
      .getByRole("button", { name: "ยังไม่มีบัญชี? สมัครสมาชิก" })
      .click();
    await expect(page.getByLabel("ชื่อที่ใช้แสดง (ไม่บังคับ)")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ดำเนินการต่อด้วย Google" }),
    ).toBeVisible();
    expect(await page.evaluate(noHorizontalScroll)).toBe(true);
  });

  test("auth: shows a readable message for an error code in the URL", async ({
    page,
  }) => {
    await page.goto("/auth?error=err_invalid_credentials");
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    );
    await page.goto("/auth?error=garbage");
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
    );
  });

  for (const [path, heading] of [
    ["/privacy", "นโยบายความเป็นส่วนตัว"],
    ["/terms", "ข้อกำหนดการใช้งาน"],
  ] as const) {
    test(`${path}: marked as a draft, mentions the data region from one source`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByRole("note")).toContainText("ร่างเอกสาร");
      if (path === "/privacy")
        await expect(page.locator("main, body")).toContainText(
          "สิงคโปร์ (ap-southeast-1)",
        );
      expect(await page.evaluate(noHorizontalScroll)).toBe(true);
    });
  }

  test("signed-out visitors are sent to /auth from protected pages", async ({
    page,
  }) => {
    for (const path of ["/today", "/settings", "/admin", "/consent"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/auth/);
    }
  });

  test("health probe and PWA manifest", async ({ request }) => {
    expect((await request.get("/api/health")).ok()).toBe(true);
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.start_url).toBe("/today");
    expect(manifest.theme_color).toBe("#0A8FA3");
    for (const icon of manifest.icons)
      expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  });

  test("language switch persists via cookie and flips the whole page", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "The AI that knows your health",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "The AI that knows your health",
    );
  });
});

test.describe("accessibility (axe, WCAG 2.1 A/AA)", () => {
  for (const path of ["/", "/auth", "/privacy", "/preview/today"]) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        serious.map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
        ),
      ).toEqual([]);
    });
  }
});

test.describe("dark mode", () => {
  const luminance = async (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const [r, g, b] = getComputedStyle(document.body)
        .backgroundColor.match(/\d+/g)!
        .map(Number);
      return (r + g + b) / 3;
    });

  test("follows the device when no choice was made, and a saved choice wins over the device", async ({
    page,
    context,
    baseURL,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    expect(await luminance(page)).toBeLessThan(60); // dark background
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);

    await context.addCookies([
      { name: "roosuk-theme", value: "light", url: baseURL! },
    ]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await luminance(page)).toBeGreaterThan(200); // light even on a dark device

    await page.emulateMedia({ colorScheme: "light" });
    await context.addCookies([
      { name: "roosuk-theme", value: "dark", url: baseURL! },
    ]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await luminance(page)).toBeLessThan(60); // dark even on a light device

    // a junk cookie is ignored
    await context.addCookies([
      { name: "roosuk-theme", value: "<script>", url: baseURL! },
    ]);
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
  });

  for (const path of ["/", "/auth", "/privacy", "/preview/today"]) {
    test(`${path} has no serious or critical violations in dark mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        serious.map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
        ),
      ).toEqual([]);
    });
  }
});

test.describe("progress feedback", () => {
  test("a slow page change shows the spinner at once, ignores a second press, and clears on arrival", async ({
    page,
  }) => {
    await page.goto("/");
    let hits = 0;
    await page.route("**/auth**", async (route) => {
      const h = route.request().headers();
      if (h["rsc"] && !h["next-router-prefetch"]) hits++; // the page itself, not a prefetch
      await new Promise((r) => setTimeout(r, 1800));
      await route.continue();
    });
    const link = page.getByRole("link", { name: "เข้าสู่ระบบ" }).first();
    await link.click({ noWaitAfter: true });
    await expect(
      page.getByRole("status").filter({ hasText: "กำลังโหลด" }),
    ).toBeVisible();
    await link.click({ force: true, noWaitAfter: true }).catch(() => undefined); // impatient second press
    await expect(page).toHaveURL(/\/auth/);
    await expect(
      page.getByRole("status").filter({ hasText: "กำลังโหลด" }),
    ).toHaveCount(0);
    expect(hits).toBe(1); // one navigation, however many times it was pressed
  });

  test("a fast page change never flashes the spinner", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "เข้าสู่ระบบ" }).first().click();
    await expect(page).toHaveURL(/\/auth/);
    await expect(
      page.getByRole("status").filter({ hasText: "กำลังโหลด" }),
    ).toHaveCount(0);
  });

  test("changing the language shows a spinner on the pressed button until the page has switched", async ({
    page,
  }) => {
    await page.goto("/");
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST")
        await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("button", { name: "English" })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "English" }).locator("svg.animate-spin"),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "The AI that knows your health",
    );
    await expect(page.locator("svg.animate-spin")).toHaveCount(0);
  });
});

test.describe("credentials never travel in a URL", () => {
  test("signing in before the page's script has loaded does not put the password in the address", async ({
    browser,
    baseURL,
  }) => {
    // JavaScript off = the worst case of "pressed before the page was ready"
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await ctx.newPage();
    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill("someone@example.com");
    await page.getByLabel("รหัสผ่าน").fill("S3cret-pass-word");
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await page.waitForLoadState();
    expect(page.url()).not.toContain("S3cret");
    expect(page.url()).not.toContain("password");
    expect(page.url()).not.toContain("someone%40example.com");
    await ctx.close();
  });

  test("every login and sign-up form is a POST form", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.locator("main form").first()).toHaveAttribute(
      "method",
      "post",
    );
    await page.goto("/quiz");
    await expect(page.locator("main form").first()).toHaveAttribute(
      "method",
      "post",
    );
  });
});
