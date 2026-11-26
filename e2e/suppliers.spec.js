// Suppliers page (الموردين) — same approach as branches.spec.js.
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// Every test creates its own suppliers with a unique random tag in the name, and afterEach
// deletes every supplier with that tag through the API (also when the test failed).
//
// "mocked API" tests fake the /supplier endpoint with page.route (no backend needed).
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
  expectStackedCell,
  randomTag,
  API_URL,
  API_DOWN_MESSAGE,
} from "./helpers";

// Column order in the table. Stacked (StackedCell, so the table fits without scrolling):
// the contact person under the name; "الهاتف / البريد" = the phone with the email under it ("-" when both are empty).
const COL = { code: 0, name: 1, contact: 2, openingBalance: 3 };

const SEARCH_PLACEHOLDER = "ابحث بالاسم أو الكود أو الهاتف أو الشخص المسؤول أو البريد";

// The table row that contains this text.
function rowWith(page, text) {
  return page.getByRole("row").filter({ hasText: text });
}

// Collects every POST / PATCH / DELETE sent to /supplier.
function recordWrites(page) {
  const sent = [];
  page.on("request", (req) => {
    if (req.url().startsWith(`${API_URL}/supplier`) && req.method() !== "GET" && req.method() !== "OPTIONS") {
      sent.push({ method: req.method(), body: req.postDataJSON() });
    }
  });
  return sent;
}

