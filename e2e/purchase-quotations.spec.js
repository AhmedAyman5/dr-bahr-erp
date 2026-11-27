// Purchase quotations (عروض أسعار الشراء): list, new / edit form (full page), details + status actions, convert
// to a purchase invoice. Docs: ../backend/doc/week2/purchase-quotations.txt + week2flow.txt.
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down. beforeEach creates, with a
// unique tag: a supplier, branch A with 2 warehouses, branch B with 1 warehouse, a category, item units (piece,
// carton), a STOCK product (barcode, carton = 12 pieces), a SERVICE product and a throwaway product.
// Every test quotation's notes contain "e2e-<tag>" (found again with ?search=). afterEach deletes what the test
// made, in reverse order: the DRAFT invoices made by a conversion, the quotations (a CONVERTED one can't be
// deleted: backend rule, allowed by the leftover check in global-setup.js), then the setup records.
// Demo data and EGP are never touched.
//
// "mocked API" tests fake the endpoints with page.route (no backend needed): empty / error / filtered-empty
// states, pagination, a 409 on an action, the convert currency error, a deleted converted invoice, font كبير.
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
  TEST_DOC_DATE,
  typedDate,
} from "./helpers";

const CODE_PATTERN = /^PQ-\d{4}-\d{6}$/;
const FONT_SIZE_KEY = "ui.fontSize";

// Today / n days from today as "YYYY-MM-DD" and "DD/MM/YYYY" (the tests run in the Cairo time zone).
function day(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function typedDay(offset = 0) {
  const [y, m, d] = day(offset).split("-");
  return `${d}/${m}/${y}`;
}

// "123" → "١٢٣" (codes / barcodes typed on an Arabic keyboard).
function arabicDigits(text) {
  return text.replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[digit]);
}

test.use({ timezoneId: "Africa/Cairo" });

function bodyRows(page) {
  return page.locator("main table tbody tr");
}

// Chooses an option of a SearchSelect (combobox) by typing.
async function pickSearchOption(page, combobox, text, optionName) {
  await combobox.fill(text);
  await listOptions(page, optionName).click();
}

// The options of the open SearchSelect list (not the <option>s of the native selects on the page).
function listOptions(page, name) {
  return page.getByRole("listbox").getByRole("option", name ? { name } : undefined);
}

// The lines of the form.
function lineFields(page, n) {
  return {
    product: page.getByRole("combobox", { name: `الصنف — البند ${n}` }),
    unit: page.getByLabel(`الوحدة — البند ${n}`, { exact: true }),
    quantity: page.getByLabel(`الكمية — البند ${n}`),
    price: page.getByLabel(`سعر الوحدة — البند ${n}`),
    discountTypes: page.getByRole("radiogroup", { name: `نوع خصم البند ${n}` }),
    percent: page.getByLabel(`نسبة خصم البند ${n}`),
    amount: page.getByLabel(`قيمة خصم البند ${n}`),
    remove: page.getByRole("button", { name: `حذف البند رقم ${n}` }),
  };
}

