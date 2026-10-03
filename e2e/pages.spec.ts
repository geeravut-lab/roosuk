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
