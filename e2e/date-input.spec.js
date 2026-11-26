// DateInput (src/components/ui/DateInput.jsx): days shown and typed as DD/MM/YYYY, "YYYY-MM-DD" in the code
// and the API. Tested through a real page (shared components are never tested on a test-only route):
// the Employees add form, field "تاريخ التعيين", with a mocked API (no backend needed).
import { test, expect, setFakeSession, API_URL } from "./helpers";

const CORS = { "Access-Control-Allow-Origin": "*" };
const BRANCH = {
  id: "b1",
  code: "branch-000001",
  name: "فرع وهمي",
  address: null,
  createdAt: "2026-11-21T10:00:00.000Z",
  updatedAt: "2026-11-21T10:00:00.000Z",
  deletedAt: null,
};
const INVALID = "تاريخ غير صحيح";

// Opens the add form. Returns the dialog, the date field and the POST bodies sent so far.
async function openAddForm(page) {
  const posted = [];
  await setFakeSession(page);
  await page.route(
    (url) => url.origin === API_URL && url.pathname === "/employees",
    (route) => route.fulfill({ json: { message: "ok", data: [] }, headers: CORS }),
  );
  await page.route(
    (url) => url.origin === API_URL && url.pathname === "/branch",
    (route) => route.fulfill({ json: { message: "ok", data: [BRANCH] }, headers: CORS }),
  );
  await page.route(
    (url) => url.origin === API_URL && url.pathname === "/employees/branch/b1",
    (route) => {
      posted.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { message: "created", data: { id: "e1" } }, headers: CORS });
    },
  );
  await page.goto("/employees");
  await page.getByRole("button", { name: "إضافة موظف" }).first().click();
  const dialog = page.getByRole("dialog", { name: "إضافة موظف" });
  await dialog.getByLabel("الفرع").selectOption("b1");
  await dialog.getByLabel("الاسم بالكامل").fill("موظف تجربة");
  return { dialog, field: dialog.getByLabel("تاريخ التعيين"), posted };
}

async function save(dialog) {
  await dialog.getByRole("button", { name: "حفظ" }).click();
}

test("typing: the slashes come by themselves; the API gets YYYY-MM-DD", async ({ page }) => {
  const { dialog, field, posted } = await openAddForm(page);
  await expect(field).toHaveValue("");
  await expect(field).toHaveAttribute("inputmode", "numeric");

  await field.pressSequentially("25");
  await expect(field).toHaveValue("25/");
  await field.pressSequentially("11");
  await expect(field).toHaveValue("25/11/");
  await field.pressSequentially("2026");
  await expect(field).toHaveValue("25/11/2026");
  // More digits are ignored (10 characters at most).
  await field.pressSequentially("9");
  await expect(field).toHaveValue("25/11/2026");
  await expect(dialog.getByText(INVALID)).toHaveCount(0);

  // A single-digit day / month closed with "/" gets its 0.
  await field.fill("");
  await field.pressSequentially("5/3/2026");
  await expect(field).toHaveValue("05/03/2026");

  await save(dialog);
  await expect(dialog).toBeHidden();
  expect(posted).toEqual([{ fullName: "موظف تجربة", hireDate: "2026-03-05" }]);
});

test("paste: 25/11/2026 and 2026-11-25 both become 25/11/2026", async ({ page }) => {
  const { dialog, field, posted } = await openAddForm(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  for (const text of ["2026-11-25", "25/11/2026"]) {
    await field.fill("");
    await page.evaluate((value) => navigator.clipboard.writeText(value), text);
    await field.focus();
    await page.keyboard.press("ControlOrMeta+V");
    await expect(field).toHaveValue("25/11/2026");
  }

  await save(dialog);
  await expect(dialog).toBeHidden();
  expect(posted[0].hireDate).toBe("2026-11-25");
});

test("invalid: 31/02/2026 → تاريخ غير صحيح at once; half typed → only after leaving; saving is blocked", async ({
  page,
}) => {
  const { dialog, field, posted } = await openAddForm(page);

  await field.pressSequentially("31022026");
  await expect(field).toHaveValue("31/02/2026");
  const error = dialog.getByText(INVALID);
  await expect(error).toBeVisible();
  await expect(error).toHaveClass(/text-red-600/);
  await expect(field).toHaveClass(/border-red-600/);
  await expect(field).toHaveAttribute("aria-invalid", "true");

  await save(dialog);
  await expect(dialog).toBeVisible();
  await expect(error).toBeVisible();
  expect(posted).toEqual([]);

  // Half typed: no error while typing, the error once the field is left; still nothing is sent.
  await field.fill("");
  await expect(error).toHaveCount(0);
  await field.pressSequentially("12/0");
  await expect(field).toHaveValue("12/0");
  await expect(error).toHaveCount(0);
  await field.press("Tab");
  await expect(error).toBeVisible();
  await save(dialog);
  expect(posted).toEqual([]);

  // 29/02 exists in a leap year only.
  await field.fill("29/02/2026");
  await expect(error).toBeVisible();
  await field.fill("29/02/2028");
  await expect(error).toHaveCount(0);
  await save(dialog);
  await expect(dialog).toBeHidden();
  expect(posted).toEqual([{ fullName: "موظف تجربة", hireDate: "2028-02-29" }]);
});

test("clearing: an emptied date is left out of the add body (no error)", async ({ page }) => {
  const { dialog, field, posted } = await openAddForm(page);
  await field.pressSequentially("25112026");
  await field.fill("");
  await field.press("Tab");
  await expect(dialog.getByText(INVALID)).toHaveCount(0);

  await save(dialog);
  await expect(dialog).toBeHidden();
  expect(posted).toEqual([{ fullName: "موظف تجربة" }]);
});

test.describe("calendar button", () => {
  test("opens the browser's date picker (showPicker); the picked day shows as DD/MM/YYYY", async ({ page }) => {
    // Record showPicker() calls instead of opening the real picker.
    await page.addInitScript(() => {
      window.pickerCalls = [];
      HTMLInputElement.prototype.showPicker = function showPicker() {
        window.pickerCalls.push(this.type);
      };
    });
    const { dialog, field, posted } = await openAddForm(page);
    await field.pressSequentially("01012025");

    const button = dialog.getByRole("button", { name: "فتح التقويم" });
    await expect(button).toHaveAttribute("title", "فتح التقويم");
    await button.click();
    expect(await page.evaluate(() => window.pickerCalls)).toEqual(["date"]);

    // The picker opens on the typed day and gives back "YYYY-MM-DD".
    const picker = dialog.locator('input[type="date"]');
    await expect(picker).toHaveValue("2025-01-01");
    await picker.fill("2026-03-05", { force: true });
    await expect(field).toHaveValue("05/03/2026");

    await save(dialog);
    await expect(dialog).toBeHidden();
    expect(posted[0].hireDate).toBe("2026-03-05");
  });

  test("without showPicker (older browsers) it focuses the hidden date input instead, no error", async ({ page }) => {
    await page.addInitScript(() => {
      delete HTMLInputElement.prototype.showPicker;
    });
    const { dialog } = await openAddForm(page);
    await dialog.getByRole("button", { name: "فتح التقويم" }).click();
    await expect(dialog.locator('input[type="date"]')).toBeFocused();
  });
});
