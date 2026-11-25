// Product units (وحدات الصنف) — the "الوحدات" action of the Products page → ProductUnitsModal.
// Docs: ../backend/doc/week2/product-units.txt ("1 كرتونة = 24 قطعة": factor in the PRIMARY unit).
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// beforeEach creates a tagged category, 3 tagged item units (قطعة = primary, كرتونة, دستة) and a tagged
// STOCK product. afterEach deletes the tagged products' units FIRST, then the products, then the
// categories and item units — also when the test failed. Barcodes are random every run (a deleted
// product unit keeps its barcode reserved).
//
// "mocked API" tests fake the API with page.route: errors that are hard to trigger for real, the
// "all units added" state (the real item-unit list is shared with demo data and parallel tests)
// and the load error.
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

const PRIMARY_UNIT_LOCKED = "لا يمكن تغيير الوحدة الأساسية بعد استخدام الصنف (له حركات مخزن أو وحدات)";
const DISCARD_TEXT = "لديك تغييرات غير محفوظة. هل تريد إغلاق النموذج بدون حفظ؟";

function randomBarcode() {
  return `PU${Date.now()}${randomTag()}`;
}

// The modal of this product (title "وحدات الصنف: <name>").
function unitsDialog(page, productName) {
  return page.getByRole("dialog", { name: `وحدات الصنف: ${productName}` });
}

// Clicks "الوحدات" on the product's row and waits until the list is on screen.
async function openUnits(page, productName) {
  await page.getByRole("button", { name: `وحدات ${productName}` }).click();
  const dialog = unitsDialog(page, productName);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("جارٍ تحميل الوحدات...")).toHaveCount(0);
  await expect(dialog.getByRole("table")).toBeVisible();
  return dialog;
}

// The "إضافة وحدة" button (in the toolbar, or in the small empty state when there are no other units).
function addUnitButton(dialog) {
  return dialog.getByRole("button", { name: "إضافة وحدة" });
}

// Form fields, by name (several labels contain the word "الوحدة").
function fields(dialog) {
  return {
    unit: dialog.locator("select[name=itemUnitId]"),
    unitReadOnly: dialog.getByRole("textbox", { name: /^الوحدة/ }),
    factor: dialog.locator("input[name=factor]"),
    barcode: dialog.locator("input[name=barcode]"),
    retailPrice: dialog.locator("input[name=retailPrice]"),
  };
}

// The text under a field (its error), e.g. fieldError(fields(dialog).factor).
function fieldError(input) {
  return input.locator("xpath=following-sibling::p[1]");
}

