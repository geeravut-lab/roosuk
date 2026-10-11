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

  test("'More' sheet shows the open page's item and cues for hidden items", async ({
    page,
  }) => {
    // /today is a bottom-bar page: the list starts at the top, more is below.
    await page.goto(PREVIEW);
    await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    const sheet = page.getByRole("dialog", { name: "เมนูทั้งหมด" });
    const up = sheet.locator("[data-more-cue=up]");
    const down = sheet.locator("[data-more-cue=down]");
    await expect(up).toHaveAttribute("data-visible", "false");
    await expect(down).toHaveAttribute("data-visible", "true");
    await page.keyboard.press("Escape");

    // /settings sits near the end: it must be on screen, with items hidden above.
    await page.goto("/preview/settings");
    await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    const current = sheet.locator('a[aria-current="page"]');
    await expect(current).toBeVisible();
    await expect(current).toBeInViewport({ ratio: 1 });
    await expect(up).toHaveAttribute("data-visible", "true");

    // Scrolling to the end flips the cues; scrolling back restores them.
    const list = sheet.locator("div.overflow-y-auto");
    await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(down).toHaveAttribute("data-visible", "false");
    await list.evaluate((el) => (el.scrollTop = 0));
    await expect(up).toHaveAttribute("data-visible", "false");
    await expect(down).toHaveAttribute("data-visible", "true");
  });

  test("a switched-off feature is greyed out and cannot be pressed", async ({
    page,
  }) => {
    await page.goto(`${PREVIEW}?off=/goals,/scan,/liver`);
    const bar = page.getByRole("navigation", { name: "เมนูด้านล่าง" });
    // bottom bar: no link, a disabled placeholder with the same label
    await expect(bar.getByRole("link", { name: "เป้าหมาย" })).toHaveCount(0);
    await expect(bar.getByRole("link", { name: "สแกน" })).toHaveCount(0);
    const goals = bar.locator("[data-nav-off]", { hasText: "เป้าหมาย" });
    await expect(goals).toHaveAttribute("aria-disabled", "true");
    await expect(bar.getByRole("link", { name: "วันนี้" })).toBeVisible();
    // More sheet: same for the entries behind it
    await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    const sheet = page.getByRole("dialog", { name: "เมนูทั้งหมด" });
    await expect(sheet.getByRole("link", { name: "สุขภาพตับ" })).toHaveCount(0);
    await expect(sheet.locator("[data-nav-off]")).toHaveCount(1);
    await expect(sheet.getByRole("link", { name: "ตั้งค่า" })).toBeVisible();
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

  test("a switched-off feature is greyed out in the sidebar", async ({
    page,
  }) => {
    await page.goto(`${PREVIEW}?off=/goals,/liver`);
    const aside = page.getByRole("complementary");
    await expect(aside.getByRole("link", { name: "เป้าหมาย" })).toHaveCount(0);
    await expect(aside.getByRole("link", { name: "สุขภาพตับ" })).toHaveCount(0);
    await expect(aside.locator("[data-nav-off]")).toHaveCount(2);
    await expect(aside.getByRole("link", { name: "วันนี้" })).toBeVisible();
  });

  test("content column is capped so lines stay readable", async ({ page }) => {
    await page.goto(PREVIEW);
    expect(
      (await page.locator("main").boundingBox())!.width,
    ).toBeLessThanOrEqual(768);
  });
});
