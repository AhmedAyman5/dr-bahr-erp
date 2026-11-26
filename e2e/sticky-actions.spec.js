// DataTable: the actions column is sticky on the inline-end side (left in RTL).
// At font size كبير (large) and 1280x720, Products and Stock Movements are wider than the screen:
// the row buttons must stay visible and clickable without scrolling, and still after scrolling.
// Real backend + demo data, looking only (an edit form is opened and closed without saving).
import { test, expect, setSession, setFakeSession, isApiUp, apiLogin, API_URL, API_DOWN_MESSAGE } from "./helpers";

const FONT_SIZE_KEY = "ui.fontSize";

function scrollBox(page) {
  return page.locator("main table").first().locator("xpath=..");
}

// Fully inside the viewport (and not clipped by the scroll box) + the topmost element at its center.
async function expectClickable(button) {
  await expect(button).toBeInViewport({ ratio: 1 });
  const onTop = await button.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  expect(onTop, "the button is covered by another element").toBe(true);
}

// The end fade sits just before the sticky column: in RTL the column is on the left and the fade starts at its right edge.
async function expectFadeBeforeStickyColumn(page) {
  const fade = page.locator('main [data-overflow-fade="end"]').first();
  await expect(fade).toBeVisible();
  const fadeBox = await fade.boundingBox();
  const stickyBox = await page.locator("main th[data-sticky-actions]").first().boundingBox();
  expect(Math.abs(fadeBox.x - (stickyBox.x + stickyBox.width))).toBeLessThan(2);
}

async function openAt(page, request, fontSize, path) {
  const session = await apiLogin(request);
  await setSession(page, session.access_token, session.user);
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [FONT_SIZE_KEY, fontSize]);
  await page.goto(path);
  await expect(page.locator("main table tbody tr").first()).toBeVisible();
}

async function scrollTable(page, where) {
  await scrollBox(page).evaluate((el, to) => {
    const max = el.scrollWidth - el.clientWidth;
    // RTL: scrollLeft goes negative towards the end (left).
    el.scrollTo({ left: to === "end" ? -max : -max / 2 });
  }, where);
}

test.describe("with backend", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);
  });

  test.describe("large font, 1280x720", () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test("Products: الوحدات / تعديل / حذف stay visible and clickable before and after scrolling", async ({
      page,
      request,
    }) => {
      await openAt(page, request, "large", "/products");
      const box = scrollBox(page);
      expect(await box.evaluate((el) => el.scrollWidth - el.clientWidth), "the table should overflow here").toBeGreaterThan(0);

      const row = page.locator("main table tbody tr").first();
      const name = (await row.locator("td").nth(1).locator("div > div").first().textContent()).trim();
      const edit = page.getByRole("button", { name: `تعديل ${name}` });
      const remove = page.getByRole("button", { name: `حذف ${name}` });
      const units = page.getByRole("button", { name: `وحدات ${name}` });

      for (const where of ["start", "middle", "end"]) {
        if (where !== "start") await scrollTable(page, where);
        for (const button of [units, edit, remove]) await expectClickable(button);
      }
      await scrollTable(page, "middle");
      await expectFadeBeforeStickyColumn(page);

      // A real click works (opens the edit form; closed without saving).
      await edit.click();
      const dialog = page.getByRole("dialog", { name: "تعديل الصنف" });
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });

    test("Stock Movements: كارت الصنف stays visible and clickable before and after scrolling", async ({
      page,
      request,
    }) => {
      await openAt(page, request, "large", "/stock-movements");
      expect(await scrollBox(page).evaluate((el) => el.scrollWidth - el.clientWidth), "the table should overflow here").toBeGreaterThan(0);

      const link = page.locator("main table tbody tr").first().getByRole("link", { name: /^كارت الصنف/ });
      await expectClickable(link);
      await expectFadeBeforeStickyColumn(page);
      for (const where of ["middle", "end"]) {
        await scrollTable(page, where);
        await expectClickable(link);
      }

      await link.click();
      await expect(page).toHaveURL(/\/item-card\?product=.+&inventory=.+/);
    });

    test("Products' units modal: the row buttons are visible and clickable", async ({ page, request }) => {
      await openAt(page, request, "large", "/products");
      await page.getByRole("button", { name: "وحدات مياه معدنية 1.5 لتر" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator("table tbody tr")).not.toHaveCount(0);

      await expect(dialog.locator("th[data-sticky-actions]")).toHaveCSS("position", "sticky");
      const edit = dialog.getByRole("button", { name: /^تعديل وحدة/ }).first();
      await expectClickable(edit);
      await expectClickable(dialog.getByRole("button", { name: /^حذف وحدة/ }).first());
    });
  });
});

// Mocked list (fixed data): other tests running in parallel add products with long names, so the
// real Products table may grow a few px wider than the screen at any moment.
test.describe("mocked API", () => {
  const CORS = { "Access-Control-Allow-Origin": "*" };
  const DATES = { createdAt: "2026-11-21T10:00:00.000Z", updatedAt: "2026-11-21T10:00:00.000Z", deletedAt: null };
  const CATEGORY = { id: "cat1", code: "category-000001", name: "منظفات", ...DATES };
  const UNIT = { id: "unit1", code: "unit-000001", name: "قطعة", ...DATES };
  const PRODUCT = {
    id: "p1",
    code: "PRD-000001",
    barcode: "6221234567890",
    name: "صابون سائل",
    categoryId: CATEGORY.id,
    primaryItemUnitId: UNIT.id,
    itemType: "STOCK",
    costingMethod: "WEIGHTED_AVERAGE",
    retailPrice: "65",
    wholesalePrice: "58",
    bulkWholesalePrice: "54",
    reorderLimit: "0",
    hasExpiryDate: false,
    ...DATES,
    category: CATEGORY,
    primaryItemUnit: UNIT,
  };

  test("a table that fits (medium, 1366x768): no line, no fade, same background as the row", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const lists = { "/products": [PRODUCT], "/categories": [CATEGORY], "/item-unit": [UNIT] };
    await page.route(
      (url) => url.origin === API_URL && lists[url.pathname] !== undefined,
      (route) => route.fulfill({ headers: CORS, json: { message: "ok", data: lists[new URL(route.request().url()).pathname] } }),
    );
    await setFakeSession(page);
    await page.goto("/products");
    await expect(page.locator("main table tbody tr")).toHaveCount(1);
    expect(await scrollBox(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);

    await expect(page.locator("main [data-overflow-fade]")).toHaveCount(0);
    const header = page.locator("main th[data-sticky-actions]");
    const cell = page.locator("main td[data-sticky-actions]").first();
    for (const sticky of [header, cell]) {
      // No separating line (the ::before is not drawn).
      expect(await sticky.evaluate((el) => getComputedStyle(el, "::before").content)).toBe("none");
    }
    // Same colors as its row / header row.
    const headerRowBg = await page.locator("main thead").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await header.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(headerRowBg);
    expect(await cell.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
    // On hover the sticky cell follows the row's hover color.
    const row = page.locator("main table tbody tr").first();
    await row.locator("td").first().hover();
    const rowHoverBg = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await cell.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rowHoverBg);
    // The actions column is still the last (left) column, right next to the others.
    const lastBefore = await page.locator("main thead th").nth(-2).boundingBox();
    const actions = await header.boundingBox();
    expect(Math.abs(actions.x + actions.width - lastBefore.x)).toBeLessThan(2);
  });
});
