import { expect, test } from "@playwright/test";

const PREVIEW = "/preview/today";

test.describe("mobile layout (390×844)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 768, "mobile only");

  test("bottom bar replaces the sidebar; nothing scrolls sideways", async ({
    page,
  }) => {
    await page.goto(PREVIEW);
    await expect(
      page.getByRole("navigation", { name: "เมนูด้านล่าง" }),
    ).toBeVisible();
    await expect(page.getByRole("complementary")).toBeHidden();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  test("the scan button is raised and exactly centred", async ({ page }) => {
    await page.goto(PREVIEW);
    const nav = page.getByRole("navigation", { name: "เมนูด้านล่าง" });
    const scan = nav.getByRole("link", { name: "สแกน" });
    const box = (await scan.boundingBox())!;
    const viewportWidth = page.viewportSize()!.width;
    expect(Math.abs(box.x + box.width / 2 - viewportWidth / 2)).toBeLessThan(2);
    const today = (await nav
      .getByRole("link", { name: "วันนี้" })
      .boundingBox())!;
    expect(box.y).toBeLessThan(today.y); // sticks up above the other tabs
  });

  test("every bottom-bar target is at least 44px tall and 5 equal slots", async ({
    page,
  }) => {
    await page.goto(PREVIEW);
    const items = page
      .getByRole("navigation", { name: "เมนูด้านล่าง" })
      .locator("li");
    await expect(items).toHaveCount(5);
    const widths = await items.evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().width)),
    );
    expect(new Set(widths).size).toBe(1);
    for (const target of await page
      .getByRole("navigation", { name: "เมนูด้านล่าง" })
      .locator("a, button")
      .all()) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("the fixed bar never hides the last line of content", async ({
    page,
  }) => {
    await page.goto(PREVIEW);
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const lastCard = (await page.locator("main .card").last().boundingBox())!;
    const navTop = (await page
      .getByRole("navigation", { name: "เมนูด้านล่าง" })
      .boundingBox())!.y;
    expect(lastCard.y + lastCard.height).toBeLessThanOrEqual(navTop);
  });

  test("current page is marked in the bar", async ({ page }) => {
    await page.goto(PREVIEW);
    await expect(
      page
        .getByRole("navigation", { name: "เมนูด้านล่าง" })
        .getByRole("link", { name: "วันนี้" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("'More' sheet lists the rest, opens external links safely, closes with Esc", async ({
    page,
  }) => {
    await page.goto(PREVIEW);
    await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    const sheet = page.getByRole("dialog", { name: "เมนูทั้งหมด" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: "ตั้งค่า" })).toBeVisible();
    await expect(
      sheet.getByRole("link", { name: "ผู้ดูแลระบบ" }),
    ).toBeVisible();
    const manual = sheet.getByRole("link", { name: "คู่มือการใช้งาน" });
    await expect(manual).toHaveAttribute("target", "_blank");
    await expect(manual).toHaveAttribute("rel", /noreferrer/);
    await expect(
      sheet.getByRole("button", { name: "ออกจากระบบ" }),
    ).toBeVisible();
    expect((await sheet.boundingBox())!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height * 0.86,
    );
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("language switch works from the header", async ({ page }) => {
    await page.goto(PREVIEW);
    await page
      .getByRole("banner")
      .getByRole("button", { name: "English" })
      .click();
    await expect(
      page
        .getByRole("navigation", { name: "Bottom menu" })
        .getByRole("link", { name: "Today" }),
    ).toBeVisible();
  });
});

test.describe("desktop layout (1280×800)", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, "desktop only");

  test("sidebar replaces the bottom bar and fills the viewport height", async ({
    page,
  }) => {
    await page.goto(PREVIEW);
    const aside = page.getByRole("complementary");
    await expect(aside).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "เมนูด้านล่าง" }),
    ).toBeHidden();
    await expect(page.getByRole("banner")).toBeHidden();
    const box = (await aside.boundingBox())!;
    expect(
      Math.abs(box.height - page.viewportSize()!.height),
    ).toBeLessThanOrEqual(1);
    expect(Math.round(box.width)).toBe(240);
  });

  test("sidebar groups, active state, admin and manual links", async ({
    page,
  }) => {
    await page.goto(PREVIEW);
    const aside = page.getByRole("complementary");
    await expect(aside.getByText("ประจำวัน")).toBeVisible();
    await expect(aside.getByRole("link", { name: "วันนี้" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      aside.getByRole("link", { name: "ผู้ดูแลระบบ" }),
    ).toBeVisible();
    await expect(
      aside.getByRole("link", { name: "คู่มือการใช้งาน" }),
    ).toBeVisible();
  });

  test("content column is capped so lines stay readable", async ({ page }) => {
    await page.goto(PREVIEW);
    expect(
      (await page.locator("main").boundingBox())!.width,
    ).toBeLessThanOrEqual(768);
  });
});
