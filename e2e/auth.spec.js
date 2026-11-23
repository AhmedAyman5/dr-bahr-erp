// Login page, route guards and logout. No backend needed (fake session in localStorage).
import { test, expect, setFakeSession, getStoredToken, FAKE_USER } from "./helpers";

const APP_TITLE = "د. بحر - نظام إدارة الموارد";

// Opens the logout dialog from the Header and confirms it.
async function logoutWithConfirm(page) {
  await page.getByRole("banner").getByRole("button", { name: "تسجيل الخروج" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "تسجيل الخروج" }).click();
}

// Checks we end on a stable /login page (no redirect loop) with the session cleared.
async function expectLoggedOutOnLogin(page, consoleErrors) {
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await expect(page.getByLabel("اسم المستخدم")).toBeVisible();

  // Give a redirect loop time to show up, then check we are still on /login.
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/login$/);
  expect(consoleErrors.join("\n")).not.toContain("Maximum update depth");
  expect(await getStoredToken(page)).toBeNull();
}

test("login page renders with title, both fields and the login button", async ({ page }) => {
  await page.goto("/login");

  await expect(page).toHaveTitle(APP_TITLE);
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await expect(page.getByLabel("اسم المستخدم")).toBeVisible();
  await expect(page.getByLabel("كلمة المرور")).toBeVisible();
  await expect(page.getByRole("button", { name: "دخول", exact: true })).toBeVisible();
});

test("opening / without a session redirects to /login", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
});

test("a logged-in user opening /login is redirected to /", async ({ page }) => {
  await setFakeSession(page);
  await page.goto("/login");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("banner")).toContainText(FAKE_USER.username);
});

test("REGRESSION logout loop: full reload of / then logout ends on /login", async ({
  page,
  consoleErrors,
}) => {
  await setFakeSession(page);
  await page.goto("/");
  await page.reload();
  await expect(page.getByRole("heading", { name: "الرئيسية" })).toBeVisible();

  await logoutWithConfirm(page);

  await expectLoggedOutOnLogin(page, consoleErrors);
});

test("REGRESSION logout loop: 404 page → back home → logout ends on /login", async ({
  page,
  consoleErrors,
}) => {
  await setFakeSession(page);
  await page.goto("/some-missing-page");
  await expect(page.getByRole("heading", { name: "الصفحة غير موجودة" })).toBeVisible();

  await page.getByRole("link", { name: "العودة إلى الرئيسية" }).click();
  await expect(page).toHaveURL(/\/$/);

  await logoutWithConfirm(page);

  await expectLoggedOutOnLogin(page, consoleErrors);
});

test.describe("logout dialog", () => {
  test.beforeEach(async ({ page }) => {
    await setFakeSession(page);
    await page.goto("/");
    await page.getByRole("banner").getByRole("button", { name: "تسجيل الخروج" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test('"إلغاء" closes the dialog and keeps the user logged in', async ({ page }) => {
    await page.getByRole("dialog").getByRole("button", { name: "إلغاء" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    expect(await getStoredToken(page)).not.toBeNull();
  });

  test("clicking the dark backdrop does nothing", async ({ page }) => {
    // Top corner of the screen = backdrop (the dialog is centered).
    await page.mouse.click(5, 5);

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(await getStoredToken(page)).not.toBeNull();
  });
});
