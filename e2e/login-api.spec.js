// Real login against the local backend (Docker, http://localhost:3000).
// Skipped with a clear message when the API is not running.
import { test, expect } from "./helpers";

const API_URL = "http://localhost:3000";

test.beforeEach(async ({ request }) => {
  let reachable = true;
  try {
    // Any HTTP answer (even 401) means the API is up.
    await request.get(API_URL, { timeout: 3000 });
  } catch {
    reachable = false;
  }
  test.skip(
    !reachable,
    `Backend not reachable on ${API_URL} — start it with "docker compose up -d" in ../backend`,
  );
});

test.describe("wrong password", () => {
  // The browser itself logs the failed request ("... status of 401 (Unauthorized)").
  // That is expected here; any other console error still fails the test.
  test.use({ allowedConsoleErrors: [/status of 401/] });

  test("shows the Arabic wrong-credentials message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("اسم المستخدم").fill("admin");
    await page.getByLabel("كلمة المرور").fill("wrong-password");
    await page.getByRole("button", { name: "دخول", exact: true }).click();

    await expect(page.getByRole("alert")).toHaveText("اسم المستخدم أو كلمة المرور غير صحيحة");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test("admin / admin123 lands on / and the Header shows admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill("admin");
  await page.getByLabel("كلمة المرور").fill("admin123");
  await page.getByRole("button", { name: "دخول", exact: true }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("banner")).toContainText("admin");
});