test.describe("with backend", () => {
  let token;
  let tag;
  let category;
  let piece; // the product's primary unit
  let carton;
  let dozen;
  let product; // STOCK, primary = piece, retail price 10

  const headers = () => ({ Authorization: `Bearer ${token}` });

  function createProduct(request, body) {
    return createByApi(request, token, "/products", {
      categoryId: category.id,
      primaryItemUnitId: piece.id,
      retailPrice: 10,
      wholesalePrice: 9,
      bulkWholesalePrice: 8,
      ...body,
    });
  }

  function addUnitByApi(request, productId, body) {
    return createByApi(request, token, `/products/${productId}/units`, body);
  }

  async function deleteUnitByApi(request, id) {
    const response = await request.delete(`${API_URL}/product-units/${id}`, { headers: headers() });
    expect(response.ok()).toBeTruthy();
  }

  // Cleanup: the units of every tagged product (soft delete), before the products themselves.
  async function deleteTaggedProductUnits(request) {
    const response = await request.get(`${API_URL}/products`, { headers: headers() });
    const products = ((await response.json()).data || []).filter((item) => item.name.includes(tag));
    for (const item of products) {
      const unitsResponse = await request.get(`${API_URL}/products/${item.id}/units`, { headers: headers() });
      for (const productUnit of (await unitsResponse.json()).data || []) {
        if (productUnit.id) await request.delete(`${API_URL}/product-units/${productUnit.id}`, { headers: headers() });
      }
    }
  }

  function waitForUnitWrite(page, method, url) {
    return page.waitForRequest((req) => req.url() === url && req.method() === method);
  }

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);

    tag = randomTag();
    const session = await apiLogin(request);
    token = session.access_token;
    category = await createByApi(request, token, "/categories", { name: `تصنيف وحدات ${tag}` });
    piece = await createByApi(request, token, "/item-unit", { name: `قطعة ${tag}` });
    carton = await createByApi(request, token, "/item-unit", { name: `كرتونة ${tag}` });
    dozen = await createByApi(request, token, "/item-unit", { name: `دستة ${tag}` });
    product = await createProduct(request, { name: `صنف وحدات ${tag}` });
    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;
    await deleteTaggedProductUnits(request);
    await deleteByTag(request, token, "/products", tag);
    await deleteByTag(request, token, "/categories", tag);
    await deleteByTag(request, token, "/item-unit", tag);
    tag = undefined;
  });

  test("SERVICE product: the الوحدات button is disabled with an Arabic title; STOCK opens the modal", async ({
    page,
    request,
  }) => {
    const service = await createProduct(request, { name: `خدمة وحدات ${tag}`, itemType: "SERVICE" });
    await page.goto("/products");

    const serviceButton = page.getByRole("button", { name: `وحدات ${service.name}` });
    await expect(serviceButton).toBeDisabled();
    await expect(serviceButton).toHaveAttribute("title", "الخدمات ليس لها وحدات تعبئة");

    const stockButton = page.getByRole("button", { name: `وحدات ${product.name}` });
    await expect(stockButton).toBeEnabled();
    await expect(stockButton).toHaveAttribute("title", "الوحدات");
    await openUnits(page, product.name);
  });

  test("list: primary row first with badge, product's barcode / price, no actions; empty state", async ({
    page,
    request,
  }) => {
    // A product with a barcode, so the primary row shows the product's own one.
    const barcode = randomBarcode();
    const withBarcode = await createProduct(request, { name: `صنف بباركود ${tag}`, barcode, retailPrice: 12.5 });
    await page.goto("/products");
    const dialog = await openUnits(page, withBarcode.name);

    await expect(dialog.getByText(`المخزون يُحسب دائماً بالـقطعة ${tag}، وكل وحدة هنا تُحوَّل إليها تلقائياً.`)).toBeVisible();
    for (const header of ["الوحدة", "المحتوى", "الباركود", "سعر البيع", "الإجراءات"]) {
      await expect(dialog.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }

    const rows = dialog.getByRole("row");
    await expect(rows).toHaveCount(2); // header + primary
    const primaryRow = rows.nth(1);
    await expect(primaryRow).toContainText(`قطعة ${tag}`);
    await expect(primaryRow.getByText("أساسية", { exact: true })).toBeVisible();
    await expect(primaryRow).toContainText("الوحدة الأساسية");
    await expect(primaryRow).toContainText(barcode);
    await expect(primaryRow).toContainText("12.50");
    await expect(primaryRow.getByRole("button")).toHaveCount(0);
    await expect(primaryRow.getByRole("img", { name: "تُعدَّل من بيانات الصنف" })).toHaveAttribute(
      "title",
      "تُعدَّل من بيانات الصنف",
    );

    await expect(dialog.getByText("لا توجد وحدات أخرى. أضف وحدة مثل الكرتونة أو الدستة.")).toBeVisible();
    await expect(addUnitButton(dialog)).toHaveCount(1);
  });

  test("add a carton: live preview, price hint, POST body → row \"1 كرتونة = 24 قطعة\" after the primary", async ({
    page,
  }) => {
    await page.goto("/products");
    const dialog = await openUnits(page, product.name);
    await addUnitButton(dialog).click();
    const form = fields(dialog);

    await expect(dialog.getByRole("heading", { name: "إضافة وحدة" })).toBeVisible();
    await expect(form.unit).toBeFocused();
    await expect(dialog.getByLabel(`عدد قطعة ${tag} في الوحدة`)).toBeVisible();
    for (const input of [form.factor, form.barcode, form.retailPrice]) {
      await expect(input).toHaveAttribute("dir", "ltr");
    }

    await form.unit.selectOption({ label: carton.name });
    // No preview / hint until the factor is a valid number.
    await expect(dialog.getByText("سيتم تسجيله:")).toHaveCount(0);
    await form.factor.fill("24");
    await expect(dialog.getByText(`سيتم تسجيله: 1 كرتونة ${tag} = 24 قطعة ${tag}`)).toBeVisible();
    // Product retail price 10 × 24 — a hint only, never filled in.
    await expect(dialog.getByText(`للمقارنة: سعر الـقطعة ${tag} × العدد = 240.00`)).toBeVisible();
    await expect(form.retailPrice).toHaveValue("");
    await expect(dialog.getByText("الوحدة بنفس حجم الوحدة الأساسية، تأكد من العدد")).toHaveCount(0);

    const requestPromise = waitForUnitWrite(page, "POST", `${API_URL}/products/${product.id}/units`);
    await dialog.getByRole("button", { name: "حفظ" }).click();
    const body = (await requestPromise).postDataJSON();
    // Empty optional fields are left out on create; numbers are numbers.
    expect(body).toEqual({ itemUnitId: carton.id, factor: 24 });

    // Back to the list, with the success message and the new row after the primary one.
    await expect(dialog.getByRole("alert").filter({ hasText: "تمت إضافة الوحدة" })).toBeVisible();
    const rows = dialog.getByRole("row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText("أساسية");
    await expect(rows.nth(2)).toContainText(`1 كرتونة ${tag} = 24 قطعة ${tag}`);
    await expect(rows.nth(2).getByRole("button", { name: `تعديل وحدة كرتونة ${tag}` })).toBeVisible();
    await expect(rows.nth(2).getByRole("button", { name: `حذف وحدة كرتونة ${tag}` })).toBeVisible();
    // Silent refresh: the list never went back to the loading state.
    await expect(dialog.getByText("جارٍ تحميل الوحدات...")).toHaveCount(0);
  });

  test("add with barcode + price + decimal factor; factor 1 only warns and still saves", async ({ page }) => {
    await page.goto("/products");
    const dialog = await openUnits(page, product.name);
    await addUnitButton(dialog).click();
    const form = fields(dialog);
    const barcode = randomBarcode();

    await form.unit.selectOption({ label: dozen.name });
    await form.factor.fill("1");
    await expect(dialog.getByText("الوحدة بنفس حجم الوحدة الأساسية، تأكد من العدد")).toBeVisible();
    await form.factor.fill("2.5");
    await expect(dialog.getByText("الوحدة بنفس حجم الوحدة الأساسية، تأكد من العدد")).toHaveCount(0);
    await expect(dialog.getByText(`سيتم تسجيله: 1 دستة ${tag} = 2.5 قطعة ${tag}`)).toBeVisible();
    await form.factor.fill("1");
    await form.barcode.fill(`  ${barcode}  `);
    await form.retailPrice.fill("9.75");

    const requestPromise = waitForUnitWrite(page, "POST", `${API_URL}/products/${product.id}/units`);
    // Enter in a field submits the form.
    await form.retailPrice.press("Enter");
    expect((await requestPromise).postDataJSON()).toEqual({
      itemUnitId: dozen.id,
      factor: 1,
      barcode,
      retailPrice: 9.75,
    });

    const row = dialog.getByRole("row").filter({ hasText: `دستة ${tag}` });
    await expect(row).toContainText(`1 دستة ${tag} = 1 قطعة ${tag}`);
    await expect(row).toContainText(barcode);
    await expect(row).toContainText("9.75");
  });

  test("unit options exclude the primary unit and the units already added", async ({ page, request }) => {
    await addUnitByApi(request, product.id, { itemUnitId: carton.id, factor: 12 });
    await page.goto("/products");
    const dialog = await openUnits(page, product.name);
    // With other units the add button sits above the table (no empty state).
    await expect(dialog.getByText("لا توجد وحدات أخرى. أضف وحدة مثل الكرتونة أو الدستة.")).toHaveCount(0);
    await addUnitButton(dialog).click();

    const unitSelect = fields(dialog).unit;
    await expect(unitSelect.locator("option", { hasText: dozen.name })).toHaveCount(1);
    await expect(unitSelect.locator("option", { hasText: piece.name })).toHaveCount(0);
    await expect(unitSelect.locator("option", { hasText: carton.name })).toHaveCount(0);
  });

  test("validation: Arabic errors under the fields, no request sent", async ({ page }) => {
    const sent = [];
    page.on("request", (req) => {
      if (req.url().includes("/units") && req.method() === "POST") sent.push(req.url());
    });
    await page.goto("/products");
    const dialog = await openUnits(page, product.name);
    await addUnitButton(dialog).click();
    const form = fields(dialog);
    const save = dialog.getByRole("button", { name: "حفظ" });

    // Nothing filled: unit + factor required.
    await save.click();
    await expect(fieldError(form.unit)).toHaveText("الوحدة مطلوبة");
    await expect(fieldError(form.factor)).toHaveText("العدد مطلوب");

    await form.unit.selectOption({ label: carton.name });
    await expect(dialog.getByText("الوحدة مطلوبة")).toHaveCount(0);

    const cases = [
      ["0", "العدد يجب أن يكون أكبر من صفر"],
      ["-3", "العدد يجب أن يكون أكبر من صفر"],
      ["1.12345", "الحد الأقصى 4 أرقام بعد العلامة العشرية"],
      ["abc", "أدخل رقماً صالحاً"],
    ];
    for (const [value, message] of cases) {
      await form.factor.fill(value);
      await save.click();
      await expect(fieldError(form.factor)).toHaveText(message);
    }

    await form.factor.fill("12");
    await form.retailPrice.fill("-1");
    await save.click();
    await expect(fieldError(form.retailPrice)).toHaveText("القيمة يجب ألا تقل عن 0");
    await form.retailPrice.fill("1.00001");
    await save.click();
    await expect(fieldError(form.retailPrice)).toHaveText("الحد الأقصى 4 أرقام بعد العلامة العشرية");

    expect(sent).toEqual([]);
  });

  test("edit: unit read-only; change factor + clear barcode and price → PATCH sends null", async ({
    page,
    request,
  }) => {
    const barcode = randomBarcode();
    const saved = await addUnitByApi(request, product.id, {
      itemUnitId: carton.id,
      factor: 24,
      barcode,
      retailPrice: 200,
    });
    await page.goto("/products");
    const dialog = await openUnits(page, product.name);
    await dialog.getByRole("button", { name: `تعديل وحدة كرتونة ${tag}` }).click();
    const form = fields(dialog);

    await expect(dialog.getByRole("heading", { name: `تعديل وحدة كرتونة ${tag}` })).toBeVisible();
    await expect(form.unit).toHaveCount(0);
    await expect(form.unitReadOnly).toHaveValue(carton.name);
    await expect(form.unitReadOnly).toHaveAttribute("readonly", "");
    await expect(dialog.getByText("لتغيير الوحدة احذفها وأضف الوحدة الجديدة")).toBeVisible();
    // Prefilled with the saved values.
    await expect(form.factor).toHaveValue("24");
    await expect(form.barcode).toHaveValue(barcode);
    await expect(form.retailPrice).toHaveValue("200");

    await form.factor.fill("12");
    await form.barcode.fill("");
    await form.retailPrice.fill("");
    const requestPromise = waitForUnitWrite(page, "PATCH", `${API_URL}/product-units/${saved.id}`);
    await dialog.getByRole("button", { name: "حفظ" }).click();
    // Only the editable fields: no itemUnitId (read-only), emptied optional fields → null.
    expect((await requestPromise).postDataJSON()).toEqual({ factor: 12, barcode: null, retailPrice: null });

    await expect(dialog.getByRole("alert").filter({ hasText: "تم تعديل الوحدة" })).toBeVisible();
    const row = dialog.getByRole("row").filter({ hasText: `كرتونة ${tag}` }).last();
    await expect(row).toContainText(`1 كرتونة ${tag} = 12 قطعة ${tag}`);
    await expect(row).not.toContainText(barcode);
  });

  test("delete: confirmation with the note; إلغاء keeps it, حذف الوحدة removes it", async ({ page, request }) => {
    await addUnitByApi(request, product.id, { itemUnitId: carton.id, factor: 24 });
    await page.goto("/products");
    const dialog = await openUnits(page, product.name);
    const confirm = page.getByRole("dialog", { name: "حذف الوحدة" });

    await dialog.getByRole("button", { name: `حذف وحدة كرتونة ${tag}` }).click();
    await expect(confirm).toContainText(`حذف وحدة كرتونة ${tag} من هذا الصنف؟`);
    await expect(confirm).toContainText("المستندات القديمة التي استخدمت هذه الوحدة لن تتأثر");
    // Escape belongs to the confirmation: the units modal stays open.
    await page.keyboard.press("Escape");
    await expect(confirm).toBeHidden();
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: `حذف وحدة كرتونة ${tag}` }).click();
    await confirm.getByRole("button", { name: "إلغاء" }).click();
    await expect(confirm).toBeHidden();
    await expect(dialog.getByRole("row")).toHaveCount(3);

    const deletePromise = page.waitForRequest(
      (req) => req.url().startsWith(`${API_URL}/product-units/`) && req.method() === "DELETE",
    );
    await dialog.getByRole("button", { name: `حذف وحدة كرتونة ${tag}` }).click();
    await confirm.getByRole("button", { name: "حذف الوحدة" }).click();
    await deletePromise;

    await expect(dialog.getByRole("alert").filter({ hasText: "تم حذف الوحدة" })).toBeVisible();
    await expect(dialog.getByRole("row")).toHaveCount(2);
    await expect(dialog.getByText("لا توجد وحدات أخرى. أضف وحدة مثل الكرتونة أو الدستة.")).toBeVisible();
  });

  test("re-adding a deleted unit shows the restored message", async ({ page, request }) => {
    const saved = await addUnitByApi(request, product.id, { itemUnitId: carton.id, factor: 24 });
    await deleteUnitByApi(request, saved.id);
    await page.goto("/products");
    const dialog = await openUnits(page, product.name);

    await addUnitButton(dialog).click();
    const form = fields(dialog);
    await form.unit.selectOption({ label: carton.name });
    await form.factor.fill("20");
    await dialog.getByRole("button", { name: "حفظ" }).click();

    await expect(dialog.getByRole("alert").filter({ hasText: "تمت إعادة الوحدة المحذوفة بالقيم الجديدة" })).toBeVisible();
    await expect(dialog.getByRole("row").filter({ hasText: `كرتونة ${tag}` })).toContainText(
      `1 كرتونة ${tag} = 20 قطعة ${tag}`,
    );
  });

  test.describe("barcode conflicts", () => {
    // The browser logs the 409 answers itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 409/] });

    test("a used barcode / a deleted unit's barcode → Arabic message under the field, input kept", async ({
      page,
      request,
    }) => {
      const usedBarcode = randomBarcode();
      const deletedBarcode = randomBarcode();
      await addUnitByApi(request, product.id, { itemUnitId: carton.id, factor: 24, barcode: usedBarcode });
      // A second product whose unit is deleted: its barcode stays reserved.
      const other = await createProduct(request, { name: `صنف آخر ${tag}` });
      const deleted = await addUnitByApi(request, other.id, { itemUnitId: carton.id, factor: 6, barcode: deletedBarcode });
      await deleteUnitByApi(request, deleted.id);

      await page.goto("/products");
      const dialog = await openUnits(page, product.name);
      await addUnitButton(dialog).click();
      const form = fields(dialog);
      await form.unit.selectOption({ label: dozen.name });
      await form.factor.fill("12");

      await form.barcode.fill(usedBarcode);
      await dialog.getByRole("button", { name: "حفظ" }).click();
      await expect(fieldError(form.barcode)).toHaveText("الباركود مستخدم بالفعل");
      await expect(form.barcode).toHaveValue(usedBarcode);
      await expect(form.factor).toHaveValue("12");
      await expect(form.unit).toHaveValue(dozen.id);

      await form.barcode.fill(deletedBarcode);
      await expect(dialog.getByText("الباركود مستخدم بالفعل")).toHaveCount(0);
      await dialog.getByRole("button", { name: "حفظ" }).click();
      await expect(fieldError(form.barcode)).toHaveText("هذا الباركود مرتبط بوحدة محذوفة");
      await expect(dialog.getByRole("heading", { name: "إضافة وحدة" })).toBeVisible();
    });
  });

  test("unsaved changes: رجوع and X ask first; an untouched form goes back directly", async ({ page }) => {
    await page.goto("/products");
    const dialog = await openUnits(page, product.name);
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });
    const form = fields(dialog);

    // Untouched: رجوع goes straight back to the list.
    await addUnitButton(dialog).click();
    await dialog.getByRole("button", { name: "رجوع" }).click();
    await expect(discard).toHaveCount(0);
    await expect(dialog.getByRole("table")).toBeVisible();

    // Changed: رجوع asks; "إلغاء" keeps the form and the data.
    await addUnitButton(dialog).click();
    await form.factor.fill("24");
    await dialog.getByRole("button", { name: "رجوع" }).click();
    await expect(discard).toContainText(DISCARD_TEXT);
    await discard.getByRole("button", { name: "إلغاء" }).click();
    await expect(discard).toBeHidden();
    await expect(form.factor).toHaveValue("24");

    // رجوع → "تجاهل التغييرات" goes back to the list (the modal stays open).
    await dialog.getByRole("button", { name: "رجوع" }).click();
    await discard.getByRole("button", { name: "تجاهل التغييرات" }).click();
    await expect(dialog.getByRole("table")).toBeVisible();
    await expect(dialog).toBeVisible();

    // X with changes asks too; "تجاهل التغييرات" closes the whole modal.
    await addUnitButton(dialog).click();
    await form.barcode.fill("123");
    await dialog.getByRole("button", { name: "إغلاق" }).first().click();
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "تجاهل التغييرات" }).click();
    await expect(dialog).toBeHidden();

    // List view: إغلاق closes without asking.
    await openUnits(page, product.name);
    await unitsDialog(page, product.name).getByRole("button", { name: "إغلاق" }).last().click();
    await expect(unitsDialog(page, product.name)).toBeHidden();
    await expect(discard).toHaveCount(0);
  });

  test.describe("deleted meanwhile", () => {
    // The browser logs the 404 answers itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 404/] });

    test("product deleted while the modal is open → save closes it, page Alert, list refreshed", async ({
      page,
      request,
    }) => {
      await page.goto("/products");
      const dialog = await openUnits(page, product.name);
      await addUnitButton(dialog).click();
      await fields(dialog).unit.selectOption({ label: carton.name });
      await fields(dialog).factor.fill("24");

      const response = await request.delete(`${API_URL}/products/${product.id}`, { headers: headers() });
      expect(response.ok()).toBeTruthy();
      await dialog.getByRole("button", { name: "حفظ" }).click();

      await expect(dialog).toBeHidden();
      await expect(page.getByRole("alert").filter({ hasText: "الصنف غير موجود أو محذوف" })).toBeVisible();
      await expect(page.getByRole("button", { name: `وحدات ${product.name}` })).toHaveCount(0);
    });

    test("unit deleted while editing → back to the list, Alert, the row is gone", async ({ page, request }) => {
      const saved = await addUnitByApi(request, product.id, { itemUnitId: carton.id, factor: 24 });
      await page.goto("/products");
      const dialog = await openUnits(page, product.name);
      await dialog.getByRole("button", { name: `تعديل وحدة كرتونة ${tag}` }).click();
      await fields(dialog).factor.fill("12");

      await deleteUnitByApi(request, saved.id);
      await dialog.getByRole("button", { name: "حفظ" }).click();

      await expect(dialog.getByRole("alert").filter({ hasText: "الوحدة غير موجودة أو محذوفة" })).toBeVisible();
      await expect(dialog.getByRole("table")).toBeVisible();
      await expect(dialog.getByRole("row")).toHaveCount(2);
    });
  });

  test("after adding a unit, the product edit form shows the primary unit read-only", async ({ page }) => {
    await page.goto("/products");
    const dialog = await openUnits(page, product.name);
    await addUnitButton(dialog).click();
    await fields(dialog).unit.selectOption({ label: carton.name });
    await fields(dialog).factor.fill("24");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    await expect(dialog.getByRole("alert").filter({ hasText: "تمت إضافة الوحدة" })).toBeVisible();
    await dialog.getByRole("button", { name: "إغلاق" }).last().click();
    await expect(dialog).toBeHidden();

    const detailsPromise = page.waitForResponse(
      (res) => res.url() === `${API_URL}/products/${product.id}` && res.request().method() === "GET",
    );
    await page.getByRole("button", { name: `تعديل ${product.name}` }).click();
    await detailsPromise;
    const editForm = page.getByRole("dialog", { name: "تعديل الصنف" });
    const primaryUnit = editForm.getByLabel("الوحدة الأساسية");
    await expect(primaryUnit).toHaveValue(piece.name);
    await expect(primaryUnit).toHaveAttribute("readonly", "");
    await expect(editForm.getByText(PRIMARY_UNIT_LOCKED)).toBeVisible();
  });
});

