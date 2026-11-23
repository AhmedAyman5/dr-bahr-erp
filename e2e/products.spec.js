// Products page (الأصناف) — same approach as branches.spec.js.
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// beforeEach creates a test category + unit; every product name contains a unique random tag.
// afterEach deletes the tagged products FIRST, then the tagged categories and units (the backend
// refuses to delete a category / unit that an active product uses) — also when the test failed.
// Barcodes are random every run: soft delete keeps a used barcode reserved forever.
//
// "mocked API" tests fake /products, /categories and /item-unit with page.route (no backend needed).
import {
  test,
  expect,
  setSession,
  setFakeSession,
  isApiUp,
  apiLogin,
  createByApi,
  deleteByTag,
  randomTag,
  API_URL,
  API_DOWN_MESSAGE,
} from "./helpers";

// Column order in the table.
const COL = {
  code: 0,
  barcode: 1,
  name: 2,
  category: 3,
  unit: 4,
  type: 5,
  retailPrice: 6,
  wholesalePrice: 7,
  bulkWholesalePrice: 8,
};

const PRICE_ORDER_WARNING =
  "تنبيه: المعتاد أن يكون سعر التجزئة ≥ سعر الجملة ≥ سعر جملة الجملة. راجع الأسعار قبل الحفظ.";

// The table row that contains this text.
function rowWith(page, text) {
  return page.getByRole("row").filter({ hasText: text });
}

// A barcode no earlier run has used.
function randomBarcode() {
  return `BC${Date.now()}${randomTag()}`;
}

// Collects every POST / PATCH / DELETE sent to /products.
function recordWrites(page) {
  const sent = [];
  page.on("request", (req) => {
    if (req.url().startsWith(`${API_URL}/products`) && req.method() !== "GET" && req.method() !== "OPTIONS") {
      sent.push({ method: req.method(), body: req.postDataJSON() });
    }
  });
  return sent;
}

function waitForProductWrite(page, method, url = `${API_URL}/products`) {
  return page.waitForRequest((req) => req.url() === url && req.method() === method);
}

