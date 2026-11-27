// Pages per role (src/routes/rolePages.js → ROLE_PAGES). No backend needed: fake sessions.
// Until Week 5 only SUPERADMIN has pages; every other role only gets the home page.
import { test, expect, setFakeSession, FAKE_USER, API_URL } from "./helpers";

const NO_PERMISSION = "ليس لديك صلاحية لعرض هذه الصفحة";

test("a USER sees only الرئيسية in the Sidebar and the no-permission state on /branches", async ({ page }) => {
  const apiRequests = [];
  page.on("request", (req) => {
    if (req.url().startsWith(API_URL)) apiRequests.push(`${req.method()} ${req.url()}`);
  });
  await setFakeSession(page, { id: "e2e-plain-user", username: "e2e-user", role: "USER" });

  await page.goto("/");
  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link")).toHaveText(["الرئيسية"]);
  // Groups left without links are hidden (no titles either).
  await expect(nav.getByText("البيانات الأساسية")).toHaveCount(0);
  await expect(nav.getByText("الموظفين والمستخدمين")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "الرئيسية" })).toBeVisible();

  // Opening a page by its URL shows the no-permission state inside the layout.
  await page.goto("/branches");
  await expect(page.getByRole("heading", { name: NO_PERMISSION })).toBeVisible();
  await expect(page.getByRole("heading", { name: "الفروع" })).toHaveCount(0);
  await expect(page.getByRole("banner")).toContainText("e2e-user"); // Header still there
  await expect(nav.getByRole("link")).toHaveText(["الرئيسية"]);

  // The page itself never loaded, so no API request was sent.
  expect(apiRequests).toEqual([]);

  await page.getByRole("link", { name: "العودة إلى الرئيسية" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "الرئيسية" })).toBeVisible();
});

test("a SUPERADMIN sees every link and can open /branches", async ({ page }) => {
  await setFakeSession(page, FAKE_USER); // role SUPERADMIN
  await page.route(
    (url) => url.origin === API_URL && url.pathname === "/branch",
    (route) =>
      route.fulfill({ json: { message: "ok", data: [] }, headers: { "Access-Control-Allow-Origin": "*" } }),
  );

  await page.goto("/branches");
  await expect(page.getByRole("heading", { name: "الفروع" })).toBeVisible();
  await expect(page.getByText(NO_PERMISSION)).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("link")).toHaveText([
    "الرئيسية",
    "الفروع",
    "المخازن",
    "التصنيفات",
    "الوحدات",
    "العملات",
    "الأصناف",
    "أرصدة المخزون",
    "حركات المخزون",
    "كارت الصنف",
    "عروض أسعار الشراء",
    "فواتير الشراء",
    "مرتجعات الشراء",
    "العملاء",
    "الموردين",
    "الموظفين",
    "المستخدمين",
  ]);
});