test.describe("with backend", () => {
  let token;
  let tag;
  let session;
  let supplier;
  let branchA;
  let branchB;
  let warehouseA1;
  let warehouseA2;
  let warehouseB1;
  let piece;
  let carton;
  let stockProduct;
  let serviceProduct;
  let throwawayProduct;

  const headers = () => ({ Authorization: `Bearer ${token}` });
  const tagText = () => `e2e-${tag}`;

  async function createProduct(request, body) {
    const category = await createByApi(request, token, "/categories", { name: `تصنيف عروض ${tag} ${randomTag()}` });
    return createByApi(request, token, "/products", {
      categoryId: category.id,
      primaryItemUnitId: piece.id,
      retailPrice: 20,
      wholesalePrice: 18,
      bulkWholesalePrice: 16,
      ...body,
    });
  }

  // A quotation through the API (notes always carry the tag). lines default: 10 cartons × 150.
  async function createQuotation(request, overrides = {}) {
    return createByApi(request, token, "/purchase-quotations", {
      quotationDate: day(0),
      supplierId: supplier.id,
      branchId: branchA.id,
      discountPercent: 0,
      discountValue: 0,
      taxPercent: 0,
      lines: [{ productId: stockProduct.id, itemUnitId: carton.id, quantity: 10, unitPrice: 150 }],
      ...overrides,
      notes: `${tagText()} ${overrides.notes ?? "عرض"}`,
    });
  }

  async function setStatus(request, id, ...statuses) {
    for (const status of statuses) {
      const response = await request.patch(`${API_URL}/purchase-quotations/${id}/status`, {
        headers: headers(),
        data: { status },
      });
      expect(response.ok(), `status ${status}`).toBeTruthy();
    }
  }

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);
    tag = randomTag();
    session = await apiLogin(request);
    token = session.access_token;

    supplier = await createByApi(request, token, "/supplier", { name: `مورد عروض ${tag}` });
    branchA = await createByApi(request, token, "/branch", { name: `فرع عروض أ ${tag}` });
    branchB = await createByApi(request, token, "/branch", { name: `فرع عروض ب ${tag}` });
    warehouseA1 = await createByApi(request, token, `/inventory/branch/${branchA.id}`, { name: `مخزن أ1 ${tag}`, address: "عنوان المخزن" });
    warehouseA2 = await createByApi(request, token, `/inventory/branch/${branchA.id}`, { name: `مخزن أ2 ${tag}`, address: "عنوان المخزن" });
    warehouseB1 = await createByApi(request, token, `/inventory/branch/${branchB.id}`, { name: `مخزن ب1 ${tag}`, address: "عنوان المخزن" });
    piece = await createByApi(request, token, "/item-unit", { name: `قطعة ${tag}` });
    carton = await createByApi(request, token, "/item-unit", { name: `كرتونة ${tag}` });
    const barcode = `622${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 10)}`;
    stockProduct = await createProduct(request, { name: `فرشة عروض ${tag}`, barcode });
    await createByApi(request, token, `/products/${stockProduct.id}/units`, { itemUnitId: carton.id, factor: 12 });
    serviceProduct = await createProduct(request, { name: `خدمة عروض ${tag}`, itemType: "SERVICE" });
    throwawayProduct = await createProduct(request, { name: `صنف مؤقت ${tag}` });

    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;
    // Quotations (+ the invoices they became).
    const response = await request.get(`${API_URL}/purchase-quotations`, {
      headers: headers(),
      params: { search: tagText(), pageSize: 100 },
    });
    for (const quotation of (await response.json()).data?.items ?? []) {
      if (quotation.convertedToInvoiceId) {
        await request.delete(`${API_URL}/purchase-invoices/${quotation.convertedToInvoiceId}`, { headers: headers() });
      }
      if (quotation.status !== "CONVERTED") {
        await request.delete(`${API_URL}/purchase-quotations/${quotation.id}`, { headers: headers() });
      }
    }
    // Product units of the tagged products, then the setup records (reverse order).
    const productsResponse = await request.get(`${API_URL}/products`, { headers: headers() });
    for (const product of ((await productsResponse.json()).data ?? []).filter((item) => item.name.includes(tag))) {
      const unitsResponse = await request.get(`${API_URL}/products/${product.id}/units`, { headers: headers() });
      for (const unit of (await unitsResponse.json()).data ?? []) {
        if (unit.id) await request.delete(`${API_URL}/product-units/${unit.id}`, { headers: headers() });
      }
    }
    await deleteByTag(request, token, "/products", tag);
    await deleteByTag(request, token, "/categories", tag);
    await deleteByTag(request, token, "/item-unit", tag);
    await deleteByTag(request, token, "/inventory", tag);
    await deleteByTag(request, token, "/branch", tag);
    await deleteByTag(request, token, "/supplier", tag);
    tag = undefined;
  });

  // ─── 1. List ──────────────────────────────────────────────────────────────────────────────────────────────

  test("list: filters (supplier, status, branch, search, dates), منتهي badge, مسح الفلاتر, fits the screen", async ({
    page,
    request,
  }) => {
    const draft = await createQuotation(request, { notes: "مسودة", warehouseId: warehouseA1.id });
    const expired = await createQuotation(request, { notes: "منتهي", quotationDate: day(-20), validUntil: day(-5) });
    await setStatus(request, expired.id, "SENT");
    const other = await createQuotation(request, {
      notes: "فرع ب",
      branchId: branchB.id,
      warehouseId: warehouseB1.id,
      quotationDate: day(-3),
    });

    await page.goto("/purchase-quotations");
    await expect(page.getByRole("heading", { name: "عروض أسعار الشراء" })).toBeVisible();
    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await expect(bodyRows(page)).toHaveCount(3);

    // Columns: code (+ lines count) · date · supplier · branch (+ warehouse) · net · status · actions.
    const draftRow = bodyRows(page).filter({ hasText: draft.code });
    await expect(draftRow).toContainText("عدد البنود: 1");
    await expect(draftRow).toContainText(supplier.name);
    await expect(draftRow).toContainText(warehouseA1.name);
    await expect(draftRow).toContainText("1,500.00");
    await expect(draftRow).toContainText("مسودة");
    await expect(bodyRows(page).filter({ hasText: other.code })).toContainText(warehouseB1.name);
    const expiredRow = bodyRows(page).filter({ hasText: expired.code });
    await expect(expiredRow).toContainText("مُرسل");
    await expect(expiredRow).toContainText("منتهي");
    await expect(expiredRow).toContainText(/صالح حتى/);
    await expect(expiredRow).toContainText("بدون مخزن");
    await expect(draftRow).not.toContainText("منتهي");

    // Status, branch, search.
    await page.getByLabel("الحالة").selectOption("SENT");
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page).first()).toContainText(expired.code);
    await page.getByLabel("الحالة").selectOption("");
    await page.getByLabel("الفرع").selectOption(branchB.id);
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page).first()).toContainText(other.code);
    await page.getByLabel("الفرع").selectOption("");
    await page.getByPlaceholder("بحث برقم العرض أو اسم المورد أو الملاحظات").fill(draft.code);
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page).first()).toContainText(draft.code);
    await page.getByPlaceholder("بحث برقم العرض أو اسم المورد أو الملاحظات").fill("");
    await expect(bodyRows(page)).toHaveCount(3);

    // Dates: a DATE-ONLY column → the plain "YYYY-MM-DD" in the request.
    const dated = page.waitForRequest(
      (req) => req.url().includes("/purchase-quotations?") && req.url().includes(`dateFrom=${day(-3)}`) && req.url().includes(`dateTo=${day(0)}`),
    );
    await page.getByLabel("من تاريخ").fill(typedDay(-3));
    await page.getByLabel("إلى تاريخ").fill(typedDay(0));
    await dated;
    await expect(bodyRows(page)).toHaveCount(2);

    // مسح الفلاتر: everything back (the supplier filter too).
    await page.getByRole("button", { name: "مسح الفلاتر" }).click();
    await expect(page.getByRole("combobox", { name: "المورد" })).toHaveValue("كل الموردين");
    await expect(page.getByLabel("من تاريخ")).toHaveValue("");
    await expect(page.getByRole("button", { name: "مسح الفلاتر" })).toBeHidden();

    // No sideways scroll at 1366×768 and 1280×720 (font متوسط).
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      const box = page.locator("main table").first().locator("xpath=..");
      await expect.poll(() => box.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    }
  });

  // ─── 2. Create (the brush example) ──────────────────────────────────────────────────────────────────────

  test("create the brush example: live preview 1500 / 150 / 189 / 1539, then the server's totals and code", async ({
    page,
  }) => {
    await page.goto("/purchase-quotations/new");
    await expect(page.getByRole("heading", { name: "عرض سعر شراء جديد" })).toBeVisible();
    await expect(page.getByLabel("تاريخ العرض")).toHaveValue(typedDay(0));

    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await page.getByLabel("الفرع").selectOption(branchA.id);
    await page.getByLabel("المخزن").selectOption(warehouseA1.id);
    await page.getByLabel("ملاحظات").fill(`${tagText()} فرشة`);

    const line = lineFields(page, 1);
    await pickSearchOption(page, line.product, stockProduct.name, new RegExp(stockProduct.name));
    await expect(line.unit).toHaveValue(piece.id); // the primary unit is chosen at once
    await line.unit.selectOption(carton.id);
    await line.quantity.fill("10");
    await line.price.fill("150");
    await page.getByLabel("نسبة الخصم %").fill("10");
    await page.getByLabel("نسبة الضريبة %").fill("14");

    const totals = page.getByRole("group", { name: "الإجماليات" });
    await expect(totals).toContainText("1,500.00");
    await expect(totals).toContainText("150.00");
    await expect(totals).toContainText("189.00");
    await expect(totals).toContainText("1,539.00");
    await expect(totals).toContainText("معاينة");

    const sent = page.waitForRequest((req) => req.url() === `${API_URL}/purchase-quotations` && req.method() === "POST");
    await page.getByRole("button", { name: "حفظ" }).click();
    const body = (await sent).postDataJSON();
    for (const field of ["code", "status", "subTotal", "taxValue", "netTotal", "createdBy"]) {
      expect(body, `body has no ${field}`).not.toHaveProperty(field);
    }
    expect(body.discountPercent).toBe(10);
    expect(body.discountValue).toBe(0);
    expect(body.taxPercent).toBe(14);
    expect(body.quotationDate).toBe(day(0));
    expect(body.warehouseId).toBe(warehouseA1.id);
    expect(body).not.toHaveProperty("validUntil");
    expect(body.lines).toEqual([{ productId: stockProduct.id, itemUnitId: carton.id, quantity: 10, unitPrice: 150 }]);

    // Details: no unsaved-changes question, the server's code / status / totals.
    await expect(page).toHaveURL(/\/purchase-quotations\/[^/]+$/);
    await expect(page.getByRole("dialog")).toBeHidden();
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText(/عرض سعر شراء PQ-\d{4}-\d{6}/);
    const code = (await heading.locator("span[dir=ltr]").textContent()).trim();
    expect(code).toMatch(CODE_PATTERN);
    await expect(page.getByRole("alert")).toContainText(`تم إنشاء عرض السعر ${code}`);
    await expect(heading).toContainText("مسودة");
    const serverTotals = page.getByRole("group", { name: "الإجماليات" });
    await expect(serverTotals).toContainText("الخصم (10%)");
    await expect(serverTotals).toContainText("الضريبة (14%)");
    await expect(serverTotals).toContainText("1,539.00");
    await expect(serverTotals).not.toContainText("معاينة");
    await expect(bodyRows(page).first()).toContainText("المعامل 12");
  });

  // ─── 3. Lines ───────────────────────────────────────────────────────────────────────────────────────────

  test("lines: unit dropdown, SERVICE line, line % and amount, search by code / barcode (Arabic digits), remove, empty row", async ({
    page,
  }) => {
    await page.goto("/purchase-quotations/new");
    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await page.getByLabel("الفرع").selectOption(branchA.id);
    await page.getByLabel("ملاحظات").fill(`${tagText()} بنود`);

    // Line 1: found by its CODE typed with Arabic-Indic digits; keyboard ↓ + Enter.
    const line1 = lineFields(page, 1);
    await line1.product.fill(arabicDigits(stockProduct.code));
    await expect(listOptions(page)).toHaveCount(1);
    await line1.product.press("ArrowDown");
    await line1.product.press("Enter");
    await expect(line1.product).toHaveValue(stockProduct.name);
    await expect(line1.unit.locator("option")).toHaveText([`قطعة ${tag}`, `كرتونة ${tag} (12 قطعة ${tag})`]);
    await line1.unit.selectOption(carton.id);
    await line1.quantity.fill("2");
    await line1.price.fill("100");
    await line1.percent.fill("10");

    // Line 2: the SERVICE product, found by its name; a line AMOUNT discount.
    await page.getByRole("button", { name: "إضافة بند" }).click();
    const line2 = lineFields(page, 2);
    await expect(line2.product).toBeFocused();
    await line2.product.fill(serviceProduct.name);
    await expect(listOptions(page, new RegExp(serviceProduct.name))).toContainText("خدمي");
    await listOptions(page, new RegExp(serviceProduct.name)).click();
    await line2.discountTypes.getByRole("radio", { name: "مبلغ" }).click();
    await line2.quantity.fill("1");
    await line2.price.fill("50");
    await line2.amount.fill("5");

    // Barcode search (Arabic-Indic digits) in a 3rd row; Escape closes the list.
    await page.getByRole("button", { name: "إضافة بند" }).click();
    const line3 = lineFields(page, 3);
    await line3.product.fill(arabicDigits(stockProduct.barcode));
    await expect(listOptions(page, new RegExp(stockProduct.name))).toBeVisible();
    await line3.product.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(line3.product).toHaveValue("");

    // A row with data asks before removing; "إلغاء" keeps it.
    await line3.quantity.fill("5");
    await line3.remove.click();
    const confirm = page.getByRole("dialog", { name: "حذف البند" });
    await expect(confirm).toContainText("حذف البند رقم 3؟");
    await confirm.getByRole("button", { name: "إلغاء" }).click();
    await expect(line3.quantity).toHaveValue("5");
    await line3.remove.click();
    await confirm.getByRole("button", { name: "حذف البند" }).click();
    await expect(line3.quantity).toBeHidden();

    // An empty row is removed directly; another one left empty is ignored on save.
    await page.getByRole("button", { name: "إضافة بند" }).click();
    await lineFields(page, 3).remove.click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(lineFields(page, 3).quantity).toBeHidden();
    await page.getByRole("button", { name: "إضافة بند" }).click();

    // Line totals: 2 × 100 − 10% = 180; 50 − 5 = 45 → subTotal 225.
    await expect(page.getByRole("group", { name: "الإجماليات" })).toContainText("225.00");

    const sent = page.waitForRequest((req) => req.url() === `${API_URL}/purchase-quotations` && req.method() === "POST");
    await page.getByRole("button", { name: "حفظ" }).click();
    const body = (await sent).postDataJSON();
    expect(body.lines).toEqual([
      { productId: stockProduct.id, itemUnitId: carton.id, quantity: 2, unitPrice: 100, discountPercent: 10 },
      { productId: serviceProduct.id, itemUnitId: piece.id, quantity: 1, unitPrice: 50, discountValue: 5 },
    ]);

    // Details: the lines in the same order, the discounts as typed.
    await expect(page).toHaveURL(/\/purchase-quotations\/[^/]+$/);
    await expect(bodyRows(page)).toHaveCount(2);
    await expect(bodyRows(page).nth(0)).toContainText(stockProduct.name);
    await expect(bodyRows(page).nth(0)).toContainText("10%");
    await expect(bodyRows(page).nth(1)).toContainText(serviceProduct.name);
    await expect(bodyRows(page).nth(1)).toContainText("5.00");
    await expect(page.getByRole("group", { name: "الإجماليات" })).toContainText("225.00");
  });

  // ─── 4. Edit ────────────────────────────────────────────────────────────────────────────────────────────

  test("edit: quantity, discount % → amount, clear صالح حتى and the warehouse (null), full lines; new server totals", async ({
    page,
    request,
  }) => {
    const quotation = await createQuotation(request, {
      validUntil: day(30),
      warehouseId: warehouseA1.id,
      discountPercent: 10,
      taxPercent: 14,
    });
    await page.goto(`/purchase-quotations/${quotation.id}/edit`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`تعديل عرض السعر ${quotation.code}`);
    await expect(page.getByLabel("نسبة الخصم %")).toHaveValue("10");
    const line = lineFields(page, 1);
    await expect(line.unit).toHaveValue(carton.id);

    await line.quantity.fill("12");
    await page.getByRole("radiogroup", { name: "نوع الخصم" }).getByRole("radio", { name: "مبلغ" }).click();
    await page.getByLabel("قيمة الخصم").fill("100");
    await page.getByLabel("صالح حتى").fill("");
    await page.getByLabel("المخزن").selectOption("");

    const sent = page.waitForRequest(
      (req) => req.url() === `${API_URL}/purchase-quotations/${quotation.id}` && req.method() === "PATCH",
    );
    await page.getByRole("button", { name: "حفظ" }).click();
    const body = (await sent).postDataJSON();
    expect(body.validUntil).toBeNull();
    expect(body.warehouseId).toBeNull();
    expect(body.discountPercent).toBe(0);
    expect(body.discountValue).toBe(100);
    expect(body.lines).toEqual([{ productId: stockProduct.id, itemUnitId: carton.id, quantity: 12, unitPrice: 150 }]);

    // 12 × 150 = 1800 − 100 = 1700; tax 14% = 238 → 1938.
    await expect(page).toHaveURL(new RegExp(`/purchase-quotations/${quotation.id}$`));
    await expect(page.getByRole("alert")).toContainText("تم حفظ التعديلات");
    const totals = page.getByRole("group", { name: "الإجماليات" });
    await expect(totals).toContainText("1,800.00");
    await expect(totals).toContainText("238.00");
    await expect(totals).toContainText("1,938.00");
    await expect(page.locator("main dl")).toContainText("بدون مخزن");
  });

  // ─── 5. Client validation ───────────────────────────────────────────────────────────────────────────────

  test("client validation: Arabic errors, nothing sent", async ({ page }) => {
    let posts = 0;
    page.on("request", (req) => {
      if (req.url().startsWith(`${API_URL}/purchase-quotations`) && req.method() === "POST") posts += 1;
    });
    await page.goto("/purchase-quotations/new");
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByRole("alert").first()).toContainText("راجع الحقول المحددة باللون الأحمر");
    await expect(page.getByText("اختر المورد")).toBeVisible();
    await expect(page.getByText("يجب إضافة بند واحد على الأقل")).toBeVisible();

    const line = lineFields(page, 1);
    await pickSearchOption(page, line.product, stockProduct.name, new RegExp(stockProduct.name));
    await line.quantity.fill("0");
    await line.price.fill("10");
    await page.getByLabel("صالح حتى").fill(typedDay(-1));
    await line.discountTypes.getByRole("radio", { name: "مبلغ" }).click();
    await line.amount.fill("5");
    await page.getByLabel("نسبة الضريبة %").fill("101");
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("الكمية يجب أن تكون أكبر من صفر")).toBeVisible();
    await expect(page.getByText("تاريخ الصلاحية لا يمكن أن يكون قبل تاريخ العرض")).toBeVisible();
    await expect(page.getByText("النسبة يجب أن تكون بين 0 و 100")).toBeVisible();

    // quantity 1 × 10 = 10 < discount 15.
    await line.quantity.fill("1");
    await line.amount.fill("15");
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("الخصم أكبر من قيمة البند")).toBeVisible();
    expect(posts).toBe(0);
  });

  // ─── 6. Server line error ───────────────────────────────────────────────────────────────────────────────

  test.describe("expected API errors", () => {
    // The save answers 400; reloading the deleted product's units answers 404.
    test.use({ allowedConsoleErrors: [/status of (400|404)/] });

    test("server line error: a product deleted meanwhile → row 1 highlighted, Arabic message, form stays", async ({
      page,
      request,
    }) => {
      const quotation = await createQuotation(request, {
        lines: [{ productId: throwawayProduct.id, itemUnitId: piece.id, quantity: 1, unitPrice: 5 }],
      });
      await page.goto(`/purchase-quotations/${quotation.id}/edit`);
      await expect(lineFields(page, 1).product).toHaveValue(throwawayProduct.name);
      await lineFields(page, 1).quantity.fill("2");

      const deleted = await request.delete(`${API_URL}/products/${throwawayProduct.id}`, { headers: headers() });
      expect(deleted.ok()).toBeTruthy();
      await page.getByRole("button", { name: "حفظ" }).click();

      await expect(page.getByRole("alert").first()).toContainText("البند رقم 1: الصنف غير موجود أو محذوف");
      await expect(page).toHaveURL(/\/edit$/);
      await expect(bodyRows(page).first()).toHaveClass(/bg-red-50/);
      // The lists were refreshed: the product is shown as deleted.
      await expect(lineFields(page, 1).product).toHaveValue(`${throwawayProduct.name} (محذوف)`);
    });

    test("edit URL of an ACCEPTED quotation → not editable + details link; an unknown id → not found", async ({
      page,
      request,
    }) => {
      const quotation = await createQuotation(request);
      await setStatus(request, quotation.id, "SENT", "ACCEPTED");
      await page.goto(`/purchase-quotations/${quotation.id}/edit`);
      await expect(page.getByText("لا يمكن تعديل هذا العرض لأن حالته «مقبول»")).toBeVisible();
      await page.getByRole("link", { name: "عرض التفاصيل" }).click();
      await expect(page).toHaveURL(new RegExp(`/purchase-quotations/${quotation.id}$`));

      for (const path of ["/purchase-quotations/no-such-id", "/purchase-quotations/no-such-id/edit"]) {
        await page.goto(path);
        await expect(page.getByText("عرض السعر غير موجود أو محذوف")).toBeVisible();
        await expect(page.getByRole("link", { name: "العودة إلى عروض الأسعار" })).toBeVisible();
      }
    });
  });

  // ─── 7. Flow: send → accept → convert ───────────────────────────────────────────────────────────────────

  test("flow: إرسال → قبول → تحويل لفاتورة (آجل) → the new invoice opens; the quotation is CONVERTED with its link", async ({
    page,
    request,
  }) => {
    // It ends CONVERTED (can never be deleted): dated 2001, like every undeletable test document.
    const quotation = await createQuotation(request, { warehouseId: warehouseA1.id, quotationDate: TEST_DOC_DATE });
    await page.goto(`/purchase-quotations/${quotation.id}`);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("مسودة");

    await page.getByRole("button", { name: "إرسال" }).click();
    let dialog = page.getByRole("dialog", { name: "إرسال العرض" });
    await expect(dialog).toContainText("لا يمكن إعادته إلى مسودة");
    await dialog.getByRole("button", { name: "إرسال العرض" }).click();
    await expect(heading).toContainText("مُرسل");
    await expect(page.getByRole("alert")).toContainText("تم إرسال العرض");

    await page.getByRole("button", { name: "قبول" }).click();
    dialog = page.getByRole("dialog", { name: "قبول العرض" });
    await dialog.getByRole("button", { name: "قبول العرض" }).click();
    await expect(heading).toContainText("مقبول");
    await expect(page.getByRole("link", { name: "تعديل" })).toBeHidden();

    // The list: the edit button is disabled for an ACCEPTED quotation.
    await page.goto("/purchase-quotations");
    await page.getByPlaceholder("بحث برقم العرض أو اسم المورد أو الملاحظات").fill(quotation.code);
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: `تعديل ${quotation.code}` })).toBeDisabled();
    await page.getByRole("link", { name: quotation.code, exact: true }).click();

    // Convert: no payment type → error; آجل + the 2001 date (today is the default) → success.
    await page.getByRole("button", { name: "تحويل لفاتورة" }).click();
    const modal = page.getByRole("dialog", { name: "تحويل العرض إلى فاتورة شراء" });
    await expect(modal.getByLabel("المخزن")).toHaveValue(warehouseA1.name);
    await modal.getByRole("button", { name: "تحويل لفاتورة" }).click();
    await expect(modal).toContainText("اختر طريقة الدفع");
    await modal.getByLabel(/آجل/).check();
    await expect(modal.getByLabel("تاريخ الفاتورة")).toHaveValue(typedDay(0));
    await modal.getByLabel("تاريخ الفاتورة").fill(typedDate(TEST_DOC_DATE));
    await modal.getByRole("button", { name: "تحويل لفاتورة" }).click();

    // The new DRAFT invoice opens with the message (it is reviewed and posted there).
    await expect(page).toHaveURL(/\/purchase-invoices\/[^/]+$/);
    const invoiceUrl = page.url();
    await expect(heading).toContainText(/فاتورة شراء PI-\d{4}-\d{6}/);
    const invoiceCode = (await heading.locator("span[dir=ltr]").first().textContent()).trim();
    await expect(page.getByRole("alert")).toContainText(
      `تم إنشاء الفاتورة ${invoiceCode} من عرض السعر ${quotation.code} — راجعها ثم رحّلها`,
    );
    await expect(heading).toContainText("مسودة");

    // Back on the quotation: CONVERTED, "الفاتورة الناتجة" links to the invoice.
    await page.goto(`/purchase-quotations/${quotation.id}`);
    await expect(heading).toContainText("تم التحويل لفاتورة");
    const info = page.locator("main dl");
    await expect(info).toContainText(new RegExp(`الفاتورة الناتجة\\s*${invoiceCode}\\s*مسودة`));
    await expect(page.getByRole("button", { name: "حذف" })).toBeHidden();
    await expect(page.getByRole("button", { name: "تحويل لفاتورة" })).toBeHidden();
    await info.getByRole("link", { name: invoiceCode }).click();
    await expect(page).toHaveURL(invoiceUrl);
  });

  test("convert: a quotation without a warehouse asks for one of its branch's warehouses", async ({ page, request }) => {
    const quotation = await createQuotation(request);
    await setStatus(request, quotation.id, "SENT", "ACCEPTED");
    await page.goto(`/purchase-quotations/${quotation.id}`);
    await page.getByRole("button", { name: "تحويل لفاتورة" }).click();
    const modal = page.getByRole("dialog", { name: "تحويل العرض إلى فاتورة شراء" });
    const select = modal.getByLabel("المخزن");
    // Only branch A's warehouses (in any order), never branch B's.
    await expect(select.locator("option")).toHaveCount(3);
    await expect(select.locator("option").first()).toHaveText("اختر المخزن");
    await expect(select).toContainText(warehouseA1.name);
    await expect(select).toContainText(warehouseA2.name);
    await expect(select).not.toContainText(warehouseB1.name);
    await modal.getByRole("button", { name: "إلغاء" }).click();
    await expect(modal).toBeHidden();
  });

  // ─── 8. Reject ──────────────────────────────────────────────────────────────────────────────────────────

  test("reject: SENT → رفض (red confirm) → مرفوض, only حذف left", async ({ page, request }) => {
    const quotation = await createQuotation(request);
    await setStatus(request, quotation.id, "SENT");
    await page.goto(`/purchase-quotations/${quotation.id}`);
    await page.getByRole("button", { name: "رفض" }).click();
    const dialog = page.getByRole("dialog", { name: "رفض العرض" });
    const confirm = dialog.getByRole("button", { name: "رفض العرض" });
    await expect(confirm).toHaveClass(/bg-red-600/);
    await confirm.click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("مرفوض");
    await expect(page.getByRole("alert")).toContainText("تم رفض العرض");
    for (const name of ["تعديل", "قبول", "رفض", "إرسال"]) {
      await expect(page.getByRole("main").getByRole("button", { name, exact: true })).toBeHidden();
    }
    await expect(page.getByRole("button", { name: "حذف", exact: true })).toBeVisible();
  });

  // ─── 9. Delete ──────────────────────────────────────────────────────────────────────────────────────────

  test("delete from the details → the list with the message, the row is gone", async ({ page, request }) => {
    const quotation = await createQuotation(request);
    await page.goto(`/purchase-quotations/${quotation.id}`);
    await page.getByRole("button", { name: "حذف", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "حذف عرض السعر" });
    await expect(dialog).toContainText(`هل أنت متأكد من حذف عرض السعر ${quotation.code}؟`);
    await dialog.getByRole("button", { name: "حذف العرض" }).click();

    await expect(page).toHaveURL(/\/purchase-quotations$/);
    await expect(page.getByRole("alert")).toContainText(`تم حذف عرض السعر ${quotation.code}`);
    await page.getByPlaceholder("بحث برقم العرض أو اسم المورد أو الملاحظات").fill(quotation.code);
    await expect(page.getByText("لا توجد عروض أسعار تطابق الفلاتر")).toBeVisible();
    // A refresh does not show the message again (the router state was cleared).
    await page.reload();
    await expect(page.getByRole("heading", { name: "عروض أسعار الشراء" })).toBeVisible();
    await expect(page.getByText(`تم حذف عرض السعر ${quotation.code}`)).toBeHidden();
  });

  // ─── 10. Unsaved changes ────────────────────────────────────────────────────────────────────────────────

  test("unsaved changes: a Sidebar link asks; stay keeps the data; تجاهل leaves; an untouched form leaves directly", async ({
    page,
  }) => {
    // Untouched → leaves directly.
    await page.goto("/purchase-quotations/new");
    await expect(page.getByRole("heading", { name: "عرض سعر شراء جديد" })).toBeVisible();
    await page.getByRole("link", { name: "الموردين" }).click();
    await expect(page).toHaveURL(/\/suppliers$/);

    await page.goto("/purchase-quotations/new");
    await page.getByLabel("ملاحظات").fill("نص لم يُحفظ");
    await page.getByRole("link", { name: "الموردين" }).click();
    const dialog = page.getByRole("dialog", { name: "تجاهل التغييرات" });
    await expect(dialog).toContainText("لديك تغييرات غير محفوظة. هل تريد مغادرة الصفحة بدون حفظ؟");
    await expect(dialog.getByRole("button", { name: "تجاهل التغييرات" })).toHaveClass(/bg-red-600/);
    await dialog.getByRole("button", { name: "البقاء في الصفحة" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/purchase-quotations\/new$/);
    await expect(page.getByLabel("ملاحظات")).toHaveValue("نص لم يُحفظ");

    // Asked again: "تجاهل التغييرات" leaves.
    await page.getByRole("link", { name: "الموردين" }).click();
    await dialog.getByRole("button", { name: "تجاهل التغييرات" }).click();
    await expect(page).toHaveURL(/\/suppliers$/);

    // Refresh / close the tab while dirty → the browser's own prompt (beforeunload).
    await page.goto("/purchase-quotations/new");
    await page.getByLabel("ملاحظات").fill("نص آخر");
    const prompt = new Promise((resolve) => {
      page.once("dialog", async (browserDialog) => {
        resolve(browserDialog.type());
        await browserDialog.dismiss();
      });
    });
    await page.close({ runBeforeUnload: true });
    expect(await prompt).toBe("beforeunload");
  });

  test("logout while the form is dirty is not blocked (the Header asks its own confirmation)", async ({ page }) => {
    await page.goto("/purchase-quotations/new");
    await page.getByLabel("ملاحظات").fill("نص لم يُحفظ");
    await page.getByRole("banner").getByRole("button", { name: "تسجيل الخروج" }).click();
    await page.getByRole("dialog", { name: "تسجيل الخروج" }).getByRole("button", { name: "تسجيل الخروج" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

});

// ─── Mocked API ───────────────────────────────────────────────────────────────────────────────────────────

const SUPPLIER = { id: "s1", code: "SUP-000001", name: "النيل" };
const BRANCH = { id: "b1", code: "branch-000001", name: "فرع المعادي" };

function ok(data) {
  return { status: 200, contentType: "application/json", body: JSON.stringify({ message: "ok", data }) };
}
function fail(status, code, field = null) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify({ statusCode: status, message: "English text", error: "Error", code, field }),
  };
}

function quotationItem(n, overrides = {}) {
  return {
    id: `q${n}`,
    code: `PQ-2026-${String(n).padStart(6, "0")}`,
    quotationDate: "2026-11-20T00:00:00.000Z",
    validUntil: null,
    status: "DRAFT",
    supplierId: SUPPLIER.id,
    branchId: BRANCH.id,
    warehouseId: null,
    subTotal: "1500",
    discountPercent: "10",
    discountValue: "150",
    taxPercent: "14",
    taxValue: "189",
    netTotal: "1539",
    convertedToInvoiceId: null,
    notes: null,
    createdDate: "2026-11-20T10:00:00.000Z",
    modifiedDate: "2026-11-20T10:00:00.000Z",
    supplier: SUPPLIER,
    branch: BRANCH,
    warehouse: null,
    _count: { lines: 1 },
    isExpired: false,
    createdByUser: { id: "u1", username: "admin" },
    modifiedByUser: null,
    lines: [
      {
        id: "l1",
        productId: "p1",
        itemUnitId: "u-carton",
        unitFactor: "12",
        quantity: "10",
        unitPrice: "150",
        discountPercent: null,
        discountValue: null,
        lineTotal: "1500",
        notes: null,
        product: { id: "p1", code: "PRD-000001", name: "فرشة", itemType: "STOCK" },
        itemUnit: { id: "u-carton", code: "unit-1", name: "كرتونة" },
      },
    ],
    ...overrides,
  };
}

function page1(items, total = items.length, page = 1) {
  return { items, meta: { page, pageSize: 20, total, totalPages: Math.ceil(total / 20) } };
}

// The filter lists of the list page.
async function mockLists(page) {
  await page.route(`${API_URL}/supplier`, (route) => route.fulfill(ok([SUPPLIER])));
  await page.route(`${API_URL}/branch`, (route) => route.fulfill(ok([BRANCH])));
}

test.describe("mocked API", () => {
  test.beforeEach(async ({ page }) => {
    await setFakeSession(page);
    await mockLists(page);
  });

  test("empty list: لا توجد عروض أسعار بعد + عرض سعر جديد", async ({ page }) => {
    await page.route(`${API_URL}/purchase-quotations?*`, (route) => route.fulfill(ok(page1([]))));
    await page.goto("/purchase-quotations");
    await expect(page.getByText("لا توجد عروض أسعار بعد")).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "عرض سعر جديد" })).toHaveCount(2);
  });

  test.describe("list error", () => {
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("error + retry", async ({ page }) => {
      // Fails until the retry (dev StrictMode loads twice on the first render).
      let failing = true;
      await page.route(`${API_URL}/purchase-quotations?*`, (route) =>
        route.fulfill(failing ? fail(500, "INTERNAL_ERROR") : ok(page1([quotationItem(1)]))),
      );
      await page.goto("/purchase-quotations");
      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();
      failing = false;
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();
      await expect(bodyRows(page)).toHaveCount(1);
    });
  });

  test("filtered empty: لا توجد عروض أسعار تطابق الفلاتر + مسح الفلاتر", async ({ page }) => {
    await page.route(`${API_URL}/purchase-quotations?*`, (route) => {
      const filtered = new URL(route.request().url()).searchParams.has("status");
      return route.fulfill(ok(page1(filtered ? [] : [quotationItem(1)])));
    });
    await page.goto("/purchase-quotations");
    await expect(bodyRows(page)).toHaveCount(1);
    await page.getByLabel("الحالة").selectOption("REJECTED");
    await expect(page.getByText("لا توجد عروض أسعار تطابق الفلاتر")).toBeVisible();
    await page.getByRole("main").getByRole("button", { name: "مسح الفلاتر" }).last().click();
    await expect(bodyRows(page)).toHaveCount(1);
  });

  test("pagination: total 45 → صفحة 1 من 3; التالي asks for page=2", async ({ page }) => {
    await page.route(`${API_URL}/purchase-quotations?*`, (route) => {
      const requested = Number(new URL(route.request().url()).searchParams.get("page"));
      const items = Array.from({ length: 20 }, (_, i) => quotationItem((requested - 1) * 20 + i + 1));
      return route.fulfill(ok(page1(items, 45, requested)));
    });
    await page.goto("/purchase-quotations");
    await expect(page.getByText("صفحة 1 من 3")).toBeVisible();
    const next = page.waitForRequest((req) => req.url().includes("/purchase-quotations?") && req.url().includes("page=2"));
    await page.getByRole("button", { name: "التالي" }).click();
    await next;
    await expect(page.getByText("صفحة 2 من 3")).toBeVisible();
    await expect(bodyRows(page).first()).toContainText("PQ-2026-000021");
  });

  test.describe("action errors", () => {
    // One regex: an array of two would be read by Playwright as [value, fixture options].
    test.use({ allowedConsoleErrors: [/status of (409|400)/] });

    test("409 INVALID_STATUS on إرسال → Arabic message + refresh (the buttons follow the real status)", async ({
      page,
    }) => {
      // DRAFT on screen; someone else sent it meanwhile → after the 409 the refresh reads SENT.
      let changedElsewhere = false;
      await page.route(`${API_URL}/purchase-quotations/q1`, (route) =>
        route.fulfill(ok(quotationItem(1, { status: changedElsewhere ? "SENT" : "DRAFT" }))),
      );
      await page.route(`${API_URL}/purchase-quotations/q1/status`, (route) => {
        changedElsewhere = true;
        return route.fulfill(fail(409, "INVALID_STATUS", "status"));
      });
      await page.goto("/purchase-quotations/q1");
      await page.getByRole("button", { name: "إرسال" }).click();
      await page.getByRole("dialog", { name: "إرسال العرض" }).getByRole("button", { name: "إرسال العرض" }).click();
      await expect(page.getByRole("alert")).toContainText("لا يمكن تنفيذ العملية في حالة المستند الحالية");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("مُرسل");
      await expect(page.getByRole("button", { name: "قبول" })).toBeVisible();
    });

    test("convert 400 BAD_REQUEST currencyId → لا توجد عملة أساسية، أضف عملة أولًا", async ({ page }) => {
      await page.route(`${API_URL}/purchase-quotations/q1`, (route) =>
        route.fulfill(ok(quotationItem(1, { status: "ACCEPTED", warehouseId: "w1", warehouse: { id: "w1", name: "مخزن" } }))),
      );
      await page.route(`${API_URL}/purchase-quotations/q1/convert-to-invoice`, (route) =>
        route.fulfill(fail(400, "BAD_REQUEST", "currencyId")),
      );
      await page.goto("/purchase-quotations/q1");
      await page.getByRole("button", { name: "تحويل لفاتورة" }).click();
      const modal = page.getByRole("dialog", { name: "تحويل العرض إلى فاتورة شراء" });
      await modal.getByLabel(/نقدي/).check();
      await modal.getByRole("button", { name: "تحويل لفاتورة" }).click();
      await expect(modal.getByRole("alert")).toContainText("لا توجد عملة أساسية، أضف عملة أولًا");
      await expect(modal).toBeVisible();
    });
  });

  test.describe("deleted invoice", () => {
    test.use({ allowedConsoleErrors: [/status of 404/] });

    test("a CONVERTED quotation whose invoice was deleted → الفاتورة محذوفة", async ({ page }) => {
      await page.route(`${API_URL}/purchase-quotations/q1`, (route) =>
        route.fulfill(ok(quotationItem(1, { status: "CONVERTED", convertedToInvoiceId: "i1" }))),
      );
      await page.route(`${API_URL}/purchase-invoices/i1`, (route) => route.fulfill(fail(404, "NOT_FOUND")));
      await page.goto("/purchase-quotations/q1");
      await expect(page.locator("main dl")).toContainText("الفاتورة محذوفة");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("تم التحويل لفاتورة");
      await expect(page.getByRole("button", { name: "حذف", exact: true })).toBeHidden();
    });
  });

  test.describe("font كبير at 1280×720", () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test("the form lines stay usable: delete button visible, the product list is not cut off", async ({ page }) => {
      await page.evaluate(([key]) => localStorage.setItem(key, "large"), [FONT_SIZE_KEY]);
      const products = Array.from({ length: 30 }, (_, i) => ({
        id: `p${i}`,
        code: `PRD-${String(i).padStart(6, "0")}`,
        name: `صنف تجريبي رقم ${i} باسم طويل نسبيًا`,
        itemType: "STOCK",
        barcode: null,
        primaryItemUnitId: "u-piece",
        primaryItemUnit: { id: "u-piece", name: "قطعة" },
      }));
      await page.route(`${API_URL}/inventory`, (route) => route.fulfill(ok([])));
      await page.route(`${API_URL}/products`, (route) => route.fulfill(ok(products)));
      await page.route(`${API_URL}/products/*/units`, (route) =>
        route.fulfill(ok([{ id: null, isPrimary: true, itemUnitId: "u-piece", itemUnit: { id: "u-piece", name: "قطعة" }, factor: "1" }])),
      );
      // The details page: the lines table and the totals are visible.
      await page.route(`${API_URL}/purchase-quotations/q1`, (route) => route.fulfill(ok(quotationItem(1))));
      await page.goto("/purchase-quotations/q1");
      await expect(bodyRows(page)).toHaveCount(1);
      await expect(page.getByRole("group", { name: "الإجماليات" })).toContainText("1,539.00");
      await expect(page.getByRole("button", { name: "إرسال" })).toBeInViewport();

      // The form: the product list opens on top of the (overflowing) lines table, the delete button stays visible.
      await page.goto("/purchase-quotations/new");
      const line = lineFields(page, 1);
      await line.product.click();
      const list = page.getByRole("listbox");
      await expect(list).toBeVisible();
      await expect(list).toBeInViewport();
      await expect(listOptions(page)).toHaveCount(30);
      await listOptions(page).first().click();
      await expect(line.product).toHaveValue(products[0].name);
      await line.quantity.fill("3");
      await expect(line.remove).toBeInViewport({ ratio: 1 });
    });
  });
});