test.describe("with backend", () => {
  let token;
  let tag; // unique per test, part of every product / category / unit name this test creates
  let category; // created before every test
  let unit; // created before every test

  // Creates a product through the API. Name must contain the tag (for cleanup).
  function createProduct(request, body) {
    return createByApi(request, token, "/products", {
      categoryId: category.id,
      primaryItemUnitId: unit.id,
      retailPrice: 15,
      wholesalePrice: 12.5,
      bulkWholesalePrice: 10,
      ...body,
    });
  }

  async function getProductFromApi(request, id) {
    const response = await request.get(`${API_URL}/products/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response;
  }

  // Opens the add form and fills the required fields.
  async function openAddAndFill(page, { name, retail = "15", wholesale = "12.5", bulk = "10" }) {
    await page.getByRole("button", { name: "إضافة صنف" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة صنف" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("الاسم").fill(name);
    await dialog.getByLabel("التصنيف").selectOption({ label: category.name });
    await dialog.getByLabel("الوحدة الأساسية").selectOption({ label: unit.name });
    await dialog.getByLabel("سعر التجزئة").fill(retail);
    await dialog.getByLabel("سعر الجملة").fill(wholesale);
    await dialog.getByLabel("سعر جملة الجملة").fill(bulk);
    return dialog;
  }

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);

    tag = randomTag();
    const session = await apiLogin(request);
    token = session.access_token;
    category = await createByApi(request, token, "/categories", { name: `تصنيف أصناف ${tag}` });
    unit = await createByApi(request, token, "/item-unit", { name: `وحدة أصناف ${tag}` });
    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;
    // Products first, then the categories and units they use.
    await deleteByTag(request, token, "/products", tag);
    await deleteByTag(request, token, "/categories", tag);
    await deleteByTag(request, token, "/item-unit", tag);
    tag = undefined;
  });

  test("opens from the Sidebar link (group الأصناف والمخزون) with no console errors", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav.getByText("الأصناف والمخزون")).toBeVisible();
    await nav.getByRole("link", { name: "الأصناف" }).click();

    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByRole("heading", { name: "الأصناف" })).toBeVisible();
    await expect(page.getByText("الأصناف وأسعار البيع والتصنيفات")).toBeVisible();
    await expect(page.getByText("جارٍ تحميل الأصناف...")).toBeHidden();
    await expect(page.getByText("لإضافة صنف يجب إضافة تصنيف ووحدة أولاً")).toHaveCount(0);
  });

  test("add: defaults, numbers in the body, no code / costingMethod / empty barcode → row", async ({ page }) => {
    const name = `صنف اختبار ${tag}`;
    await page.goto("/products");

    await page.getByRole("button", { name: "إضافة صنف" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة صنف" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("الاسم")).toBeFocused();

    // Defaults in add mode.
    await expect(dialog.getByLabel("الكود")).toHaveCount(0);
    await expect(dialog.getByLabel("نوع الصنف")).toHaveValue("STOCK");
    const costing = dialog.getByLabel("طريقة حساب التكلفة");
    await expect(costing).toHaveValue("متوسط التكلفة المرجح");
    await expect(costing).toHaveAttribute("readonly", "");
    await expect(dialog.getByLabel("سعر التجزئة")).toHaveValue("");
    await expect(dialog.getByLabel("حد إعادة الطلب")).toHaveValue("0");
    await expect(dialog.getByLabel("للصنف تاريخ صلاحية")).not.toBeChecked();
    // Section titles.
    for (const title of ["البيانات الأساسية", "الأسعار", "المخزون"]) {
      await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
    }
    // Barcode and numbers are typed left-to-right.
    await expect(dialog.getByLabel("الباركود")).toHaveAttribute("dir", "ltr");
    await expect(dialog.getByLabel("سعر التجزئة")).toHaveAttribute("dir", "ltr");
    await expect(dialog.getByLabel("حد إعادة الطلب")).toHaveAttribute("dir", "ltr");

    await dialog.getByLabel("الاسم").fill(`  ${name}  `);
    await dialog.getByLabel("التصنيف").selectOption({ label: category.name });
    await dialog.getByLabel("الوحدة الأساسية").selectOption({ label: unit.name });
    await dialog.getByLabel("سعر التجزئة").fill("15");
    await dialog.getByLabel("سعر الجملة").fill("12.5");
    await dialog.getByLabel("سعر جملة الجملة").fill("10");
    await dialog.getByLabel("حد إعادة الطلب").fill("50");
    await dialog.getByLabel("للصنف تاريخ صلاحية").check();
    // Correct price order → no warning.
    await expect(dialog.getByText(PRICE_ORDER_WARNING)).toHaveCount(0);

    const requestPromise = waitForProductWrite(page, "POST");
    // Enter in a field submits the form.
    await dialog.getByLabel("حد إعادة الطلب").press("Enter");
    const body = (await requestPromise).postDataJSON();

    expect(body).toEqual({
      name,
      categoryId: category.id,
      primaryItemUnitId: unit.id,
      itemType: "STOCK",
      retailPrice: 15,
      wholesalePrice: 12.5,
      bulkWholesalePrice: 10,
      reorderLimit: 50,
      hasExpiryDate: true,
    });
    expect(body).not.toHaveProperty("barcode");
    expect(body).not.toHaveProperty("code");
    expect(body).not.toHaveProperty("costingMethod");

    await expect(dialog).toBeHidden();
    const success = page.getByRole("alert").filter({ hasText: "تمت إضافة الصنف بنجاح" });
    await expect(success).toBeVisible();

    const row = rowWith(page, name);
    await expect(row).toHaveCount(1);
    const cells = row.getByRole("cell");
    await expect(cells.nth(COL.code)).toHaveText(/^PRD-\d+$/);
    await expect(cells.nth(COL.barcode)).toHaveText("-");
    await expect(cells.nth(COL.category)).toHaveText(category.name);
    await expect(cells.nth(COL.unit)).toHaveText(unit.name);
    await expect(cells.nth(COL.type)).toHaveText("مخزني");
    await expect(cells.nth(COL.retailPrice)).toHaveText("15.00");
    await expect(cells.nth(COL.wholesalePrice)).toHaveText("12.50");
    await expect(cells.nth(COL.bulkWholesalePrice)).toHaveText("10.00");

    // The success message hides by itself after ~4 seconds.
    await expect(success).toBeHidden({ timeout: 7000 });
  });

  test("validation: name, category, unit and the 3 prices are required — Arabic errors, no request", async ({
    page,
  }) => {
    const sent = recordWrites(page);
    await page.goto("/products");
    await page.getByRole("button", { name: "إضافة صنف" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة صنف" });

    // reorderLimit is optional: emptied is fine.
    await dialog.getByLabel("حد إعادة الطلب").fill("");
    // Only spaces counts as empty.
    await dialog.getByLabel("الاسم").fill("   ");
    await dialog.getByRole("button", { name: "حفظ" }).click();

    await expect(dialog.getByText("الاسم مطلوب")).toBeVisible();
    await expect(dialog.getByText("التصنيف مطلوب")).toBeVisible();
    await expect(dialog.getByText("الوحدة الأساسية مطلوبة")).toBeVisible();
    await expect(dialog.getByText("السعر مطلوب")).toHaveCount(3);
    await expect(dialog.locator("p.text-red-600")).toHaveCount(6); // nothing for reorderLimit

    // Typing in a field clears its error.
    await dialog.getByLabel("سعر التجزئة").fill("5");
    await expect(dialog.getByText("السعر مطلوب")).toHaveCount(2);

    await expect(dialog).toBeVisible();
    expect(sent).toEqual([]);
  });

  test("decimals: 5 decimals and negative values are rejected, 4 decimals are saved and shown", async ({
    page,
  }) => {
    const sent = recordWrites(page);
    const name = `صنف كسور ${tag}`;
    await page.goto("/products");
    const dialog = await openAddAndFill(page, { name, retail: "1.23456", wholesale: "-1", bulk: "abc" });
    await dialog.getByLabel("حد إعادة الطلب").fill("-0.5");
    const save = dialog.getByRole("button", { name: "حفظ" });

    await save.click();
    await expect(dialog.getByText("الحد الأقصى 4 أرقام بعد العلامة العشرية")).toHaveCount(1);
    await expect(dialog.getByText("القيمة يجب ألا تقل عن 0")).toHaveCount(2); // wholesale + reorderLimit
    await expect(dialog.getByText("أدخل رقماً صالحاً")).toHaveCount(1);
    expect(sent).toEqual([]);

    await dialog.getByLabel("سعر التجزئة").fill("12.3456");
    await dialog.getByLabel("سعر الجملة").fill("10.5");
    await dialog.getByLabel("سعر جملة الجملة").fill("9.0001");
    await dialog.getByLabel("حد إعادة الطلب").fill("2.25");

    const requestPromise = waitForProductWrite(page, "POST");
    await save.click();
    const body = (await requestPromise).postDataJSON();
    expect(body.retailPrice).toBe(12.3456);
    expect(body.wholesalePrice).toBe(10.5);
    expect(body.bulkWholesalePrice).toBe(9.0001);
    expect(body.reorderLimit).toBe(2.25);

    await expect(page.getByRole("alert").filter({ hasText: "تمت إضافة الصنف بنجاح" })).toBeVisible();
    const cells = rowWith(page, name).getByRole("cell");
    await expect(cells.nth(COL.retailPrice)).toHaveText("12.3456");
    await expect(cells.nth(COL.wholesalePrice)).toHaveText("10.50");
    await expect(cells.nth(COL.bulkWholesalePrice)).toHaveText("9.0001");
  });

  test("price order: a warning (not an error) when retail < wholesale — the product still saves", async ({
    page,
  }) => {
    const name = `صنف أسعار ${tag}`;
    await page.goto("/products");
    const dialog = await openAddAndFill(page, { name, retail: "10", wholesale: "12", bulk: "8" });
    const warning = dialog.getByText(PRICE_ORDER_WARNING);

    await expect(warning).toBeVisible();
    await expect(warning.locator("..")).toHaveClass(/amber/);

    // Correct order → warning hides; wholesale < bulk → it shows again.
    await dialog.getByLabel("سعر الجملة").fill("9");
    await expect(warning).toBeHidden();
    await dialog.getByLabel("سعر جملة الجملة").fill("9.5");
    await expect(warning).toBeVisible();
    await dialog.getByLabel("سعر جملة الجملة").fill("8");
    await dialog.getByLabel("سعر الجملة").fill("12");
    await expect(warning).toBeVisible();

    const requestPromise = waitForProductWrite(page, "POST");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    const body = (await requestPromise).postDataJSON();
    expect([body.retailPrice, body.wholesalePrice, body.bulkWholesalePrice]).toEqual([10, 12, 8]);

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تمت إضافة الصنف بنجاح" })).toBeVisible();
    const cells = rowWith(page, name).getByRole("cell");
    await expect(cells.nth(COL.retailPrice)).toHaveText("10.00");
    await expect(cells.nth(COL.wholesalePrice)).toHaveText("12.00");
  });

  test('SERVICE type: sends itemType "SERVICE" and shows the خدمي badge', async ({ page }) => {
    const name = `صنف خدمي ${tag}`;
    await page.goto("/products");
    const dialog = await openAddAndFill(page, { name });
    await dialog.getByLabel("نوع الصنف").selectOption({ label: "خدمي" });

    const requestPromise = waitForProductWrite(page, "POST");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    const body = (await requestPromise).postDataJSON();
    expect(body.itemType).toBe("SERVICE");
    expect(body.hasExpiryDate).toBe(false);

    const badge = rowWith(page, name).getByRole("cell").nth(COL.type).getByText("خدمي");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveClass(/bg-slate-100/);
  });

  test("category filter + type filter + search (by barcode, name, code) work together", async ({ page, request }) => {
    const otherCategory = await createByApi(request, token, "/categories", { name: `تصنيف آخر ${tag}` });
    const barcode = randomBarcode();
    const stockA = await createProduct(request, { name: `صنف مخزني أ ${tag}`, barcode });
    const serviceA = await createProduct(request, { name: `صنف خدمي أ ${tag}`, itemType: "SERVICE" });
    const stockB = await createProduct(request, { name: `صنف مخزني ب ${tag}`, categoryId: otherCategory.id });
    await page.goto("/products");
    await expect(rowWith(page, tag)).toHaveCount(3);

    const categoryFilter = page.getByLabel("تصفية حسب التصنيف");
    const typeFilter = page.getByLabel("تصفية حسب النوع");
    const search = page.getByPlaceholder("ابحث بالاسم أو الكود أو الباركود");
    await search.fill(tag);

    // Category only.
    await categoryFilter.selectOption({ label: category.name });
    await expect(rowWith(page, stockA.name)).toHaveCount(1);
    await expect(rowWith(page, serviceA.name)).toHaveCount(1);
    await expect(rowWith(page, stockB.name)).toHaveCount(0);
    await expect(page.getByText("عدد الأصناف: 2")).toBeVisible();

    // Category + type.
    await typeFilter.selectOption({ label: "خدمي" });
    await expect(rowWith(page, serviceA.name)).toHaveCount(1);
    await expect(rowWith(page, stockA.name)).toHaveCount(0);
    await expect(page.getByText("عدد الأصناف: 1")).toBeVisible();

    // Type مخزني + all categories + search by barcode.
    await typeFilter.selectOption({ label: "مخزني" });
    await categoryFilter.selectOption({ label: "كل التصنيفات" });
    await search.fill(`  ${barcode.toLowerCase()}  `);
    await expect(rowWith(page, stockA.name)).toHaveCount(1);
    await expect(rowWith(page, stockA.name).getByRole("cell").nth(COL.barcode)).toHaveText(barcode);
    await expect(page.getByText("عدد الأصناف: 1")).toBeVisible();

    // Search by code.
    await search.fill(stockB.code);
    await expect(rowWith(page, stockB.name)).toHaveCount(1);
    await expect(page.getByText("عدد الأصناف: 1")).toBeVisible();

    // Other category + a product of the first one → nothing.
    await categoryFilter.selectOption({ label: otherCategory.name });
    await search.fill(stockA.name);
    await expect(page.getByText("لا توجد نتائج مطابقة")).toBeVisible();
    await expect(page.getByText("عدد الأصناف: 0")).toBeVisible();

    // Back to all.
    await categoryFilter.selectOption({ label: "كل التصنيفات" });
    await typeFilter.selectOption({ label: "كل الأنواع" });
    await search.fill(tag);
    await expect(rowWith(page, tag)).toHaveCount(3);
  });

  test("edit: fields are prefilled, code read-only, PATCH sends only documented fields", async ({ page, request }) => {
    const otherUnit = await createByApi(request, token, "/item-unit", { name: `وحدة أخرى ${tag}` });
    const barcode = randomBarcode();
    const product = await createProduct(request, {
      name: `صنف قديم ${tag}`,
      barcode,
      retailPrice: 20.5,
      wholesalePrice: 18,
      bulkWholesalePrice: 15.1234,
      reorderLimit: 30,
      hasExpiryDate: true,
    });
    const newName = `صنف معدل ${tag}`;
    await page.goto("/products");

    await page.getByRole("button", { name: `تعديل ${product.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل الصنف" });
    await expect(dialog).toBeVisible();

    const code = dialog.getByLabel("الكود");
    await expect(code).toHaveValue(product.code);
    await expect(code).toHaveAttribute("readonly", "");
    await expect(dialog.getByLabel("الاسم")).toHaveValue(product.name);
    await expect(dialog.getByLabel("الباركود")).toHaveValue(barcode);
    await expect(dialog.getByLabel("التصنيف")).toHaveValue(category.id);
    await expect(dialog.getByLabel("الوحدة الأساسية")).toHaveValue(unit.id);
    await expect(dialog.getByLabel("نوع الصنف")).toHaveValue("STOCK");
    await expect(dialog.getByLabel("سعر التجزئة")).toHaveValue("20.5");
    await expect(dialog.getByLabel("سعر الجملة")).toHaveValue("18");
    await expect(dialog.getByLabel("سعر جملة الجملة")).toHaveValue("15.1234");
    await expect(dialog.getByLabel("حد إعادة الطلب")).toHaveValue("30");
    await expect(dialog.getByLabel("للصنف تاريخ صلاحية")).toBeChecked();

    await dialog.getByLabel("الاسم").fill(newName);
    await dialog.getByLabel("الوحدة الأساسية").selectOption({ label: otherUnit.name });
    await dialog.getByLabel("سعر التجزئة").fill("22.75");
    await dialog.getByLabel("للصنف تاريخ صلاحية").uncheck();

    const requestPromise = waitForProductWrite(page, "PATCH", `${API_URL}/products/${product.id}`);
    await dialog.getByRole("button", { name: "حفظ" }).click();
    const body = (await requestPromise).postDataJSON();
    expect(body).toEqual({
      name: newName,
      barcode,
      categoryId: category.id,
      primaryItemUnitId: otherUnit.id,
      itemType: "STOCK",
      retailPrice: 22.75,
      wholesalePrice: 18,
      bulkWholesalePrice: 15.1234,
      reorderLimit: 30,
      hasExpiryDate: false,
    });

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل الصنف بنجاح" })).toBeVisible();
    const cells = rowWith(page, newName).getByRole("cell");
    await expect(cells.nth(COL.code)).toHaveText(product.code);
    await expect(cells.nth(COL.unit)).toHaveText(otherUnit.name);
    await expect(cells.nth(COL.retailPrice)).toHaveText("22.75");
    await expect(cells.nth(COL.bulkWholesalePrice)).toHaveText("15.1234");
    await expect(rowWith(page, product.name)).toHaveCount(0);
  });

  test.describe("barcode conflicts", () => {
    // The browser logs the 409 response itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 409/] });

    test("a duplicate barcode shows the Arabic \"already used\" error and keeps the form open", async ({
      page,
      request,
    }) => {
      const barcode = randomBarcode();
      await createProduct(request, { name: `صنف بباركود ${tag}`, barcode });
      const name = `صنف مكرر ${tag}`;
      await page.goto("/products");

      const dialog = await openAddAndFill(page, { name });
      await dialog.getByLabel("الباركود").fill(barcode);
      const requestPromise = waitForProductWrite(page, "POST");
      await dialog.getByRole("button", { name: "حفظ" }).click();
      expect((await requestPromise).postDataJSON().barcode).toBe(barcode);

      await expect(dialog.getByRole("alert")).toHaveText("الباركود مستخدم بالفعل، اختر قيمة أخرى");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("الاسم")).toHaveValue(name);
      await expect(rowWith(page, name)).toHaveCount(0);
    });
  });

  test("edit: clearing the barcode sends null — and a second product can clear its barcode too", async ({
    page,
    request,
  }) => {
    const first = await createProduct(request, { name: `صنف باركود 1 ${tag}`, barcode: randomBarcode() });
    const second = await createProduct(request, { name: `صنف باركود 2 ${tag}`, barcode: randomBarcode() });
    await page.goto("/products");

    for (const product of [first, second]) {
      await page.getByRole("button", { name: `تعديل ${product.name}` }).click();
      const dialog = page.getByRole("dialog", { name: "تعديل الصنف" });
      await expect(dialog.getByLabel("الباركود")).toHaveValue(product.barcode);
      await dialog.getByLabel("الباركود").fill("   ");

      const requestPromise = waitForProductWrite(page, "PATCH", `${API_URL}/products/${product.id}`);
      await dialog.getByRole("button", { name: "حفظ" }).click();
      expect((await requestPromise).postDataJSON().barcode).toBeNull();

      await expect(dialog).toBeHidden();
      await expect(page.getByRole("alert").filter({ hasText: "تم تعديل الصنف بنجاح" })).toBeVisible();
      await expect(rowWith(page, product.name).getByRole("cell").nth(COL.barcode)).toHaveText("-");

      const saved = (await (await getProductFromApi(request, product.id)).json()).data;
      expect(saved.barcode).toBeNull();
    }
  });

  test('delete: "إلغاء" keeps the product, "حذف الصنف" removes it', async ({ page, request }) => {
    const product = await createProduct(request, { name: `صنف حذف ${tag}` });
    await page.goto("/products");
    await expect(rowWith(page, product.name)).toHaveCount(1);

    // Cancel
    await page.getByRole("button", { name: `حذف ${product.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "حذف الصنف" });
    await expect(dialog).toContainText(`هل أنت متأكد من حذف الصنف "${product.name}"؟`);
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    await expect(rowWith(page, product.name)).toHaveCount(1);

    // Confirm
    await page.getByRole("button", { name: `حذف ${product.name}` }).click();
    await dialog.getByRole("button", { name: "حذف الصنف" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم حذف الصنف بنجاح" })).toBeVisible();
    await expect(rowWith(page, product.name)).toHaveCount(0);

    // The API agrees: the product is gone.
    expect((await getProductFromApi(request, product.id)).status()).toBe(404);
  });

  test("unsaved changes: closing a changed form asks first", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("button", { name: "إضافة صنف" }).first().click();
    const form = page.getByRole("dialog", { name: "إضافة صنف" });
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    // Ticking only the checkbox already counts as a change.
    await form.getByLabel("للصنف تاريخ صلاحية").check();

    // Escape → ask → "إلغاء" goes back to the form with the data kept.
    await page.keyboard.press("Escape");
    await expect(discard).toBeVisible();
    await expect(discard).toContainText("لديك تغييرات غير محفوظة. هل تريد إغلاق النموذج بدون حفظ؟");
    await discard.getByRole("button", { name: "إلغاء" }).click();
    await expect(discard).toBeHidden();
    await expect(form.getByLabel("للصنف تاريخ صلاحية")).toBeChecked();

    // X → ask; Escape inside the question only closes the question.
    await form.getByLabel("الاسم").fill(`صنف لن يحفظ ${tag}`);
    await form.getByRole("button", { name: "إغلاق" }).click();
    await expect(discard).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(discard).toBeHidden();
    await expect(form).toBeVisible();

    // "إلغاء" in the form → ask → "تجاهل التغييرات" closes everything.
    await form.getByRole("button", { name: "إلغاء" }).click();
    await discard.getByRole("button", { name: "تجاهل التغييرات" }).click();
    await expect(discard).toBeHidden();
    await expect(form).toBeHidden();
    await expect(rowWith(page, `صنف لن يحفظ ${tag}`)).toHaveCount(0);
  });

  test("unsaved changes: an untouched form closes without asking", async ({ page, request }) => {
    const product = await createProduct(request, {
      name: `صنف بدون تغيير ${tag}`,
      barcode: randomBarcode(),
      retailPrice: 12.3456,
      hasExpiryDate: true,
    });
    await page.goto("/products");
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    // Add form: "إلغاء"
    await page.getByRole("button", { name: "إضافة صنف" }).first().click();
    const addForm = page.getByRole("dialog", { name: "إضافة صنف" });
    await addForm.getByRole("button", { name: "إلغاء" }).click();
    await expect(addForm).toBeHidden();

    // Edit form: Escape
    await page.getByRole("button", { name: `تعديل ${product.name}` }).click();
    const editForm = page.getByRole("dialog", { name: "تعديل الصنف" });
    await expect(editForm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editForm).toBeHidden();

    await expect(discard).toHaveCount(0);
  });
});

test.describe("mocked API", () => {
  const CORS = { "Access-Control-Allow-Origin": "*" };
  const DATES = {
    createdAt: "2026-11-21T10:00:00.000Z",
    updatedAt: "2026-11-21T10:00:00.000Z",
    deletedAt: null,
  };
  const CATEGORY = { id: "cat1", code: "category-000001", name: "تصنيف وهمي", ...DATES };
  const UNIT = { id: "unit1", code: "unit-000001", name: "وحدة وهمية", ...DATES };

  const PRODUCT = {
    id: "p1",
    code: "PRD-000001",
    barcode: "6221234567890",
    name: "صنف وهمي",
    categoryId: CATEGORY.id,
    primaryItemUnitId: UNIT.id,
    itemType: "STOCK",
    costingMethod: "WEIGHTED_AVERAGE",
    retailPrice: "1500",
    wholesalePrice: "12.3456",
    bulkWholesalePrice: "10.5",
    reorderLimit: "0",
    hasExpiryDate: false,
    ...DATES,
    category: CATEGORY,
    primaryItemUnit: UNIT,
  };

  // Matchers per API path. The origin check matters: the page itself is also at /products
  // (and /categories), and that page load must not be answered with JSON.
  const API_PATHS = {};
  function apiPath(path) {
    API_PATHS[path] ??= (url) => url.origin === API_URL && url.pathname === path;
    return API_PATHS[path];
  }

  // Answers GET <path> on the API with the given status + body.
  function mockGet(page, path, status, body) {
    return page.route(apiPath(path), (route) => route.fulfill({ status, json: body, headers: CORS }));
  }
  function mockList(page, path, data) {
    return mockGet(page, path, 200, { message: "fetched successfully", data });
  }

  test.describe("API error", () => {
    // The browser logs the failed request itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("shows ErrorState and the retry button loads the list (prices with 2–4 decimals)", async ({ page }) => {
      await setFakeSession(page);
      await mockList(page, "/categories", [CATEGORY]);
      await mockList(page, "/item-unit", [UNIT]);
      await mockGet(page, "/products", 500, {
        statusCode: 500,
        message: "Internal server error",
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        field: null,
      });
      await page.goto("/products");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();

      await page.unroute(apiPath("/products"));
      await mockList(page, "/products", [PRODUCT]);
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();

      const cells = rowWith(page, "صنف وهمي").getByRole("cell");
      await expect(cells.nth(COL.code)).toHaveText("PRD-000001");
      await expect(cells.nth(COL.barcode)).toHaveText("6221234567890");
      await expect(cells.nth(COL.category)).toHaveText("تصنيف وهمي");
      await expect(cells.nth(COL.unit)).toHaveText("وحدة وهمية");
      await expect(cells.nth(COL.type)).toHaveText("مخزني");
      await expect(cells.nth(COL.type).getByText("مخزني")).toHaveClass(/bg-primary-soft/);
      await expect(cells.nth(COL.retailPrice)).toHaveText("1,500.00");
      await expect(cells.nth(COL.wholesalePrice)).toHaveText("12.3456");
      await expect(cells.nth(COL.bulkWholesalePrice)).toHaveText("10.50");
      await expect(cells.nth(COL.retailPrice).locator("span")).toHaveAttribute("dir", "ltr");
      await expect(page.getByText("عدد الأصناف: 1")).toBeVisible();
    });
  });

  test("empty list shows EmptyState with the add button", async ({ page }) => {
    await setFakeSession(page);
    await mockList(page, "/categories", [CATEGORY]);
    await mockList(page, "/item-unit", [UNIT]);
    await mockList(page, "/products", []);
    await page.goto("/products");

    const empty = page.getByText("لا توجد أصناف بعد").locator("..");
    await expect(empty).toBeVisible();
    await expect(page.getByText("لإضافة صنف يجب إضافة تصنيف ووحدة أولاً")).toHaveCount(0);
    await empty.getByRole("button", { name: "إضافة صنف" }).click();
    await expect(page.getByRole("dialog", { name: "إضافة صنف" })).toBeVisible();
  });

  const MISSING_CASES = [
    { title: "no categories", categories: [], units: [UNIT], links: ["إضافة تصنيف"], hint: "أضف تصنيفاً أولاً" },
    { title: "no units", categories: [CATEGORY], units: [], links: ["إضافة وحدة"], hint: "أضف وحدة أولاً" },
    {
      title: "no categories and no units",
      categories: [],
      units: [],
      links: ["إضافة تصنيف", "إضافة وحدة"],
      hint: "أضف تصنيفاً ووحدة أولاً",
    },
  ];

  for (const { title, categories, units, links, hint } of MISSING_CASES) {
    test(`${title}: add buttons are disabled and the hint shows only the missing links`, async ({ page }) => {
      await setFakeSession(page);
      await mockList(page, "/categories", categories);
      await mockList(page, "/item-unit", units);
      await mockList(page, "/products", []);
      await page.goto("/products");

      await expect(page.getByText("لا توجد أصناف بعد")).toBeVisible();
      const addButtons = page.getByRole("button", { name: "إضافة صنف" });
      await expect(addButtons).toHaveCount(2); // header + empty state
      for (const button of await addButtons.all()) {
        await expect(button).toBeDisabled();
        await expect(button).toHaveAttribute("title", hint);
      }

      const alert = page.getByRole("alert").filter({ hasText: "لإضافة صنف يجب إضافة تصنيف ووحدة أولاً" });
      await expect(alert).toBeVisible();
      await expect(alert.getByRole("link")).toHaveText(links);
    });
  }

  test("hint links go to /categories and /units", async ({ page }) => {
    await setFakeSession(page);
    await mockList(page, "/categories", []);
    await mockList(page, "/item-unit", []);
    await mockList(page, "/products", []);

    await page.goto("/products");
    await page.getByRole("link", { name: "إضافة تصنيف" }).click();
    await expect(page).toHaveURL(/\/categories$/);

    await page.goto("/products");
    await page.getByRole("link", { name: "إضافة وحدة" }).click();
    await expect(page).toHaveURL(/\/units$/);
  });
});