test.describe("mocked API", () => {
  const CORS = { "Access-Control-Allow-Origin": "*" };
  const DATES = { createdAt: "2026-11-21T10:00:00.000Z", updatedAt: "2026-11-21T10:00:00.000Z", deletedAt: null };
  const CATEGORY = { id: "cat1", code: "category-000001", name: "تصنيف وهمي", ...DATES };
  const PIECE = { id: "u-piece", code: "unit-1", name: "قطعة", ...DATES };
  const CARTON = { id: "u-carton", code: "unit-2", name: "كرتونة", ...DATES };
  const DOZEN = { id: "u-dozen", code: "unit-3", name: "دستة", ...DATES };
  const BOX = { id: "u-box", code: "unit-4", name: "علبة", ...DATES };

  const PRODUCT = {
    id: "p1",
    code: "PRD-000001",
    barcode: null,
    name: "صنف وهمي",
    categoryId: CATEGORY.id,
    primaryItemUnitId: PIECE.id,
    itemType: "STOCK",
    costingMethod: "WEIGHTED_AVERAGE",
    retailPrice: "10",
    wholesalePrice: "9",
    bulkWholesalePrice: "8",
    reorderLimit: "0",
    hasExpiryDate: false,
    ...DATES,
    category: CATEGORY,
    primaryItemUnit: PIECE,
  };

  const PRIMARY_ROW = {
    id: null,
    isPrimary: true,
    productId: "p1",
    itemUnitId: PIECE.id,
    itemUnit: PIECE,
    factor: "1",
    barcode: null,
    retailPrice: "10",
  };
  function unitRow(id, itemUnit, factor) {
    return { id, isPrimary: false, productId: "p1", itemUnitId: itemUnit.id, itemUnit, factor, barcode: null, retailPrice: null };
  }

  // The page itself is also at /products: match the API origin only.
  function apiPath(path) {
    return (url) => url.origin === API_URL && url.pathname === path;
  }
  function ok(data) {
    return { headers: CORS, json: { message: "ok", data } };
  }
  function errorBody(status, code, field) {
    return { status, headers: CORS, json: { statusCode: status, message: "English text", error: "Error", code, field } };
  }

  // The Products page with one STOCK product; units / item units come from the given functions.
  async function mockPage(page, { getUnits, getItemUnits, onPost }) {
    await setFakeSession(page);
    await page.route(apiPath("/products"), (route) => route.fulfill(ok([PRODUCT])));
    await page.route(apiPath("/categories"), (route) => route.fulfill(ok([CATEGORY])));
    await page.route(apiPath("/item-unit"), (route) => route.fulfill(getItemUnits()));
    await page.route(apiPath("/products/p1/units"), (route) =>
      route.request().method() === "POST" ? route.fulfill(onPost()) : route.fulfill(getUnits()),
    );
    await page.goto("/products");
  }

  test("all units already added: Arabic message with a link to the units page, حفظ disabled", async ({ page }) => {
    await mockPage(page, {
      getUnits: () => ok([PRIMARY_ROW, unitRow("pu1", CARTON, "24")]),
      getItemUnits: () => ok([PIECE, CARTON]),
      onPost: () => ok(null),
    });
    const dialog = await openUnits(page, PRODUCT.name);
    await expect(dialog.getByRole("row").nth(2)).toContainText("1 كرتونة = 24 قطعة");
    await addUnitButton(dialog).click();

    await expect(dialog.getByText("كل الوحدات مضافة لهذا الصنف. أضف وحدة جديدة من صفحة الوحدات أولاً")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "صفحة الوحدات" })).toHaveAttribute("href", "/units");
    await expect(fields(dialog).unit).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "حفظ" })).toBeDisabled();
  });

  test.describe("server errors on save", () => {
    test.use({ allowedConsoleErrors: [/status of (400|409|500)/] });

    test("primary / already defined / deleted unit / validation / unknown → Arabic, form stays open", async ({
      page,
    }) => {
      let units = [PRIMARY_ROW];
      let itemUnits = [PIECE, CARTON, DOZEN, BOX];
      let nextPost; // the answer of the next POST
      await mockPage(page, {
        getUnits: () => ok(units),
        getItemUnits: () => ok(itemUnits),
        onPost: () => nextPost(),
      });
      const dialog = await openUnits(page, PRODUCT.name);
      await addUnitButton(dialog).click();
      const form = fields(dialog);
      const save = dialog.getByRole("button", { name: "حفظ" });

      // BAD_REQUEST itemUnitId = the product's primary unit.
      nextPost = () => errorBody(400, "BAD_REQUEST", "itemUnitId");
      await form.unit.selectOption({ label: "كرتونة" });
      await form.factor.fill("24");
      await save.click();
      await expect(fieldError(form.unit)).toHaveText("هذه هي الوحدة الأساسية للصنف (معاملها 1) ولا يمكن إضافتها مرة أخرى");
      await expect(form.factor).toHaveValue("24");

      // ALREADY_EXISTS itemUnitId (added meanwhile): message, list + options refresh, choice cleared.
      nextPost = () => {
        units = [PRIMARY_ROW, unitRow("pu1", CARTON, "24")];
        return errorBody(409, "ALREADY_EXISTS", "itemUnitId");
      };
      const refreshed = page.waitForRequest((req) => req.url() === `${API_URL}/products/p1/units` && req.method() === "GET");
      await save.click();
      await refreshed;
      await expect(fieldError(form.unit)).toHaveText("هذه الوحدة معرفة بالفعل لهذا الصنف");
      await expect(form.unit).toHaveValue("");
      await expect(form.unit.locator("option", { hasText: "كرتونة" })).toHaveCount(0);

      // DOES_NOT_EXIST itemUnitId (deleted meanwhile): message, options refresh, choice cleared.
      nextPost = () => {
        itemUnits = [PIECE, CARTON, BOX];
        return errorBody(400, "DOES_NOT_EXIST", "itemUnitId");
      };
      await form.unit.selectOption({ label: "دستة" });
      await save.click();
      await expect(fieldError(form.unit)).toHaveText("الوحدة غير موجودة أو محذوفة");
      await expect(form.unit).toHaveValue("");
      await expect(form.unit.locator("option", { hasText: "دستة" })).toHaveCount(0);

      // VALIDATION_FAILED from the server → under its field.
      await form.unit.selectOption({ label: "علبة" });
      nextPost = () => errorBody(400, "VALIDATION_FAILED", "factor");
      await save.click();
      await expect(fieldError(form.factor)).toHaveText(
        "العدد يجب أن يكون أكبر من صفر، وبحد أقصى 4 أرقام بعد العلامة العشرية",
      );
      nextPost = () => errorBody(400, "VALIDATION_FAILED", "retailPrice");
      await save.click();
      await expect(fieldError(form.retailPrice)).toHaveText(
        "السعر يجب ألا يقل عن 0، وبحد أقصى 4 أرقام بعد العلامة العشرية",
      );

      // Anything else → an Alert above the form.
      nextPost = () => errorBody(500, "INTERNAL_ERROR", null);
      await save.click();
      await expect(dialog.getByRole("alert").filter({ hasText: "حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً" })).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "إضافة وحدة" })).toBeVisible();
    });
  });

  test.describe("load error", () => {
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("the units can't load → ErrorState in the modal; retry loads them", async ({ page }) => {
      let fail = true;
      await mockPage(page, {
        getUnits: () => (fail ? errorBody(500, "INTERNAL_ERROR", null) : ok([PRIMARY_ROW])),
        getItemUnits: () => ok([PIECE, CARTON]),
        onPost: () => ok(null),
      });
      await page.getByRole("button", { name: `وحدات ${PRODUCT.name}` }).click();
      const dialog = unitsDialog(page, PRODUCT.name);
      await expect(dialog.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();

      fail = false;
      await dialog.getByRole("button", { name: "إعادة المحاولة" }).click();
      await expect(dialog.getByRole("row")).toHaveCount(2);
      await expect(dialog.getByText("أساسية", { exact: true })).toBeVisible();
    });
  });
});
