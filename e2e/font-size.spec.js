// Font size setting (حجم الخط) in the Header — utils/fontSize.js + components/layout/FontSizeMenu.jsx.
// It sets the ROOT font size on <html> (14 / 16 / 18px with the browser's normal 16px default),
// saved on the device in localStorage ("ui.fontSize"). No backend needed: fake session + mocked login.
import { test, expect, setFakeSession, FAKE_USER } from "./helpers";

const STORAGE_KEY = "ui.fontSize";

function rootFontSize(page) {
  return page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
}

function menuButton(page) {
  return page.getByRole("banner").getByRole("button", { name: "حجم الخط" });
}

function option(page, label) {
  return page.getByRole("menuitemradio", { name: label });
}

// Opens the menu with the mouse and picks an option.
async function chooseFontSize(page, label) {
  await menuButton(page).click();
  await option(page, label).click();
  await expect(page.getByRole("menu")).toBeHidden();
}

// Records the root font size at the moment React puts the first element in #root,
// to prove the saved size is applied BEFORE the first render (no flash).
async function recordFontSizeAtFirstRender(page) {
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (document.getElementById("root")?.firstChild) {
        window.fontSizeAtFirstRender = getComputedStyle(document.documentElement).fontSize;
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

test("default is متوسط (16px): nothing saved, the menu marks متوسط", async ({ page }) => {
  await page.goto("/login");
  expect(await rootFontSize(page)).toBe("16px");
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();

  await setFakeSession(page);
  await page.goto("/");
  await menuButton(page).click();
  await expect(option(page, "متوسط")).toHaveAttribute("aria-checked", "true");
  await expect(option(page, "صغير")).toHaveAttribute("aria-checked", "false");
  await expect(option(page, "كبير")).toHaveAttribute("aria-checked", "false");
  // The check icon is shown only on the current option.
  await expect(option(page, "متوسط").locator("svg")).toBeVisible();
  await expect(option(page, "كبير").locator("svg")).toBeHidden();
});

test("كبير sets 18px on <html>, is saved, and survives a reload and logout / login", async ({ page }) => {
  await setFakeSession(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "الرئيسية" })).toBeVisible();

  await chooseFontSize(page, "كبير");
  expect(await rootFontSize(page)).toBe("18px");
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe("large");
  // rem sizes scale with it: the Header (h-16 = 4rem) is now 72px high.
  expect((await page.getByRole("banner").boundingBox()).height).toBeCloseTo(72, 0);

  // Reload: applied before the first render.
  await recordFontSizeAtFirstRender(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "الرئيسية" })).toBeVisible();
  expect(await page.evaluate(() => window.fontSizeAtFirstRender)).toBe("18px");
  expect(await rootFontSize(page)).toBe("18px");

  // Logout keeps it (a device setting, not a user setting) …
  await page.getByRole("banner").getByRole("button", { name: "تسجيل الخروج" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await rootFontSize(page)).toBe("18px");

  // … and so does the next login.
  await page.route(
    (url) => url.pathname === "/auth/login",
    (route) =>
      route.fulfill({
        status: 201,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: { message: "ok", data: { access_token: "e2e-fake-token", user: FAKE_USER } },
      }),
  );
  await page.getByLabel("اسم المستخدم").fill(FAKE_USER.username);
  await page.getByLabel("كلمة المرور").fill("secret123");
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page.getByRole("heading", { name: "الرئيسية" })).toBeVisible();
  expect(await rootFontSize(page)).toBe("18px");
  await menuButton(page).click();
  await expect(option(page, "كبير")).toHaveAttribute("aria-checked", "true");
});

test("صغير sets 14px; متوسط goes back to 16px", async ({ page }) => {
  await setFakeSession(page);
  await page.goto("/");

  await chooseFontSize(page, "صغير");
  expect(await rootFontSize(page)).toBe("14px");
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe("small");

  await chooseFontSize(page, "متوسط");
  expect(await rootFontSize(page)).toBe("16px");
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe("medium");
});

test("a bad saved value falls back to متوسط (16px)", async ({ page }) => {
  await setFakeSession(page);
  await page.evaluate((key) => localStorage.setItem(key, "huge"), STORAGE_KEY);
  await page.goto("/");

  expect(await rootFontSize(page)).toBe("16px");
  await menuButton(page).click();
  await expect(option(page, "متوسط")).toHaveAttribute("aria-checked", "true");
});

test("the saved size also applies on the login page (before any login)", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate((key) => localStorage.setItem(key, "small"), STORAGE_KEY);
  await recordFontSizeAtFirstRender(page);
  await page.reload();

  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  expect(await page.evaluate(() => window.fontSizeAtFirstRender)).toBe("14px");
  expect(await rootFontSize(page)).toBe("14px");
});

test("keyboard: open with Enter, move with the arrows, choose with Enter, close with Escape", async ({ page }) => {
  await setFakeSession(page);
  await page.goto("/");
  const button = menuButton(page);
  const menu = page.getByRole("menu", { name: "حجم الخط" });

  await expect(button).toHaveAttribute("title", "حجم الخط");
  await expect(button).toHaveAttribute("aria-haspopup", "menu");
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // Enter opens the menu on the current option.
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(option(page, "متوسط")).toBeFocused();

  // Arrows move (and wrap around), Home / End jump.
  await page.keyboard.press("ArrowDown");
  await expect(option(page, "كبير")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(option(page, "صغير")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(option(page, "كبير")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(option(page, "صغير")).toBeFocused();
  await page.keyboard.press("End");
  await expect(option(page, "كبير")).toBeFocused();

  // Enter chooses: menu closed, focus back on the button.
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
  expect(await rootFontSize(page)).toBe("18px");

  // Escape closes without changing anything, focus back on the button.
  await page.keyboard.press("Space");
  await expect(option(page, "كبير")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  expect(await rootFontSize(page)).toBe("18px");

  // Tab leaves the menu and closes it.
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(menu).toBeHidden();
});

test("a click outside closes the menu without changing the size", async ({ page }) => {
  await setFakeSession(page);
  await page.goto("/");

  await menuButton(page).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("heading", { name: "الرئيسية" }).click();
  await expect(page.getByRole("menu")).toBeHidden();
  expect(await rootFontSize(page)).toBe("16px");

  // The button itself toggles it closed too.
  await menuButton(page).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await menuButton(page).click();
  await expect(page.getByRole("menu")).toBeHidden();
});