test.describe("with backend", () => {
  let token;
  let tag; // unique per test, part of every supplier name this test creates

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);

    tag = randomTag();
    const session = await apiLogin(request);
    token = session.access_token;
    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;
    await deleteByTag(request, token, "/supplier", tag);
    tag = undefined;
  });

  test("opens from the Sidebar link with no console errors", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "الموردين" }).click();

    await expect(page).toHaveURL(/\/suppliers$/);
    await expect(page.getByRole("heading", { name: "الموردين" })).toBeVisible();
    await expect(page.getByText("بيانات الموردين والأرصدة الافتتاحية")).toBeVisible();
    await expect(page.getByText("جارٍ تحميل الموردين...")).toBeHidden();
  });

  test("add a supplier → numbers in the body, no code → row with code and 2-decimal money", async ({ page }) => {
    const name = `مورد اختبار ${tag}`;
    const email = `supplier.${tag}@example.com`;
    await page.goto("/suppliers");

    await page.getByRole("button", { name: "إضافة مورد" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة مورد" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("الاسم")).toBeFocused();
    await expect(dialog.getByLabel("الكود")).toHaveCount(0);
    await expect(dialog.getByLabel("الرصيد الافتتاحي")).toHaveValue("0");
    await expect(dialog.getByLabel("البريد الإلكتروني")).toHaveAttribute("dir", "ltr");
    await expect(dialog.getByLabel("الرصيد الافتتاحي")).toHaveAttribute("dir", "ltr");

    await dialog.getByLabel("الاسم").fill(name);
    await dialog.getByLabel("الشخص المسؤول").fill("أحمد محمد");
    await dialog.getByLabel("الهاتف").fill("01001234567");
    await dialog.getByLabel("البريد الإلكتروني").fill(`  ${email}  `);
    await dialog.getByLabel("الرقم الضريبي").fill("123-456-789");
    await dialog.getByLabel("الرصيد الافتتاحي").fill("1500");

    const requestPromise = page.waitForRequest(
      (req) => req.url() === `${API_URL}/supplier` && req.method() === "POST",
    );
    await dialog.getByLabel("الرصيد الافتتاحي").press("Enter");
    const body = (await requestPromise).postDataJSON();

    expect(body).toEqual({
      name,
      contactPerson: "أحمد محمد",
      phone: "01001234567",
      email,
      taxNumber: "123-456-789",
      openingBalance: 1500,
    });
    expect(body).not.toHaveProperty("code");

    await expect(dialog).toBeHidden();
    const success = page.getByRole("alert").filter({ hasText: "تمت إضافة المورد بنجاح" });
    await expect(success).toBeVisible();

    const cells = rowWith(page, name).getByRole("cell");
    await expect(cells.nth(COL.code)).toHaveText(/^SUP-\d+$/);
    await expectStackedCell(cells.nth(COL.name), name, "أحمد محمد");
    await expectStackedCell(cells.nth(COL.contact), "01001234567", email);
    await expect(cells.nth(COL.contact).locator("span[dir=ltr]")).toHaveText(["01001234567", email]);
    await expectBalanceCell(cells.nth(COL.openingBalance), "1,500.00", "دائن", "علينا للمورد");

    await expect(success).toBeHidden({ timeout: 7000 });
  });

  test("empty optional fields are left out on create; empty money is sent as 0", async ({ page }) => {
    const name = `مورد بدون بريد ${tag}`;
    await page.goto("/suppliers");
    await page.getByRole("button", { name: "إضافة مورد" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة مورد" });

    await dialog.getByLabel("الاسم").fill(name);
    await dialog.getByLabel("الرصيد الافتتاحي").fill("");

    const requestPromise = page.waitForRequest(
      (req) => req.url() === `${API_URL}/supplier` && req.method() === "POST",
    );
    await dialog.getByRole("button", { name: "حفظ" }).click();
    const body = (await requestPromise).postDataJSON();
    expect(body).toEqual({ name, openingBalance: 0 });

    await expect(page.getByRole("alert").filter({ hasText: "تمت إضافة المورد بنجاح" })).toBeVisible();
    const cells = rowWith(page, name).getByRole("cell");
    // No contact person, phone or email: the name alone, "-" for the contact.
    await expectStackedCell(cells.nth(COL.name), name, null);
    await expect(cells.nth(COL.contact)).toHaveText("-");
    // 0 → the amount only, no مدين / دائن badge.
    await expectBalanceCell(cells.nth(COL.openingBalance), "0.00");
  });

  test("validation: name, invalid email and 3 decimals show Arabic errors and send no request", async ({
    page,
  }) => {
    const sent = recordWrites(page);
    await page.goto("/suppliers");
    await page.getByRole("button", { name: "إضافة مورد" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة مورد" });
    const save = dialog.getByRole("button", { name: "حفظ" });

    await save.click();
    await expect(dialog.getByText("الاسم مطلوب")).toBeVisible();
    await dialog.getByLabel("الاسم").fill(`مورد خطأ ${tag}`);

    await dialog.getByLabel("البريد الإلكتروني").fill("not-an-email");
    await save.click();
    await expect(dialog.getByText("البريد الإلكتروني غير صحيح")).toBeVisible();
    await dialog.getByLabel("البريد الإلكتروني").fill("");

    await dialog.getByLabel("الرصيد الافتتاحي").fill("-10.999");
    await save.click();
    await expect(dialog.getByText("الحد الأقصى رقمان بعد العلامة العشرية")).toBeVisible();
    // A negative opening balance is allowed (../backend/doc/week1/supplier.txt): no minimum error.
    await expect(dialog.getByText("القيمة يجب ألا تقل عن 0")).toHaveCount(0);

    await expect(dialog).toBeVisible();
    expect(sent).toEqual([]);
  });

  test("opening balance −500 is accepted → 500.00 مدين (لنا عند المورد); +500 → دائن (علينا للمورد)", async ({
    page,
  }) => {
    const cases = [
      { typed: "-500", sent: -500, label: "مدين", meaning: "لنا عند المورد" },
      { typed: "500", sent: 500, label: "دائن", meaning: "علينا للمورد" },
    ];
    await page.goto("/suppliers");

    for (const [index, item] of cases.entries()) {
      const name = `مورد رصيد ${index} ${tag}`;
      await page.getByRole("button", { name: "إضافة مورد" }).first().click();
      const dialog = page.getByRole("dialog", { name: "إضافة مورد" });
      await dialog.getByLabel("الاسم").fill(name);
      await dialog.getByLabel("الرصيد الافتتاحي").fill(item.typed);
      await expect(dialog.getByText(`سيتم تسجيله: 500.00 ${item.label} — ${item.meaning}`)).toBeVisible();

      const requestPromise = page.waitForRequest(
        (req) => req.url() === `${API_URL}/supplier` && req.method() === "POST",
      );
      await dialog.getByRole("button", { name: "حفظ" }).click();
      expect((await requestPromise).postDataJSON().openingBalance).toBe(item.sent);

      // Accepted by the backend (negative balances are allowed, see ../backend/doc/week1/supplier.txt).
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("alert").filter({ hasText: "تمت إضافة المورد بنجاح" })).toBeVisible();
      const cell = rowWith(page, name).getByRole("cell").nth(COL.openingBalance);
      await expectBalanceCell(cell, "500.00", item.label, item.meaning);
    }
  });

  test("form: the opening balance preview updates while typing and hides for 0, empty and invalid", async ({
    page,
  }) => {
    await page.goto("/suppliers");
    await page.getByRole("button", { name: "إضافة مورد" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة مورد" });
    const balance = dialog.getByLabel("الرصيد الافتتاحي");
    const preview = dialog.getByText("سيتم تسجيله:");

    await expect(
      dialog.getByText("اكتب الرقم موجب لو علينا فلوس للمورد، وسالب لو المورد عليه فلوس لنا"),
    ).toBeVisible();
    await expect(preview).toHaveCount(0);

    await balance.fill("");
    await balance.pressSequentially("-75.2");
    await expect(preview).toHaveText("سيتم تسجيله: 75.20 مدين — لنا عند المورد");
    await balance.fill("2500.5");
    await expect(preview).toHaveText("سيتم تسجيله: 2,500.50 دائن — علينا للمورد");

    for (const value of ["0", "", "-", "1.234"]) {
      await balance.fill(value);
      await expect(preview).toHaveCount(0);
    }
  });

  test("search finds a supplier by name, code, phone, contact person and email", async ({ page, request }) => {
    const supplier = await createByApi(request, token, "/supplier", {
      name: `مورد بحث ${tag}`,
      phone: `011${tag}`,
      contactPerson: `مسؤول ${tag}`,
      email: `Search.${tag}@Example.com`,
    });
    await page.goto("/suppliers");
    await expect(rowWith(page, supplier.name)).toHaveCount(1);

    const search = page.getByPlaceholder(SEARCH_PLACEHOLDER);
    for (const text of [
      `  ${supplier.name}  `,
      supplier.code.toLowerCase(),
      `011${tag}`,
      `مسؤول ${tag}`,
      `search.${tag}@example.com`,
    ]) {
      await search.fill(text);
      await expect(rowWith(page, supplier.name)).toHaveCount(1);
      await expect(page.getByText("عدد الموردين: 1")).toBeVisible();
    }

    await search.fill(`لا يوجد ${tag} xyz`);
    await expect(page.getByText("لا توجد نتائج مطابقة للبحث")).toBeVisible();
    await expect(page.getByText("عدد الموردين: 0")).toBeVisible();
  });

  test('edit: emptying contact person, phone, email and tax number sends null → "-" and cleared', async ({
    page,
    request,
  }) => {
    const supplier = await createByApi(request, token, "/supplier", {
      name: `مورد قديم ${tag}`,
      contactPerson: "أحمد",
      phone: "01001234567",
      email: `old.${tag}@example.com`,
      taxNumber: "123-456-789",
      openingBalance: 1500,
    });
    const newName = `مورد معدل ${tag}`;
    await page.goto("/suppliers");

    await page.getByRole("button", { name: `تعديل ${supplier.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل المورد" });
    await expect(dialog).toBeVisible();

    const code = dialog.getByLabel("الكود");
    await expect(code).toHaveValue(supplier.code);
    await expect(code).toHaveAttribute("readonly", "");
    await expect(dialog.getByLabel("البريد الإلكتروني")).toHaveValue(supplier.email);
    await expect(dialog.getByLabel("الرصيد الافتتاحي")).toHaveValue("1500");

    await dialog.getByLabel("الاسم").fill(newName);
    for (const label of ["الشخص المسؤول", "الهاتف", "البريد الإلكتروني", "الرقم الضريبي"]) {
      await dialog.getByLabel(label).fill("");
    }
    await dialog.getByLabel("الرصيد الافتتاحي").fill("99.9");

    const requestPromise = page.waitForRequest(
      (req) => req.url() === `${API_URL}/supplier/${supplier.id}` && req.method() === "PATCH",
    );
    await dialog.getByRole("button", { name: "حفظ" }).click();
    const body = (await requestPromise).postDataJSON();
    expect(body).toEqual({
      name: newName,
      contactPerson: null,
      phone: null,
      email: null,
      taxNumber: null,
      openingBalance: 99.9,
    });

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل المورد بنجاح" })).toBeVisible();
    const cells = rowWith(page, newName).getByRole("cell");
    await expect(cells.nth(COL.code)).toHaveText(supplier.code);
    await expectStackedCell(cells.nth(COL.name), newName, null);
    await expect(cells.nth(COL.contact)).toHaveText("-");
    await expectBalanceCell(cells.nth(COL.openingBalance), "99.90", "دائن", "علينا للمورد");

    // The API agrees: the four fields are really cleared (null, not "").
    const response = await request.get(`${API_URL}/supplier/${supplier.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await response.json()).data).toMatchObject({
      contactPerson: null,
      phone: null,
      email: null,
      taxNumber: null,
    });
  });

  test("edit: an invalid email shows an Arabic error and sends no request", async ({ page, request }) => {
    const supplier = await createByApi(request, token, "/supplier", { name: `مورد بريد ${tag}` });
    const sent = recordWrites(page);
    await page.goto("/suppliers");

    await page.getByRole("button", { name: `تعديل ${supplier.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل المورد" });
    await dialog.getByLabel("البريد الإلكتروني").fill("ahmed@example");
    await dialog.getByRole("button", { name: "حفظ" }).click();

    await expect(dialog.getByText("البريد الإلكتروني غير صحيح")).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(sent).toEqual([]);
  });

  test('delete: "إلغاء" keeps the supplier, "حذف المورد" removes it', async ({ page, request }) => {
    const supplier = await createByApi(request, token, "/supplier", { name: `مورد حذف ${tag}` });
    await page.goto("/suppliers");
    await expect(rowWith(page, supplier.name)).toHaveCount(1);

    await page.getByRole("button", { name: `حذف ${supplier.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "حذف المورد" });
    await expect(dialog).toContainText(`هل أنت متأكد من حذف المورد "${supplier.name}"؟`);
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    await expect(rowWith(page, supplier.name)).toHaveCount(1);

    await page.getByRole("button", { name: `حذف ${supplier.name}` }).click();
    await dialog.getByRole("button", { name: "حذف المورد" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم حذف المورد بنجاح" })).toBeVisible();
    await expect(rowWith(page, supplier.name)).toHaveCount(0);

    const response = await request.get(`${API_URL}/supplier/${supplier.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(404);
  });

  test("unsaved changes: closing a changed form asks first", async ({ page }) => {
    await page.goto("/suppliers");
    await page.getByRole("button", { name: "إضافة مورد" }).first().click();
    const form = page.getByRole("dialog", { name: "إضافة مورد" });
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    await form.getByLabel("الاسم").fill(`مورد لن يحفظ ${tag}`);

    await page.keyboard.press("Escape");
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "إلغاء" }).click();
    await expect(discard).toBeHidden();
    await expect(form.getByLabel("الاسم")).toHaveValue(`مورد لن يحفظ ${tag}`);

    await form.getByRole("button", { name: "إغلاق" }).click();
    await expect(discard).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(discard).toBeHidden();
    await expect(form).toBeVisible();

    await form.getByRole("button", { name: "إلغاء" }).click();
    await discard.getByRole("button", { name: "تجاهل التغييرات" }).click();
    await expect(discard).toBeHidden();
    await expect(form).toBeHidden();
    await expect(rowWith(page, tag)).toHaveCount(0);
  });

  test("unsaved changes: an untouched form closes without asking", async ({ page, request }) => {
    const supplier = await createByApi(request, token, "/supplier", {
      name: `مورد بدون تغيير ${tag}`,
      email: `same.${tag}@example.com`,
      openingBalance: 10.5,
    });
    await page.goto("/suppliers");
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    await page.getByRole("button", { name: "إضافة مورد" }).first().click();
    const addForm = page.getByRole("dialog", { name: "إضافة مورد" });
    await addForm.getByRole("button", { name: "إلغاء" }).click();
    await expect(addForm).toBeHidden();

    await page.getByRole("button", { name: `تعديل ${supplier.name}` }).click();
    const editForm = page.getByRole("dialog", { name: "تعديل المورد" });
    await expect(editForm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editForm).toBeHidden();

    await expect(discard).toHaveCount(0);
  });
});

test.describe("mocked API", () => {
  // Answers GET /supplier with the given status + body.
  function mockSuppliers(page, status, body) {
    return page.route(
      (url) => url.pathname === "/supplier",
      (route) =>
        route.fulfill({ status, json: body, headers: { "Access-Control-Allow-Origin": "*" } }),
    );
  }

  test.describe("API error", () => {
    // The browser logs the failed request itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("shows ErrorState, retry loads the list, money strings get 2 decimals", async ({ page }) => {
      await setFakeSession(page);
      await mockSuppliers(page, 500, {
        statusCode: 500,
        message: "Internal server error",
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        field: null,
      });
      await page.goto("/suppliers");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();

      await page.unroute((url) => url.pathname === "/supplier");
      await mockSuppliers(page, 200, {
        message: "Suppliers returned successfully",
        data: [
          {
            id: "s1",
            code: "SUP-000001",
            name: "مورد وهمي",
            taxNumber: null,
            contactPerson: null,
            phone: null,
            email: null,
            openingBalance: "1234567.5",
            createdAt: "2026-11-21T10:00:00.000Z",
            updatedAt: "2026-11-21T10:00:00.000Z",
            deletedAt: null,
          },
        ],
      });
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();

      const cells = rowWith(page, "مورد وهمي").getByRole("cell");
      await expect(cells.nth(COL.code)).toHaveText("SUP-000001");
      await expectStackedCell(cells.nth(COL.name), "مورد وهمي", null);
      await expect(cells.nth(COL.contact)).toHaveText("-");
      await expectBalanceCell(cells.nth(COL.openingBalance), "1,234,567.50", "دائن", "علينا للمورد");
      await expect(page.getByText("عدد الموردين: 1")).toBeVisible();
    });
  });

  test("empty list shows EmptyState with the add button", async ({ page }) => {
    await setFakeSession(page);
    await mockSuppliers(page, 200, { message: "Suppliers returned successfully", data: [] });
    await page.goto("/suppliers");

    const empty = page.getByText("لا يوجد موردين بعد").locator("..");
    await expect(empty).toBeVisible();
    await empty.getByRole("button", { name: "إضافة مورد" }).click();
    await expect(page.getByRole("dialog", { name: "إضافة مورد" })).toBeVisible();
  });
});
