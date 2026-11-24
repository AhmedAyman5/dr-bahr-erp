// Customers page (العملاء) — same approach as branches.spec.js.
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// Every test creates its own customers with a unique random tag in the name, and afterEach
// deletes every customer with that tag through the API (also when the test failed).
//
// "mocked API" tests fake the /customer endpoint with page.route (no backend needed).
import {
  test,
  expect,
  setSession,
  setFakeSession,
  isApiUp,
  apiLogin,
  createByApi,
  deleteByTag,
  expectBalanceCell,
  randomTag,
  API_URL,
  API_DOWN_MESSAGE,
} from "./helpers";

// Column order in the table.
const COL = { code: 0, name: 1, phone: 2, creditLimit: 3, openingBalance: 4 };

// The table row that contains this text.
function rowWith(page, text) {
  return page.getByRole("row").filter({ hasText: text });
}

// Collects every POST / PATCH / DELETE sent to /customer.
function recordWrites(page) {
  const sent = [];
  page.on("request", (req) => {
    if (req.url().startsWith(`${API_URL}/customer`) && req.method() !== "GET" && req.method() !== "OPTIONS") {
      sent.push({ method: req.method(), body: req.postDataJSON() });
    }
  });
  return sent;
}

test.describe("with backend", () => {
  let token;
  let tag; // unique per test, part of every customer name this test creates

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);

    tag = randomTag();
    const session = await apiLogin(request);
    token = session.access_token;
    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;
    await deleteByTag(request, token, "/customer", tag);
    tag = undefined;
  });

  test("opens from the Sidebar link with no console errors", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "العملاء" }).click();

    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByRole("heading", { name: "العملاء" })).toBeVisible();
    await expect(page.getByText("بيانات العملاء والحدود الائتمانية")).toBeVisible();
    await expect(page.getByText("جارٍ تحميل العملاء...")).toBeHidden();
  });

  test("add a customer → numbers in the body, no code → row with code and 2-decimal money", async ({ page }) => {
    const name = `عميل اختبار ${tag}`;
    await page.goto("/customers");

    await page.getByRole("button", { name: "إضافة عميل" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة عميل" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("الاسم")).toBeFocused();
    // No code in add mode; money starts at 0.
    await expect(dialog.getByLabel("الكود")).toHaveCount(0);
    await expect(dialog.getByLabel("الحد الائتماني")).toHaveValue("0");
    await expect(dialog.getByLabel("الرصيد الافتتاحي")).toHaveValue("0");
    // Phone / numbers / money are typed left-to-right.
    await expect(dialog.getByLabel("الهاتف")).toHaveAttribute("dir", "ltr");
    await expect(dialog.getByLabel("الحد الائتماني")).toHaveAttribute("dir", "ltr");

    await dialog.getByLabel("الاسم").fill(`  ${name}  `);
    await dialog.getByLabel("الهاتف").fill("01001234567");
    await dialog.getByLabel("الرقم الضريبي").fill("300123456700003");
    await dialog.getByLabel("السجل التجاري").fill("1010123456");
    await dialog.getByLabel("العنوان").fill("القاهرة، مدينة نصر");
    await dialog.getByLabel("الحد الائتماني").fill("1500");
    await dialog.getByLabel("الرصيد الافتتاحي").fill("1234567.5");

    const requestPromise = page.waitForRequest(
      (req) => req.url() === `${API_URL}/customer` && req.method() === "POST",
    );
    // Enter in a field submits the form.
    await dialog.getByLabel("الرصيد الافتتاحي").press("Enter");
    const body = (await requestPromise).postDataJSON();

    expect(body).toEqual({
      name,
      phone: "01001234567",
      taxNumber: "300123456700003",
      commercialRecord: "1010123456",
      address: "القاهرة، مدينة نصر",
      creditLimit: 1500,
      openingBalance: 1234567.5,
    });
    expect(body).not.toHaveProperty("code");

    await expect(dialog).toBeHidden();
    const success = page.getByRole("alert").filter({ hasText: "تمت إضافة العميل بنجاح" });
    await expect(success).toBeVisible();

    const row = rowWith(page, name);
    await expect(row).toHaveCount(1);
    const cells = row.getByRole("cell");
    await expect(cells.nth(COL.code)).toHaveText(/^CUS-\d+$/);
    await expect(cells.nth(COL.phone)).toHaveText("01001234567");
    await expect(cells.nth(COL.creditLimit)).toHaveText("1,500.00");
    await expectBalanceCell(cells.nth(COL.openingBalance), "1,234,567.50", "مدين", "على العميل لنا");

    await expect(success).toBeHidden({ timeout: 7000 });
  });

  test("empty money fields are sent as 0 and shown as 0.00", async ({ page }) => {
    const name = `عميل صفر ${tag}`;
    await page.goto("/customers");
    await page.getByRole("button", { name: "إضافة عميل" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة عميل" });

    await dialog.getByLabel("الاسم").fill(name);
    await dialog.getByLabel("الحد الائتماني").fill("");
    await dialog.getByLabel("الرصيد الافتتاحي").fill("");

    const requestPromise = page.waitForRequest(
      (req) => req.url() === `${API_URL}/customer` && req.method() === "POST",
    );
    await dialog.getByRole("button", { name: "حفظ" }).click();
    const body = (await requestPromise).postDataJSON();
    // Empty optional text fields are left out on create; empty money is 0 (never null).
    expect(body).toEqual({ name, creditLimit: 0, openingBalance: 0 });

    const cells = rowWith(page, name).getByRole("cell");
    await expect(cells.nth(COL.creditLimit)).toHaveText("0.00");
    // 0 → the amount only, no مدين / دائن badge.
    await expectBalanceCell(cells.nth(COL.openingBalance), "0.00");
    await expect(cells.nth(COL.phone)).toHaveText("-");
  });

  test("opening balance −250.50 → 250.50 دائن (للعميل علينا); +100 → مدين (على العميل لنا)", async ({ page }) => {
    const cases = [
      { typed: "-250.50", sent: -250.5, amount: "250.50", label: "دائن", meaning: "للعميل علينا" },
      { typed: "100", sent: 100, amount: "100.00", label: "مدين", meaning: "على العميل لنا" },
    ];
    await page.goto("/customers");

    for (const [index, item] of cases.entries()) {
      const name = `عميل رصيد ${index} ${tag}`;
      await page.getByRole("button", { name: "إضافة عميل" }).first().click();
      const dialog = page.getByRole("dialog", { name: "إضافة عميل" });
      await dialog.getByLabel("الاسم").fill(name);
      await dialog.getByLabel("الرصيد الافتتاحي").fill(item.typed);
      await expect(dialog.getByText(`سيتم تسجيله: ${item.amount} ${item.label} — ${item.meaning}`)).toBeVisible();

      const requestPromise = page.waitForRequest(
        (req) => req.url() === `${API_URL}/customer` && req.method() === "POST",
      );
      await dialog.getByRole("button", { name: "حفظ" }).click();
      expect((await requestPromise).postDataJSON().openingBalance).toBe(item.sent);

      await expect(dialog).toBeHidden();
      const cell = rowWith(page, name).getByRole("cell").nth(COL.openingBalance);
      await expectBalanceCell(cell, item.amount, item.label, item.meaning);
    }
  });

  test("form: the opening balance preview updates while typing and hides for 0, empty and invalid", async ({
    page,
  }) => {
    await page.goto("/customers");
    await page.getByRole("button", { name: "إضافة عميل" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة عميل" });
    const balance = dialog.getByLabel("الرصيد الافتتاحي");
    const preview = dialog.getByText("سيتم تسجيله:");

    // The hint is always there; the preview starts hidden (the field starts at 0).
    await expect(dialog.getByText("اكتب الرقم موجب لو العميل عليه فلوس، وسالب لو له فلوس عندنا")).toBeVisible();
    await expect(balance).toHaveValue("0");
    await expect(preview).toHaveCount(0);

    // Typed character by character: the preview follows every keystroke.
    await balance.fill("");
    await balance.pressSequentially("-250.5");
    await expect(preview).toHaveText("سيتم تسجيله: 250.50 دائن — للعميل علينا");
    await balance.fill("1500");
    await expect(preview).toHaveText("سيتم تسجيله: 1,500.00 مدين — على العميل لنا");

    for (const value of ["0", "", "abc", "10.555"]) {
      await balance.fill(value);
      await expect(preview).toHaveCount(0);
    }
  });

  test("validation: name, 3 decimals and a negative credit limit show Arabic errors and send no request", async ({
    page,
  }) => {
    const sent = recordWrites(page);
    await page.goto("/customers");
    await page.getByRole("button", { name: "إضافة عميل" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة عميل" });
    const save = dialog.getByRole("button", { name: "حفظ" });

    // Only spaces counts as empty.
    await dialog.getByLabel("الاسم").fill("   ");
    await save.click();
    await expect(dialog.getByText("الاسم مطلوب")).toBeVisible();
    await dialog.getByLabel("الاسم").fill(`عميل خطأ ${tag}`);

    // More than 2 decimals.
    await dialog.getByLabel("الحد الائتماني").fill("10.123");
    await dialog.getByLabel("الرصيد الافتتاحي").fill("5.555");
    await save.click();
    await expect(dialog.getByText("الحد الأقصى رقمان بعد العلامة العشرية")).toHaveCount(2);

    // Credit limit below 0 (the opening balance may be negative, the credit limit may not).
    await dialog.getByLabel("الحد الائتماني").fill("-1");
    await dialog.getByLabel("الرصيد الافتتاحي").fill("-1");
    await save.click();
    await expect(dialog.getByText("القيمة يجب ألا تقل عن 0")).toHaveCount(1);

    // Not a number.
    await dialog.getByLabel("الحد الائتماني").fill("abc");
    await save.click();
    await expect(dialog.getByText("أدخل رقماً صالحاً")).toBeVisible();

    await expect(dialog).toBeVisible();
    expect(sent).toEqual([]);
  });

  test("search finds a customer by name, code, phone and tax number", async ({ page, request }) => {
    const customer = await createByApi(request, token, "/customer", {
      name: `عميل بحث ${tag}`,
      phone: `010${tag}`,
      taxNumber: `TAX-${tag}`,
    });
    await page.goto("/customers");
    await expect(rowWith(page, customer.name)).toHaveCount(1);

    const search = page.getByPlaceholder("ابحث بالاسم أو الكود أو الهاتف أو الرقم الضريبي");
    for (const text of [`  ${customer.name}  `, customer.code.toLowerCase(), `010${tag}`, `tax-${tag}`]) {
      await search.fill(text);
      await expect(rowWith(page, customer.name)).toHaveCount(1);
      await expect(page.getByText("عدد العملاء: 1")).toBeVisible();
    }

    await search.fill(`لا يوجد ${tag} xyz`);
    await expect(page.getByText("لا توجد نتائج مطابقة للبحث")).toBeVisible();
    await expect(page.getByText("عدد العملاء: 0")).toBeVisible();
  });

  test("edit: fields are prefilled; emptying phone, tax number, record and address sends null and clears them", async ({
    page,
    request,
  }) => {
    const customer = await createByApi(request, token, "/customer", {
      name: `عميل قديم ${tag}`,
      phone: "0501234567",
      taxNumber: "300123456700003",
      commercialRecord: "1010123456",
      address: "القاهرة",
      creditLimit: 10000,
      openingBalance: 1500.5,
    });
    const newName = `عميل معدل ${tag}`;
    await page.goto("/customers");

    await page.getByRole("button", { name: `تعديل ${customer.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل العميل" });
    await expect(dialog).toBeVisible();

    const code = dialog.getByLabel("الكود");
    await expect(code).toHaveValue(customer.code);
    await expect(code).toHaveAttribute("readonly", "");
    await expect(dialog.getByLabel("الاسم")).toHaveValue(customer.name);
    await expect(dialog.getByLabel("الهاتف")).toHaveValue("0501234567");
    await expect(dialog.getByLabel("الحد الائتماني")).toHaveValue("10000");
    await expect(dialog.getByLabel("الرصيد الافتتاحي")).toHaveValue("1500.5");

    await dialog.getByLabel("الاسم").fill(newName);
    for (const label of ["الهاتف", "الرقم الضريبي", "السجل التجاري", "العنوان"]) {
      await dialog.getByLabel(label).fill("");
    }
    await dialog.getByLabel("الحد الائتماني").fill("20000.75");

    const requestPromise = page.waitForRequest(
      (req) => req.url() === `${API_URL}/customer/${customer.id}` && req.method() === "PATCH",
    );
    await dialog.getByRole("button", { name: "حفظ" }).click();
    const body = (await requestPromise).postDataJSON();
    expect(body).toEqual({
      name: newName,
      phone: null,
      taxNumber: null,
      commercialRecord: null,
      address: null,
      creditLimit: 20000.75,
      openingBalance: 1500.5,
    });

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل العميل بنجاح" })).toBeVisible();
    const cells = rowWith(page, newName).getByRole("cell");
    await expect(cells.nth(COL.code)).toHaveText(customer.code);
    await expect(cells.nth(COL.phone)).toHaveText("-");
    await expect(cells.nth(COL.creditLimit)).toHaveText("20,000.75");
    await expectBalanceCell(cells.nth(COL.openingBalance), "1,500.50", "مدين", "على العميل لنا");
    await expect(rowWith(page, customer.name)).toHaveCount(0);

    // The API agrees: the four fields are really cleared (null, not "").
    const response = await request.get(`${API_URL}/customer/${customer.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await response.json()).data).toMatchObject({
      phone: null,
      taxNumber: null,
      commercialRecord: null,
      address: null,
    });
  });

  test('delete: "إلغاء" keeps the customer, "حذف العميل" removes it', async ({ page, request }) => {
    const customer = await createByApi(request, token, "/customer", { name: `عميل حذف ${tag}` });
    await page.goto("/customers");
    await expect(rowWith(page, customer.name)).toHaveCount(1);

    // Cancel
    await page.getByRole("button", { name: `حذف ${customer.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "حذف العميل" });
    await expect(dialog).toContainText(`هل أنت متأكد من حذف العميل "${customer.name}"؟`);
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    await expect(rowWith(page, customer.name)).toHaveCount(1);

    // Confirm
    await page.getByRole("button", { name: `حذف ${customer.name}` }).click();
    await dialog.getByRole("button", { name: "حذف العميل" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم حذف العميل بنجاح" })).toBeVisible();
    await expect(rowWith(page, customer.name)).toHaveCount(0);

    const response = await request.get(`${API_URL}/customer/${customer.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(404);
  });

  test("unsaved changes: closing a changed form asks first", async ({ page }) => {
    await page.goto("/customers");
    await page.getByRole("button", { name: "إضافة عميل" }).first().click();
    const form = page.getByRole("dialog", { name: "إضافة عميل" });
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    // Changing only a money field also counts as a change.
    await form.getByLabel("الحد الائتماني").fill("500");

    await page.keyboard.press("Escape");
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "إلغاء" }).click();
    await expect(discard).toBeHidden();
    await expect(form.getByLabel("الحد الائتماني")).toHaveValue("500");

    await form.getByRole("button", { name: "إغلاق" }).click();
    await expect(discard).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(discard).toBeHidden();
    await expect(form).toBeVisible();

    await form.getByRole("button", { name: "إلغاء" }).click();
    await discard.getByRole("button", { name: "تجاهل التغييرات" }).click();
    await expect(discard).toBeHidden();
    await expect(form).toBeHidden();
  });

  test("unsaved changes: an untouched form closes without asking", async ({ page, request }) => {
    const customer = await createByApi(request, token, "/customer", {
      name: `عميل بدون تغيير ${tag}`,
      creditLimit: 1000.5,
      openingBalance: -20,
    });
    await page.goto("/customers");
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    await page.getByRole("button", { name: "إضافة عميل" }).first().click();
    const addForm = page.getByRole("dialog", { name: "إضافة عميل" });
    await addForm.getByRole("button", { name: "إلغاء" }).click();
    await expect(addForm).toBeHidden();

    await page.getByRole("button", { name: `تعديل ${customer.name}` }).click();
    const editForm = page.getByRole("dialog", { name: "تعديل العميل" });
    await expect(editForm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editForm).toBeHidden();

    await expect(discard).toHaveCount(0);
  });
});

test.describe("mocked API", () => {
  // Answers GET /customer with the given status + body.
  function mockCustomers(page, status, body) {
    return page.route(
      (url) => url.pathname === "/customer",
      (route) =>
        route.fulfill({ status, json: body, headers: { "Access-Control-Allow-Origin": "*" } }),
    );
  }

  test.describe("API error", () => {
    // The browser logs the failed request itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("shows ErrorState, retry loads the list, money strings get 2 decimals", async ({ page }) => {
      await setFakeSession(page);
      await mockCustomers(page, 500, {
        statusCode: 500,
        message: "Internal server error",
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        field: null,
      });
      await page.goto("/customers");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();

      await page.unroute((url) => url.pathname === "/customer");
      await mockCustomers(page, 200, {
        message: "Customers returned successfully",
        data: [
          {
            id: "c1",
            code: "CUS-000001",
            name: "عميل وهمي",
            taxNumber: null,
            commercialRecord: null,
            phone: null,
            address: null,
            creditLimit: "1500",
            openingBalance: "-250.5",
            createdAt: "2026-11-21T10:00:00.000Z",
            updatedAt: "2026-11-21T10:00:00.000Z",
            deletedAt: null,
          },
        ],
      });
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();

      const cells = rowWith(page, "عميل وهمي").getByRole("cell");
      await expect(cells.nth(COL.code)).toHaveText("CUS-000001");
      await expect(cells.nth(COL.phone)).toHaveText("-");
      await expect(cells.nth(COL.creditLimit)).toHaveText("1,500.00");
      await expectBalanceCell(cells.nth(COL.openingBalance), "250.50", "دائن", "للعميل علينا");
      await expect(page.getByText("عدد العملاء: 1")).toBeVisible();
    });
  });

  test("empty list shows EmptyState with the add button", async ({ page }) => {
    await setFakeSession(page);
    await mockCustomers(page, 200, { message: "Customers returned successfully", data: [] });
    await page.goto("/customers");

    const empty = page.getByText("لا يوجد عملاء بعد").locator("..");
    await expect(empty).toBeVisible();
    await empty.getByRole("button", { name: "إضافة عميل" }).click();
    await expect(page.getByRole("dialog", { name: "إضافة عميل" })).toBeVisible();
  });
});
