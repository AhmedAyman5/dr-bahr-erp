// Purchase invoices (فواتير الشراء): list, new / edit form (full page), details + post / cancel / delete, the
// duplicate supplier bill warning, currencies, expiry dates, the stock it moves (item card / stock movements links).
// Docs: ../backend/doc/week2/purchase-invoices.txt + week2flow.txt.
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down. beforeEach creates, with a
// unique tag: a supplier, a branch with 2 warehouses (A, B), a category, item units (piece, carton), the brush (STOCK,
// carton = 12 pieces, opening stock 100 @ 10 in warehouse A — the week2flow example), a product with an expiry date,
// a SERVICE product. A throwaway currency is made only by the test that needs it, and is only used on DRAFTs.
// Tests post ONLY into their own warehouses with their own products (demo item cards never change), in the default
// currency (a posted invoice locks its currency for ever).
// Every invoice / quotation that ends POSTED, CANCELLED or CONVERTED (never deletable) is dated 2001 (TEST_DOC_DATE in
// helpers.js): its own PI-2001-… / PQ-2001-… numbers, sorted to the end of the lists. Deletable drafts may keep today.
// Every test invoice / quotation's notes contain "e2e-<tag>" (found again with ?search=). afterEach: POSTED invoices
// are cancelled (stock raised first if a test used part of it) and stay CANCELLED (allowed by the leftover check in
// global-setup.js), DRAFT invoices are deleted, then the quotations, the currency and the setup records.
//
// "mocked API" tests fake the endpoints with page.route: empty / error / pagination, a posted return that blocks the
// cancel, a 400 on cancel, a 409 on post, font كبير at 1280×720.
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
  addDays,
  typedDate,
} from "./helpers";

const CODE_PATTERN = /PI-\d{4}-\d{6}/;
const FONT_SIZE_KEY = "ui.fontSize";
const SEARCH_PLACEHOLDER = "بحث برقم الفاتورة أو رقم فاتورة المورد أو اسم المورد أو الملاحظات";

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

test.use({ timezoneId: "Africa/Cairo" });

function bodyRows(page) {
  return page.locator("main table tbody tr");
}

// Chooses an option of a SearchSelect (combobox) by typing.
async function pickSearchOption(page, combobox, text, optionName) {
  await combobox.fill(text);
  await page.getByRole("listbox").getByRole("option", { name: optionName }).click();
}

// The lines of the form.
function lineFields(page, n) {
  return {
    product: page.getByRole("combobox", { name: `الصنف — البند ${n}` }),
    unit: page.getByLabel(`الوحدة — البند ${n}`, { exact: true }),
    quantity: page.getByLabel(`الكمية — البند ${n}`),
    price: page.getByLabel(`سعر شراء الوحدة — البند ${n}`),
    expiry: page.getByLabel(`تاريخ الصلاحية — البند ${n}`),
    batch: page.getByLabel(`رقم التشغيلة — البند ${n}`),
  };
}

// The heading's document code ("PI-2026-000012").
async function headingCode(page) {
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toContainText(CODE_PATTERN);
  return (await heading.locator("span[dir=ltr]").first().textContent()).trim();
}

test.describe("with backend", () => {
  let token;
  let tag;
  let session;
  let supplier;
  let branch;
  let warehouseA;
  let warehouseB;
  let piece;
  let carton;
  let brush;
  let brushStock;
  let teaProduct;
  let serviceProduct;
  let defaultCurrency;

  const headers = () => ({ Authorization: `Bearer ${token}` });
  const tagText = () => `e2e-${tag}`;

  async function callApi(request, method, path, data) {
    const response = await request.fetch(`${API_URL}${path}`, { method, headers: headers(), data });
    const details = response.ok() ? "" : ` (${response.status()} ${await response.text()})`;
    expect(response.ok(), `${method} ${path} failed${details}`).toBeTruthy();
    return method === "DELETE" ? null : (await response.json()).data;
  }

  async function createProduct(request, body) {
    const category = await createByApi(request, token, "/categories", { name: `تصنيف فواتير ${tag} ${randomTag()}` });
    return createByApi(request, token, "/products", {
      categoryId: category.id,
      primaryItemUnitId: piece.id,
      retailPrice: 20,
      wholesalePrice: 18,
      bulkWholesalePrice: 16,
      ...body,
    });
  }

  // An invoice through the API (notes always carry the tag), in the DEFAULT currency, dated 2001 (it may be posted:
  // then it can never be deleted). lines default: the brush, 10 cartons × 150 (+ 10% + 14% tax → net 1,539.00).
  async function createInvoice(request, overrides = {}) {
    return createByApi(request, token, "/purchase-invoices", {
      invoiceDate: TEST_DOC_DATE,
      paymentType: "CREDIT",
      supplierId: supplier.id,
      branchId: branch.id,
      warehouseId: warehouseA.id,
      currencyId: defaultCurrency.id,
      discountPercent: 10,
      discountValue: 0,
      taxPercent: 14,
      lines: [{ productId: brush.id, itemUnitId: carton.id, quantity: 10, unitCost: 150 }],
      ...overrides,
      notes: `${tagText()} ${overrides.notes ?? "فاتورة"}`,
    });
  }

  async function postInvoice(request, id) {
    return callApi(request, "POST", `/purchase-invoices/${id}/post`);
  }

  // An ACCEPTED quotation with the tea (expiry) product, warehouse A. Converted by the tests → CONVERTED for ever:
  // dated 2001.
  async function createAcceptedQuotation(request) {
    const quotation = await createByApi(request, token, "/purchase-quotations", {
      quotationDate: TEST_DOC_DATE,
      supplierId: supplier.id,
      branchId: branch.id,
      warehouseId: warehouseA.id,
      discountPercent: 0,
      discountValue: 0,
      taxPercent: 0,
      lines: [{ productId: teaProduct.id, itemUnitId: piece.id, quantity: 5, unitPrice: 20 }],
      notes: `${tagText()} عرض`,
    });
    for (const status of ["SENT", "ACCEPTED"]) {
      await callApi(request, "PATCH", `/purchase-quotations/${quotation.id}/status`, { status });
    }
    return quotation;
  }

  // A test currency with a random 3-letter code that is never a real one (like the currencies tests).
  async function createThrowawayCurrency(request) {
    const firstLetters = { Q: "A", W: "S", O: "M", Y: "E" };
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const pick = (except = "") => {
      const options = letters.replace(except, "");
      return options[Math.floor(Math.random() * options.length)];
    };
    for (let attempt = 0; attempt < 30; attempt++) {
      const first = Object.keys(firstLetters)[Math.floor(Math.random() * 4)];
      const response = await request.post(`${API_URL}/currency`, {
        headers: headers(),
        data: { code: `${first}${pick(firstLetters[first])}${pick()}`, name: `عملة فواتير ${tag}` },
      });
      if (response.status() === 409) continue;
      expect(response.ok(), "creating a test currency failed").toBeTruthy();
      return (await response.json()).data;
    }
    throw new Error("no free test currency code found after 30 tries");
  }

  async function taggedInvoices(request) {
    const response = await request.get(`${API_URL}/purchase-invoices`, {
      headers: headers(),
      params: { search: tagText(), pageSize: 100 },
    });
    return (await response.json()).data?.items ?? [];
  }

  // A posted test invoice whose goods were partly used can't be cancelled: raise the stock of its warehouse first.
  async function cancelForCleanup(request, invoice) {
    const cancel = () => request.post(`${API_URL}/purchase-invoices/${invoice.id}/cancel`, { headers: headers() });
    if ((await cancel()).ok()) return;
    const stockResponse = await request.get(`${API_URL}/product-inventory/inventory/${invoice.warehouseId}`, {
      headers: headers(),
    });
    for (const record of (await stockResponse.json()).data ?? []) {
      await request.patch(`${API_URL}/product-inventory/${record.id}`, {
        headers: headers(),
        data: { quantity: Number(record.quantity) + 100000, reason: "e2e cleanup" },
      });
    }
    await cancel();
  }

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);
    tag = randomTag();
    session = await apiLogin(request);
    token = session.access_token;

    const currencies = await callApi(request, "GET", "/currency");
    defaultCurrency = currencies.find((currency) => currency.isDefault);
    expect(defaultCurrency, "a default currency (EGP) must exist").toBeTruthy();

    supplier = await createByApi(request, token, "/supplier", { name: `مورد فواتير ${tag}` });
    branch = await createByApi(request, token, "/branch", { name: `فرع فواتير ${tag}` });
    warehouseA = await createByApi(request, token, `/inventory/branch/${branch.id}`, { name: `مخزن أ ${tag}`, address: "عنوان المخزن" });
    warehouseB = await createByApi(request, token, `/inventory/branch/${branch.id}`, { name: `مخزن ب ${tag}`, address: "عنوان المخزن" });
    piece = await createByApi(request, token, "/item-unit", { name: `قطعة ${tag}` });
    carton = await createByApi(request, token, "/item-unit", { name: `كرتونة ${tag}` });
    brush = await createProduct(request, { name: `فرشة فواتير ${tag}` });
    await createByApi(request, token, `/products/${brush.id}/units`, { itemUnitId: carton.id, factor: 12 });
    brushStock = await createByApi(request, token, `/product-inventory/inventory/${warehouseA.id}`, {
      productId: brush.id,
      quantity: 100,
      costPrice: 10,
    });
    teaProduct = await createProduct(request, { name: `شاي فواتير ${tag}`, hasExpiryDate: true });
    serviceProduct = await createProduct(request, { name: `خدمة فواتير ${tag}`, itemType: "SERVICE" });

    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;
    // Invoices: POSTED → cancelled (they stay, CANCELLED); DRAFT → deleted.
    for (const invoice of await taggedInvoices(request)) {
      if (invoice.status === "POSTED") await cancelForCleanup(request, invoice);
      if (invoice.status === "DRAFT") {
        await request.delete(`${API_URL}/purchase-invoices/${invoice.id}`, { headers: headers() });
      }
    }
    // Quotations (a CONVERTED one can't be deleted: allowed by the leftover check).
    const quotations = await request.get(`${API_URL}/purchase-quotations`, {
      headers: headers(),
      params: { search: tagText(), pageSize: 100 },
    });
    for (const quotation of (await quotations.json()).data?.items ?? []) {
      if (quotation.status !== "CONVERTED") {
        await request.delete(`${API_URL}/purchase-quotations/${quotation.id}`, { headers: headers() });
      }
    }
    // The throwaway currency (only DRAFT invoices used it, all deleted above).
    await deleteByTag(request, token, "/currency", tag);
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

  test("list: filters (supplier, status, payment type, warehouse, search by supplier bill, dates), fits the screen", async ({
    page,
    request,
  }) => {
    // Two drafts dated today / 3 days ago (deleted by afterEach) + a posted one (2001, see createInvoice).
    const credit = await createInvoice(request, {
      notes: "آجل",
      invoiceDate: day(0),
      supplierInvoiceNumber: `NILE-${tag}`,
      dueDate: day(30),
      paidAmount: 500,
    });
    const cash = await createInvoice(request, {
      notes: "نقدي",
      paymentType: "CASH",
      warehouseId: warehouseB.id,
      invoiceDate: day(-3),
      discountPercent: 0,
      taxPercent: 0,
    });
    const posted = await createInvoice(request, { notes: "مرحلة" });
    await postInvoice(request, posted.id);

    await page.goto("/purchase-invoices");
    await expect(page.getByRole("heading", { name: "فواتير الشراء" })).toBeVisible();
    await expect(page.getByText("البضاعة الواردة من الموردين — الترحيل يضيف الكميات إلى المخزن")).toBeVisible();
    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await expect(bodyRows(page)).toHaveCount(3);

    // Columns: code (+ supplier bill) · date (+ due) · supplier · branch (+ warehouse) · net + currency (+ payment) ·
    // status · actions.
    const creditRow = bodyRows(page).filter({ hasText: credit.code });
    await expect(creditRow).toContainText(`فاتورة المورد: NILE-${tag}`);
    await expect(creditRow).toContainText("استحقاق");
    await expect(creditRow).toContainText(supplier.name);
    await expect(creditRow).toContainText(warehouseA.name);
    await expect(creditRow).toContainText(`1,539.00 ${defaultCurrency.code}`);
    await expect(creditRow).toContainText("آجل · المتبقي 1,039.00");
    await expect(creditRow).toContainText("مسودة");
    const cashRow = bodyRows(page).filter({ hasText: cash.code });
    await expect(cashRow).toContainText("نقدي");
    await expect(cashRow).toContainText(warehouseB.name);
    await expect(cashRow).not.toContainText("فاتورة المورد");
    // A POSTED invoice can't be edited: the button is disabled with the reason.
    await expect(page.getByRole("button", { name: `تعديل ${posted.code}` })).toBeDisabled();
    await expect(page.locator('span[title="لا يمكن تعديل فاتورة حالتها «مُرحّل»"]')).toHaveCount(1);
    await expect(page.getByRole("link", { name: `تعديل ${credit.code}` })).toBeVisible();

    // Status, payment type, warehouse, search by the supplier's bill number.
    await page.getByLabel("الحالة").selectOption("POSTED");
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page).first()).toContainText(posted.code);
    await expect(bodyRows(page).first()).toContainText("مُرحّل");
    await page.getByLabel("الحالة").selectOption("");
    await page.getByLabel("طريقة الدفع").selectOption("CASH");
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page).first()).toContainText(cash.code);
    await page.getByLabel("طريقة الدفع").selectOption("");
    await page.getByLabel("المخزن").selectOption(warehouseB.id);
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(page.getByLabel("المخزن").locator("option:checked")).toHaveText(`${warehouseB.name} — ${branch.name}`);
    await page.getByLabel("المخزن").selectOption("");
    await expect(bodyRows(page)).toHaveCount(3);
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(`nile-${tag}`);
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page).first()).toContainText(credit.code);
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill("");
    await expect(bodyRows(page)).toHaveCount(3);

    // Dates: a DATE-ONLY column → the plain "YYYY-MM-DD" in the request.
    const dated = page.waitForRequest(
      (req) =>
        req.url().includes("/purchase-invoices?") &&
        req.url().includes(`dateFrom=${day(-3)}`) &&
        req.url().includes(`dateTo=${day(0)}`),
    );
    await page.getByLabel("من تاريخ").fill(typedDay(-3));
    await page.getByLabel("إلى تاريخ").fill(typedDay(0));
    await dated;
    await expect(bodyRows(page)).toHaveCount(2);

    await page.getByRole("button", { name: "مسح الفلاتر" }).click();
    await expect(page.getByRole("combobox", { name: "المورد" })).toHaveValue("كل الموردين");
    await expect(page.getByRole("button", { name: "مسح الفلاتر" })).toBeHidden();

    // No sideways scroll at 1366×768 and 1280×720 (font متوسط).
    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await expect(bodyRows(page)).toHaveCount(3);
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      const box = page.locator("main table").first().locator("xpath=..");
      await expect.poll(() => box.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    }
  });

  // ─── 2. Create آجل ──────────────────────────────────────────────────────────────────────────────────────

  test("create آجل: 10 cartons × 150, 10% + 14%, paid 500 → preview 1539 / remaining 1039, = 120 قطعة; body; server values", async ({
    page,
  }) => {
    await page.goto("/purchase-invoices/new");
    await expect(page.getByRole("heading", { name: "فاتورة شراء جديدة" })).toBeVisible();
    await expect(page.getByLabel("تاريخ الفاتورة")).toHaveValue(typedDay(0));
    // The default currency is chosen and marked; no exchange rate for it.
    await expect(page.getByLabel("العملة").locator("option:checked")).toContainText("(الأساسية)");
    await expect(page.getByLabel("سعر الصرف")).toHaveCount(0);
    // No payment type until the user chooses one → no paid / remaining rows.
    const totals = page.getByRole("group", { name: "الإجماليات" });
    await expect(totals).not.toContainText("المدفوع");

    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await page.getByRole("radio", { name: /آجل/ }).check();
    await page.getByLabel("الفرع").selectOption(branch.id);
    // Two warehouses in the branch → the user chooses.
    await expect(page.getByLabel("المخزن")).toHaveValue("");
    await page.getByLabel("المخزن").selectOption(warehouseA.id);
    await page.getByLabel("ملاحظات").fill(`${tagText()} آجل`);

    const line = lineFields(page, 1);
    await pickSearchOption(page, line.product, brush.name, new RegExp(brush.name));
    await line.unit.selectOption(carton.id);
    await line.quantity.fill("10");
    await expect(page.getByText(`= 120 قطعة ${tag}`)).toBeVisible();
    await line.price.fill("150");
    await page.getByLabel("نسبة الخصم %").fill("10");
    await page.getByLabel("نسبة الضريبة %").fill("14");
    await totals.getByLabel("المدفوع").fill("500");

    await expect(totals).toContainText("1,500.00");
    await expect(totals).toContainText("150.00");
    await expect(totals).toContainText("189.00");
    await expect(totals).toContainText("1,539.00");
    await expect(totals).toContainText(/المتبقي\s*1,039.00/);
    await expect(totals).toContainText("المبالغ بالعملة الأساسية");

    const sent = page.waitForRequest((req) => req.url() === `${API_URL}/purchase-invoices` && req.method() === "POST");
    await page.getByRole("button", { name: "حفظ" }).click();
    const body = (await sent).postDataJSON();
    for (const field of ["code", "status", "subTotal", "netTotal", "remainingAmount", "exchangeRate", "dueDate", "supplierInvoiceNumber"]) {
      expect(body, `body has no ${field}`).not.toHaveProperty(field);
    }
    expect(body).toMatchObject({
      invoiceDate: day(0),
      paymentType: "CREDIT",
      supplierId: supplier.id,
      branchId: branch.id,
      warehouseId: warehouseA.id,
      currencyId: defaultCurrency.id,
      discountPercent: 10,
      discountValue: 0,
      taxPercent: 14,
      paidAmount: 500,
    });
    expect(body.lines).toEqual([{ productId: brush.id, itemUnitId: carton.id, quantity: 10, unitCost: 150 }]);

    // Details: no unsaved-changes question, the server's values.
    await expect(page).toHaveURL(/\/purchase-invoices\/[^/]+$/);
    await expect(page.getByRole("dialog")).toBeHidden();
    const code = await headingCode(page);
    await expect(page.getByRole("alert").filter({ hasText: `تم إنشاء فاتورة الشراء ${code}` })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("مسودة");
    const serverTotals = page.getByRole("group", { name: "الإجماليات" });
    await expect(serverTotals).toContainText("الخصم (10%)");
    await expect(serverTotals).toContainText("الضريبة (14%)");
    await expect(serverTotals).toContainText(/الصافي\s*1,539.00/);
    await expect(serverTotals).toContainText(/المدفوع\s*500.00/);
    await expect(serverTotals).toContainText(/المتبقي\s*1,039.00/);
    await expect(serverTotals).not.toContainText("معاينة");
    await expect(bodyRows(page).first()).toContainText("المعامل 12");
    await expect(bodyRows(page).first()).toContainText(`= 120 قطعة ${tag}`);
    // DRAFT: nothing went into stock yet → no stock cost line, no item card button.
    await expect(bodyRows(page).first()).not.toContainText("تكلفة القطعة في المخزن");
    await expect(page.getByRole("link", { name: "كارت الصنف — البند 1" })).toHaveCount(0);
    await expect(page.locator("main dl")).toContainText("آجل");
  });

  // ─── 3. نقدي ────────────────────────────────────────────────────────────────────────────────────────────

  test("نقدي: no paid input, مدفوع بالكامل, body without paidAmount / dueDate; آجل shows the inputs again", async ({
    page,
  }) => {
    await page.goto("/purchase-invoices/new");
    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await page.getByLabel("الفرع").selectOption(branch.id);
    await page.getByLabel("المخزن").selectOption(warehouseB.id);
    await page.getByLabel("ملاحظات").fill(`${tagText()} نقدي`);
    const line = lineFields(page, 1);
    await pickSearchOption(page, line.product, brush.name, new RegExp(brush.name));
    await line.quantity.fill("2");
    await line.price.fill("10");

    const totals = page.getByRole("group", { name: "الإجماليات" });
    // آجل first: the paid input + the due date appear.
    await page.getByRole("radio", { name: /آجل/ }).check();
    await expect(totals.getByLabel("المدفوع")).toBeVisible();
    await expect(page.getByLabel("تاريخ الاستحقاق")).toBeVisible();
    await page.getByLabel("تاريخ الاستحقاق").fill(typedDay(15));
    await totals.getByLabel("المدفوع").fill("5");

    // نقدي: paid = the net total, nothing to type.
    await page.getByRole("radio", { name: /نقدي/ }).check();
    await expect(totals.getByLabel("المدفوع")).toHaveCount(0);
    await expect(page.getByLabel("تاريخ الاستحقاق")).toHaveCount(0);
    await expect(totals).toContainText("مدفوع بالكامل");
    await expect(totals).toContainText(/المدفوع\s*20.00/);
    await expect(totals).toContainText(/المتبقي\s*0.00/);

    const sent = page.waitForRequest((req) => req.url() === `${API_URL}/purchase-invoices` && req.method() === "POST");
    await page.getByRole("button", { name: "حفظ" }).click();
    const body = (await sent).postDataJSON();
    expect(body.paymentType).toBe("CASH");
    expect(body).not.toHaveProperty("paidAmount");
    expect(body).not.toHaveProperty("dueDate");

    await expect(page).toHaveURL(/\/purchase-invoices\/[^/]+$/);
    const serverTotals = page.getByRole("group", { name: "الإجماليات" });
    await expect(serverTotals).toContainText(/المدفوع\s*20.00/);
    await expect(serverTotals).toContainText(/المتبقي\s*0.00/);
    await expect(page.locator("main dl")).toContainText("نقدي");
    await expect(page.locator("main dl")).not.toContainText("تاريخ الاستحقاق");
  });

  // ─── 4. Currency ────────────────────────────────────────────────────────────────────────────────────────

  test("currency: another one → سعر الصرف required and sent; back to the default → the field goes, not sent", async ({
    page,
    request,
  }) => {
    const currency = await createThrowawayCurrency(request);
    await page.goto("/purchase-invoices/new");
    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await page.getByRole("radio", { name: /آجل/ }).check();
    await page.getByLabel("الفرع").selectOption(branch.id);
    await page.getByLabel("المخزن").selectOption(warehouseA.id);
    await page.getByLabel("ملاحظات").fill(`${tagText()} عملة`);
    const line = lineFields(page, 1);
    await pickSearchOption(page, line.product, brush.name, new RegExp(brush.name));
    await line.quantity.fill("4");
    await line.price.fill("2.5");

    await page.getByLabel("العملة").selectOption(currency.id);
    const rate = page.getByLabel("سعر الصرف");
    await expect(rate).toBeVisible();
    await expect(page.locator("main")).toContainText(`1 ${currency.name} =`);
    await expect(page.locator("main")).toContainText(defaultCurrency.name);
    const totals = page.getByRole("group", { name: "الإجماليات" });
    await expect(totals).toContainText(`المبالغ بعملة: ${currency.name} (${currency.code})`);

    // Required.
    let posts = 0;
    page.on("request", (req) => {
      if (req.url() === `${API_URL}/purchase-invoices` && req.method() === "POST") posts += 1;
    });
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("سعر الصرف مطلوب")).toBeVisible();
    expect(posts).toBe(0);

    // Back to the default: the field and the caption go.
    await page.getByLabel("العملة").selectOption(defaultCurrency.id);
    await expect(rate).toHaveCount(0);
    await expect(totals).toContainText("المبالغ بالعملة الأساسية");

    // Again the other currency, with a rate → sent.
    await page.getByLabel("العملة").selectOption(currency.id);
    await page.getByLabel("سعر الصرف").fill("50.5");
    const sent = page.waitForRequest((req) => req.url() === `${API_URL}/purchase-invoices` && req.method() === "POST");
    await page.getByRole("button", { name: "حفظ" }).click();
    const body = (await sent).postDataJSON();
    expect(body.currencyId).toBe(currency.id);
    expect(body.exchangeRate).toBe(50.5);

    await expect(page).toHaveURL(/\/purchase-invoices\/[^/]+$/);
    const info = page.locator("main dl");
    await expect(info).toContainText(`${currency.name} (${currency.code})`);
    await expect(info).toContainText(`1 ${currency.code} = 50.50`);
    await expect(page.getByRole("group", { name: "الإجماليات" })).toContainText(
      `المبالغ بعملة: ${currency.name} (${currency.code})`,
    );

    // Edit: back to the default currency → no exchangeRate in the PATCH.
    await page.getByRole("link", { name: "تعديل", exact: true }).click();
    await expect(page.getByLabel("سعر الصرف")).toHaveValue("50.5");
    await page.getByLabel("العملة").selectOption(defaultCurrency.id);
    await expect(page.getByLabel("سعر الصرف")).toHaveCount(0);
    const patched = page.waitForRequest((req) => req.url().includes("/purchase-invoices/") && req.method() === "PATCH");
    await page.getByRole("button", { name: "حفظ" }).click();
    const patchBody = (await patched).postDataJSON();
    expect(patchBody.currencyId).toBe(defaultCurrency.id);
    expect(patchBody).not.toHaveProperty("exchangeRate");
    await expect(page.getByRole("alert").filter({ hasText: "تم حفظ التعديلات" })).toBeVisible();
    await expect(page.locator("main dl")).not.toContainText("سعر الصرف");
  });

  // ─── 5. Expiry / batch ──────────────────────────────────────────────────────────────────────────────────

  test("expiry: required for the expiry product, batch max 50, + رقم التشغيلة for STOCK only, منتهي الصلاحية still saves", async ({
    page,
  }) => {
    await page.goto("/purchase-invoices/new");
    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await page.getByRole("radio", { name: /نقدي/ }).check();
    await page.getByLabel("الفرع").selectOption(branch.id);
    await page.getByLabel("المخزن").selectOption(warehouseA.id);
    await page.getByLabel("ملاحظات").fill(`${tagText()} صلاحية`);

    // Line 1: the tea → the date (required) and the batch input are shown at once.
    const line1 = lineFields(page, 1);
    await pickSearchOption(page, line1.product, teaProduct.name, new RegExp(teaProduct.name));
    await expect(line1.expiry).toBeVisible();
    await expect(line1.batch).toBeVisible();
    await line1.quantity.fill("6");
    await line1.price.fill("20");

    // Line 2: the brush (STOCK) → "+ رقم التشغيلة"; line 3: the SERVICE product → no batch link.
    await page.getByRole("button", { name: "إضافة بند" }).click();
    const line2 = lineFields(page, 2);
    await pickSearchOption(page, line2.product, brush.name, new RegExp(brush.name));
    await line2.quantity.fill("1");
    await line2.price.fill("10");
    await expect(line2.expiry).toHaveCount(0);
    await expect(line2.batch).toHaveCount(0);
    await page.getByRole("button", { name: "إضافة بند" }).click();
    const line3 = lineFields(page, 3);
    await pickSearchOption(page, line3.product, serviceProduct.name, new RegExp(serviceProduct.name));
    await line3.quantity.fill("1");
    await line3.price.fill("5");
    await expect(page.getByRole("button", { name: "+ رقم التشغيلة" })).toHaveCount(1);
    await page.getByRole("button", { name: "+ رقم التشغيلة" }).click();
    await expect(line2.batch).toBeVisible();
    await line2.batch.fill("BR-1");

    // No date → the Arabic message under the date, nothing sent.
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تاريخ الصلاحية مطلوب لهذا الصنف")).toBeVisible();
    await expect(page).toHaveURL(/\/new$/);

    // Batch: at most 50 characters. A date before the invoice date → amber warning, saving still allowed.
    await line1.batch.fill("B".repeat(60));
    expect((await line1.batch.inputValue()).length).toBe(50);
    await line1.batch.fill("B12");
    await line1.expiry.fill(typedDay(-10));
    await expect(page.getByText("منتهي الصلاحية")).toBeVisible();
    await expect(page.getByText("منتهي الصلاحية")).toHaveClass(/amber/);

    const sent = page.waitForRequest((req) => req.url() === `${API_URL}/purchase-invoices` && req.method() === "POST");
    await page.getByRole("button", { name: "حفظ" }).click();
    const body = (await sent).postDataJSON();
    expect(body.lines).toEqual([
      { productId: teaProduct.id, itemUnitId: piece.id, quantity: 6, unitCost: 20, batchNumber: "B12", expiryDate: day(-10) },
      { productId: brush.id, itemUnitId: piece.id, quantity: 1, unitCost: 10, batchNumber: "BR-1" },
      { productId: serviceProduct.id, itemUnitId: piece.id, quantity: 1, unitCost: 5 },
    ]);

    await expect(page).toHaveURL(/\/purchase-invoices\/[^/]+$/);
    await expect(bodyRows(page).nth(0)).toContainText(`صلاحية ${typedDay(-10)} · تشغيلة B12`);
    await expect(bodyRows(page).nth(1)).toContainText("تشغيلة BR-1");
    await expect(bodyRows(page).nth(2)).toContainText("خدمة — لا تدخل المخزن");
    // Every expiry line has its date → no amber alert, ترحيل enabled.
    await expect(page.getByText(/أدخل تاريخ الصلاحية للبنود/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ترحيل", exact: true })).toBeEnabled();
  });

  // ─── 6. Duplicate supplier bill ─────────────────────────────────────────────────────────────────────────

  test("duplicate supplier bill: warning on blur → saves directly; Enter without blur → رقم فاتورة مكرر dialog", async ({
    page,
    request,
  }) => {
    test.setTimeout(60000);
    const first = await createInvoice(request, { notes: "أصلية 1", supplierInvoiceNumber: `DUP-${tag}` });
    const second = await createInvoice(request, { notes: "أصلية 2", supplierInvoiceNumber: `DUP2-${tag}` });
    const third = await createInvoice(request, { notes: "أصلية 3", supplierInvoiceNumber: `DUP3-${tag}` });

    async function fillInvoice(notes) {
      await page.goto("/purchase-invoices/new");
      await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
      await page.getByRole("radio", { name: /نقدي/ }).check();
      await page.getByLabel("الفرع").selectOption(branch.id);
      await page.getByLabel("المخزن").selectOption(warehouseA.id);
      await page.getByLabel("ملاحظات").fill(`${tagText()} ${notes}`);
      const line = lineFields(page, 1);
      await pickSearchOption(page, line.product, brush.name, new RegExp(brush.name));
      await line.quantity.fill("1");
      await line.price.fill("10");
    }
    const billNumber = page.getByLabel("رقم فاتورة المورد");
    // The amber line under the field (role "status": read out when it appears).
    const warning = (code) =>
      page.getByRole("status").filter({ hasText: `هذا الرقم مسجل بالفعل في الفاتورة ${code} لنفس المورد` });

    // Path 1: the number is checked when the field is left (spaces / letter case ignored) → the amber warning;
    // saving does not ask again.
    await fillInvoice("مكررة 1");
    await billNumber.fill(` dup-${tag} `);
    await billNumber.press("Tab");
    await expect(warning(first.code)).toBeVisible();
    await expect(warning(first.code)).toHaveClass(/amber/);
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).toHaveURL(/\/purchase-invoices\/[^/]+$/);
    await headingCode(page);
    // The DRAFT details warn too (posting a duplicate bill adds the stock twice).
    await expect(page.getByRole("alert").filter({ hasText: `هذا الرقم مسجل بالفعل في الفاتورة ${first.code}` })).toBeVisible();

    // Path 2: Enter in the field (never left) → checked before saving → the question.
    await fillInvoice("مكررة 2");
    let posts = 0;
    page.on("request", (req) => {
      if (req.url() === `${API_URL}/purchase-invoices` && req.method() === "POST") posts += 1;
    });
    await billNumber.fill(`DUP2-${tag}`);
    await billNumber.press("Enter");
    const dialog = page.getByRole("dialog", { name: "رقم فاتورة مكرر" });
    await expect(dialog).toContainText(`هذا الرقم مسجل في الفاتورة ${second.code} لنفس المورد. هل تريد الحفظ على أي حال؟`);
    await expect(dialog.getByRole("button", { name: "حفظ على أي حال" })).toHaveClass(/bg-primary/);
    // رجوع: nothing saved, the warning is now on screen.
    await dialog.getByRole("button", { name: "رجوع" }).click();
    await expect(dialog).toBeHidden();
    await expect(warning(second.code)).toBeVisible();
    expect(posts).toBe(0);

    // Another duplicate number, Enter again → asked again; "حفظ على أي حال" saves.
    await billNumber.fill(`DUP3-${tag}`);
    await billNumber.press("Enter");
    await expect(dialog).toContainText(third.code);
    await dialog.getByRole("button", { name: "حفظ على أي حال" }).click();
    await expect(page).toHaveURL(/\/purchase-invoices\/[^/]+$/);
    await headingCode(page);
    expect(posts).toBe(1);
  });

  // ─── 7. Post ────────────────────────────────────────────────────────────────────────────────────────────

  test("post the brush invoice: confirm names the warehouse → POSTED; cost 11.25; item card + movements link back", async ({
    page,
    request,
  }) => {
    const invoice = await createInvoice(request, { notes: "ترحيل" });
    await page.goto(`/purchase-invoices/${invoice.id}`);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("مسودة");

    await page.getByRole("button", { name: "ترحيل", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "ترحيل الفاتورة" });
    await expect(dialog).toContainText(`سيتم إضافة كميات البنود إلى «${warehouseA.name}» وتحديث متوسط التكلفة.`);
    await expect(dialog.getByRole("button", { name: "ترحيل الفاتورة" })).toHaveClass(/bg-primary/);
    await dialog.getByRole("button", { name: "ترحيل الفاتورة" }).click();

    await expect(heading).toContainText("مُرحّل");
    await expect(page.getByRole("alert").filter({ hasText: "تم ترحيل الفاتورة وإضافة الكميات إلى المخزن" })).toBeVisible();
    await expect(page.getByRole("link", { name: "تعديل", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "حذف", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "إلغاء الفاتورة" })).toBeVisible();
    // 1500 × (1 − 150 / 1500) / 120 pieces = 11.25 a piece, in the default currency.
    const symbol = defaultCurrency.symbol || defaultCurrency.code;
    await expect(bodyRows(page).first()).toContainText(`تكلفة القطعة في المخزن: 11.25 ${symbol}`);
    await expect(page.locator("main dl")).toContainText("رحّلها");
    await expect(page.getByText("لا توجد مرتجعات على هذه الفاتورة")).toBeVisible();

    // كارت الصنف: PURCHASE +120 → 220, average 10.6818, the document number links back here.
    await page.getByRole("link", { name: "كارت الصنف — البند 1" }).click();
    await expect(page).toHaveURL(new RegExp(`/item-card\\?product=${brush.id}&inventory=${warehouseA.id}`));
    const cardRow = bodyRows(page).filter({ hasText: invoice.code });
    await expect(cardRow).toContainText("شراء");
    await expect(cardRow).toContainText("120");
    await expect(cardRow).toContainText("220");
    await expect(cardRow).toContainText("10.6818");
    await cardRow.getByRole("link", { name: invoice.code }).click();
    await expect(page).toHaveURL(new RegExp(`/purchase-invoices/${invoice.id}$`));
    await expect(heading).toContainText("مُرحّل");

    // حركات المخزون: the row's document number links here too.
    await page.goto(`/stock-movements?product=${brush.id}&inventory=${warehouseA.id}`);
    await bodyRows(page).filter({ hasText: invoice.code }).getByRole("link", { name: invoice.code }).click();
    await expect(page).toHaveURL(new RegExp(`/purchase-invoices/${invoice.id}$`));
  });

  // ─── 8. Post blocked by a missing expiry date (converted from a quotation) ─────────────────────────────

  test("convert → lands on the new invoice; missing expiry → alert + ترحيل disabled → edit, add the date → post", async ({
    page,
    request,
  }) => {
    const quotation = await createAcceptedQuotation(request);
    await page.goto(`/purchase-quotations/${quotation.id}`);
    await page.getByRole("button", { name: "تحويل لفاتورة" }).click();
    const modal = page.getByRole("dialog", { name: "تحويل العرض إلى فاتورة شراء" });
    await modal.getByLabel(/نقدي/).check();
    await modal.getByLabel("تاريخ الفاتورة").fill(typedDate(TEST_DOC_DATE)); // it will be posted: 2001
    await modal.getByRole("button", { name: "تحويل لفاتورة" }).click();

    // The new DRAFT invoice opens with the message.
    await expect(page).toHaveURL(/\/purchase-invoices\/[^/]+$/);
    const code = await headingCode(page);
    await expect(
      page.getByRole("alert").filter({ hasText: `تم إنشاء الفاتورة ${code} من عرض السعر ${quotation.code} — راجعها ثم رحّلها` }),
    ).toBeVisible();
    await expect(page.locator("main dl")).toContainText(quotation.code);

    // The tea has no expiry date yet → amber alert, ترحيل disabled with the reason.
    const reason = "أدخل تاريخ الصلاحية للبنود: 1 قبل الترحيل";
    await expect(page.getByRole("alert").filter({ hasText: reason })).toBeVisible();
    await expect(page.getByRole("button", { name: "ترحيل", exact: true })).toBeDisabled();
    await expect(page.locator(`span[title="${reason}"]`)).toHaveCount(1);

    await page.getByRole("link", { name: "تعديل الفاتورة" }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await expect(page.getByRole("link", { name: quotation.code })).toBeVisible(); // "من عرض السعر PQ-…"
    await lineFields(page, 1).expiry.fill(typedDay(365));
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "تم حفظ التعديلات" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: reason })).toHaveCount(0);

    await page.getByRole("button", { name: "ترحيل", exact: true }).click();
    await page.getByRole("dialog", { name: "ترحيل الفاتورة" }).getByRole("button", { name: "ترحيل الفاتورة" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("مُرحّل");

    // The quotation's "الفاتورة الناتجة" is a link to it.
    await page.getByRole("link", { name: quotation.code }).click();
    await expect(page).toHaveURL(new RegExp(`/purchase-quotations/${quotation.id}$`));
    await expect(page.locator("main dl")).toContainText("مُرحّل");
    await page.locator("main dl").getByRole("link", { name: code }).click();
    await expect(page).toHaveURL(/\/purchase-invoices\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(code);
  });

  // ─── 9. Cancel ──────────────────────────────────────────────────────────────────────────────────────────

  test("cancel: رجوع keeps it; confirm → CANCELLED, the item card shows إلغاء فاتورة شراء −120 back to 100", async ({
    page,
    request,
  }) => {
    const invoice = await createInvoice(request, { notes: "إلغاء" });
    await postInvoice(request, invoice.id);
    await page.goto(`/purchase-invoices/${invoice.id}`);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("مُرحّل");

    await page.getByRole("button", { name: "إلغاء الفاتورة" }).click();
    const dialog = page.getByRole("dialog", { name: "إلغاء الفاتورة" });
    await expect(dialog).toContainText(`سيتم سحب كميات الفاتورة من «${warehouseA.name}» (حركة «إلغاء فاتورة شراء» في كارت الصنف).`);
    await expect(dialog.getByRole("button", { name: "إلغاء الفاتورة" })).toHaveClass(/red/);
    await dialog.getByRole("button", { name: "رجوع" }).click();
    await expect(dialog).toBeHidden();
    await expect(heading).toContainText("مُرحّل");

    await page.getByRole("button", { name: "إلغاء الفاتورة" }).click();
    await dialog.getByRole("button", { name: "إلغاء الفاتورة" }).click();
    await expect(heading).toContainText("ملغي");
    await expect(page.getByRole("alert").filter({ hasText: "تم إلغاء الفاتورة وسحب كمياتها من المخزن" })).toBeVisible();
    await expect(page.getByRole("button", { name: "إلغاء الفاتورة" })).toHaveCount(0);
    await expect(page.locator("main dl")).toContainText("ألغاها");

    await page.getByRole("link", { name: "كارت الصنف — البند 1" }).click();
    const cancelRow = bodyRows(page).filter({ hasText: "إلغاء فاتورة شراء" });
    await expect(cancelRow).toContainText(invoice.code);
    await expect(cancelRow).toContainText("120");
    await expect(bodyRows(page).last()).toContainText("إلغاء فاتورة شراء");
    await expect(bodyRows(page).last().getByRole("cell").nth(5)).toHaveText("100");
  });

  // ─── 10. Cancel refused ─────────────────────────────────────────────────────────────────────────────────

  test.describe("expected API errors", () => {
    test.use({ allowedConsoleErrors: [/status of (400|404)/] });

    test("cancel refused when part of the goods was used → INSUFFICIENT_STOCK message, still POSTED", async ({
      page,
      request,
    }) => {
      const invoice = await createInvoice(request, { notes: "مستهلكة" });
      await postInvoice(request, invoice.id);
      // 220 pieces now; use most of them (تسوية) → only 50 left, the invoice brought 120.
      await callApi(request, "PATCH", `/product-inventory/${brushStock.id}`, { quantity: 50, reason: "جرد" });

      await page.goto(`/purchase-invoices/${invoice.id}`);
      await page.getByRole("button", { name: "إلغاء الفاتورة" }).click();
      await page.getByRole("dialog", { name: "إلغاء الفاتورة" }).getByRole("button", { name: "إلغاء الفاتورة" }).click();
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "البند رقم 1: الكمية المتاحة في المخزن غير كافية — تم صرف جزء من بضاعة هذه الفاتورة، لذلك لا يمكن إلغاؤها" }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("مُرحّل");
      await expect(bodyRows(page).first()).toHaveClass(/bg-red-50/);

      // Stock back for the cleanup (afterEach cancels it).
      await callApi(request, "PATCH", `/product-inventory/${brushStock.id}`, { quantity: 220, reason: "جرد" });
    });

    // ─── 11. Delete a converted draft ───────────────────────────────────────────────────────────────────

    test("delete a converted DRAFT: the confirm names the quotation that stays converted → list message", async ({
      page,
      request,
    }) => {
      const quotation = await createAcceptedQuotation(request);
      const { invoice } = await callApi(request, "POST", `/purchase-quotations/${quotation.id}/convert-to-invoice`, {
        paymentType: "CASH",
        invoiceDate: TEST_DOC_DATE,
      });
      await page.goto(`/purchase-invoices/${invoice.id}`);
      await page.getByRole("button", { name: "حذف", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "حذف الفاتورة" });
      await expect(dialog).toContainText(`هل أنت متأكد من حذف فاتورة الشراء ${invoice.code}؟`);
      await expect(dialog).toContainText(
        `عرض السعر ${quotation.code} سيبقى بحالة «تم التحويل لفاتورة» ولن يمكن تحويله مرة أخرى.`,
      );
      await dialog.getByRole("button", { name: "حذف الفاتورة" }).click();
      await expect(page).toHaveURL(/\/purchase-invoices$/);
      await expect(page.getByRole("alert").filter({ hasText: `تم حذف فاتورة الشراء ${invoice.code}` })).toBeVisible();

      // The quotation still says CONVERTED, its invoice is gone.
      await page.goto(`/purchase-quotations/${quotation.id}`);
      await expect(page.locator("main dl")).toContainText("الفاتورة محذوفة");
    });

    // ─── 12. Edit ───────────────────────────────────────────────────────────────────────────────────────

    test("edit a DRAFT: full lines, both discounts, emptied fields → null; POSTED edit URL → message; unknown id", async ({
      page,
      request,
    }) => {
      const invoice = await createInvoice(request, {
        notes: "تعديل",
        supplierInvoiceNumber: `OLD-${tag}`,
        dueDate: addDays(TEST_DOC_DATE, 10),
        lines: [{ productId: brush.id, itemUnitId: carton.id, quantity: 1, unitCost: 150 }],
      });
      await page.goto(`/purchase-invoices/${invoice.id}/edit`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(`تعديل فاتورة الشراء ${invoice.code}`);
      await expect(page.getByLabel("رقم فاتورة المورد")).toHaveValue(`OLD-${tag}`);
      await expect(page.getByRole("radio", { name: /آجل/ })).toBeChecked();
      await expect(page.getByLabel("تاريخ الاستحقاق")).toHaveValue(typedDate(addDays(TEST_DOC_DATE, 10)));
      await expect(page.getByLabel("نسبة الخصم %")).toHaveValue("10");

      await page.getByLabel("رقم فاتورة المورد").fill("");
      await page.getByRole("radio", { name: /نقدي/ }).check();
      await lineFields(page, 1).quantity.fill("2");
      await page.getByRole("button", { name: "إضافة بند" }).click();
      const line2 = lineFields(page, 2);
      await pickSearchOption(page, line2.product, serviceProduct.name, new RegExp(serviceProduct.name));
      await line2.quantity.fill("1");
      await line2.price.fill("50");
      await page.getByRole("radiogroup", { name: "نوع الخصم" }).getByRole("radio", { name: "مبلغ" }).click();
      await page.getByLabel("قيمة الخصم").fill("30");

      const patched = page.waitForRequest((req) => req.url() === `${API_URL}/purchase-invoices/${invoice.id}` && req.method() === "PATCH");
      await page.getByRole("button", { name: "حفظ" }).click();
      const body = (await patched).postDataJSON();
      expect(body).toMatchObject({
        paymentType: "CASH",
        supplierInvoiceNumber: null,
        dueDate: null,
        discountPercent: 0,
        discountValue: 30,
        taxPercent: 14,
        currencyId: defaultCurrency.id,
      });
      expect(body).not.toHaveProperty("paidAmount");
      expect(body.notes).toContain(tagText());
      expect(body.lines).toEqual([
        { productId: brush.id, itemUnitId: carton.id, quantity: 2, unitCost: 150 },
        { productId: serviceProduct.id, itemUnitId: piece.id, quantity: 1, unitCost: 50 },
      ]);

      // 300 + 50 = 350 − 30 = 320 + 14% (44.80) = 364.80, paid in full.
      await expect(page).toHaveURL(new RegExp(`/purchase-invoices/${invoice.id}$`));
      const totals = page.getByRole("group", { name: "الإجماليات" });
      await expect(totals).toContainText(/الصافي\s*364.80/);
      await expect(totals).toContainText(/المتبقي\s*0.00/);
      await expect(bodyRows(page)).toHaveCount(2);

      // A POSTED invoice's edit URL → not editable + details link.
      await postInvoice(request, invoice.id);
      await page.goto(`/purchase-invoices/${invoice.id}/edit`);
      await expect(page.getByText("لا يمكن تعديل هذه الفاتورة لأن حالتها «مُرحّل»")).toBeVisible();
      await page.getByRole("link", { name: "عرض التفاصيل" }).click();
      await expect(page).toHaveURL(new RegExp(`/purchase-invoices/${invoice.id}$`));

      for (const path of ["/purchase-invoices/no-such-id", "/purchase-invoices/no-such-id/edit"]) {
        await page.goto(path);
        await expect(page.getByText("فاتورة الشراء غير موجودة أو محذوفة")).toBeVisible();
        await expect(page.getByRole("link", { name: "العودة إلى فواتير الشراء" })).toBeVisible();
      }
    });
  });
});

// ─── Mocked API ───────────────────────────────────────────────────────────────────────────────────────────

const SUPPLIER = { id: "s1", code: "SUP-000001", name: "النيل" };
const BRANCH = { id: "b1", code: "branch-000001", name: "فرع المعادي" };
const WAREHOUSE = { id: "w1", name: "مخزن المعادي", branchId: "b1" };
const EGP = { id: "c1", code: "EGP", name: "جنيه مصري", symbol: "ج.م", isDefault: true };

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

function invoiceItem(n, overrides = {}) {
  return {
    id: `i${n}`,
    code: `PI-2026-${String(n).padStart(6, "0")}`,
    supplierInvoiceNumber: null,
    invoiceDate: "2026-11-20T00:00:00.000Z",
    dueDate: null,
    paymentType: "CREDIT",
    status: "DRAFT",
    supplierId: SUPPLIER.id,
    branchId: BRANCH.id,
    warehouseId: WAREHOUSE.id,
    currencyId: EGP.id,
    exchangeRate: "1",
    subTotal: "1500",
    discountPercent: "10",
    discountValue: "150",
    taxPercent: "14",
    taxValue: "189",
    netTotal: "1539",
    paidAmount: "500",
    remainingAmount: "1039",
    notes: null,
    createdDate: "2026-11-20T10:00:00.000Z",
    modifiedDate: "2026-11-20T10:00:00.000Z",
    postedDate: null,
    cancelledDate: null,
    supplier: SUPPLIER,
    branch: BRANCH,
    warehouse: { id: WAREHOUSE.id, name: WAREHOUSE.name },
    currency: EGP,
    _count: { lines: 1 },
    createdByUser: { id: "u1", username: "admin" },
    modifiedByUser: null,
    postedByUser: null,
    cancelledByUser: null,
    convertedFromQuotation: null,
    purchaseReturns: [],
    lines: [
      {
        id: "l1",
        productId: "p1",
        itemUnitId: "u-carton",
        unitFactor: "12",
        quantity: "10",
        baseQuantity: "120",
        unitCost: "150",
        discountPercent: null,
        discountValue: null,
        lineTotal: "1500",
        stockUnitCost: "0",
        batchNumber: null,
        expiryDate: null,
        notes: null,
        product: { id: "p1", code: "PRD-000001", name: "فرشة", itemType: "STOCK", hasExpiryDate: false },
        itemUnit: { id: "u-carton", code: "unit-1", name: "كرتونة" },
      },
    ],
    ...overrides,
  };
}

function page1(items, total = items.length, page = 1) {
  return { items, meta: { page, pageSize: 20, total, totalPages: Math.ceil(total / 20) } };
}

const PRODUCTS = [
  {
    id: "p1",
    code: "PRD-000001",
    name: "فرشة",
    itemType: "STOCK",
    hasExpiryDate: false,
    barcode: null,
    primaryItemUnitId: "u-piece",
    primaryItemUnit: { id: "u-piece", name: "قطعة" },
  },
];

// The lists every invoice page reads.
async function mockLists(page) {
  await page.route(`${API_URL}/supplier`, (route) => route.fulfill(ok([SUPPLIER])));
  await page.route(`${API_URL}/branch`, (route) => route.fulfill(ok([BRANCH])));
  await page.route(`${API_URL}/inventory`, (route) => route.fulfill(ok([WAREHOUSE])));
  await page.route(`${API_URL}/currency`, (route) => route.fulfill(ok([EGP])));
  await page.route(`${API_URL}/products`, (route) => route.fulfill(ok(PRODUCTS)));
}

test.describe("mocked API", () => {
  test.beforeEach(async ({ page }) => {
    await setFakeSession(page);
    await mockLists(page);
  });

  test("empty list: لا توجد فواتير شراء بعد + فاتورة شراء جديدة", async ({ page }) => {
    await page.route(`${API_URL}/purchase-invoices?*`, (route) => route.fulfill(ok(page1([]))));
    await page.goto("/purchase-invoices");
    await expect(page.getByText("لا توجد فواتير شراء بعد")).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "فاتورة شراء جديدة" })).toHaveCount(2);
  });

  test.describe("list error", () => {
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("error + retry", async ({ page }) => {
      // Fails until the retry (dev StrictMode loads twice on the first render).
      let failing = true;
      await page.route(`${API_URL}/purchase-invoices?*`, (route) =>
        route.fulfill(failing ? fail(500, "INTERNAL_ERROR") : ok(page1([invoiceItem(1)]))),
      );
      await page.goto("/purchase-invoices");
      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();
      failing = false;
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();
      await expect(bodyRows(page)).toHaveCount(1);
    });
  });

  test("filtered empty: لا توجد فواتير شراء تطابق الفلاتر + مسح الفلاتر", async ({ page }) => {
    await page.route(`${API_URL}/purchase-invoices?*`, (route) => {
      const filtered = new URL(route.request().url()).searchParams.has("paymentType");
      return route.fulfill(ok(page1(filtered ? [] : [invoiceItem(1)])));
    });
    await page.goto("/purchase-invoices");
    await expect(bodyRows(page)).toHaveCount(1);
    await page.getByLabel("طريقة الدفع").selectOption("CASH");
    await expect(page.getByText("لا توجد فواتير شراء تطابق الفلاتر")).toBeVisible();
    await page.getByRole("main").getByRole("button", { name: "مسح الفلاتر" }).last().click();
    await expect(bodyRows(page)).toHaveCount(1);
  });

  test("pagination: total 45 → صفحة 1 من 3; التالي asks for page=2", async ({ page }) => {
    await page.route(`${API_URL}/purchase-invoices?*`, (route) => {
      const requested = Number(new URL(route.request().url()).searchParams.get("page"));
      const items = Array.from({ length: 20 }, (_, i) => invoiceItem((requested - 1) * 20 + i + 1));
      return route.fulfill(ok(page1(items, 45, requested)));
    });
    await page.goto("/purchase-invoices");
    await expect(page.getByText("صفحة 1 من 3")).toBeVisible();
    const next = page.waitForRequest((req) => req.url().includes("/purchase-invoices?") && req.url().includes("page=2"));
    await page.getByRole("button", { name: "التالي" }).click();
    await next;
    await expect(page.getByText("صفحة 2 من 3")).toBeVisible();
    await expect(bodyRows(page).first()).toContainText("PI-2026-000021");
  });

  test("a POSTED return blocks the cancel: إلغاء الفاتورة disabled with the reason; the returns table", async ({
    page,
  }) => {
    const purchaseReturns = [
      { id: "r1", code: "PR-2026-000001", returnDate: "2026-11-22T00:00:00.000Z", status: "POSTED", netTotal: "273.60" },
      { id: "r2", code: "PR-2026-000002", returnDate: "2026-11-23T00:00:00.000Z", status: "CANCELLED", netTotal: "100" },
    ];
    await page.route(`${API_URL}/purchase-invoices/i1`, (route) =>
      route.fulfill(ok(invoiceItem(1, { status: "POSTED", purchaseReturns }))),
    );
    await page.goto("/purchase-invoices/i1");
    const cancel = page.getByRole("button", { name: "إلغاء الفاتورة" });
    await expect(cancel).toBeDisabled();
    await expect(page.locator('span[title="عليها مرتجع مُرحّل، ألغِ المرتجع أولًا"]')).toHaveCount(1);
    const returns = page.locator("section", { has: page.getByRole("heading", { name: "المرتجعات" }) });
    await expect(returns.locator("tbody tr")).toHaveCount(2);
    await expect(returns.locator("tbody tr").first()).toContainText("PR-2026-000001");
    await expect(returns.locator("tbody tr").first()).toContainText("مُرحّل");
    await expect(returns.locator("tbody tr").first()).toContainText("273.60");
    // Plain text for now (purchase returns: Prompt 20).
    await expect(returns.getByRole("link")).toHaveCount(0);
  });

  test.describe("action errors", () => {
    // One regex: an array of two would be read by Playwright as [value, fixture options].
    test.use({ allowedConsoleErrors: [/status of (409|400)/] });

    test("cancel 400 BAD_REQUEST status → لا يمكن إلغاء الفاتورة لأن عليها مرتجع مُرحّل", async ({ page }) => {
      await page.route(`${API_URL}/purchase-invoices/i1`, (route) => route.fulfill(ok(invoiceItem(1, { status: "POSTED" }))));
      await page.route(`${API_URL}/purchase-invoices/i1/cancel`, (route) => route.fulfill(fail(400, "BAD_REQUEST", "status")));
      await page.goto("/purchase-invoices/i1");
      await page.getByRole("button", { name: "إلغاء الفاتورة" }).click();
      await page.getByRole("dialog", { name: "إلغاء الفاتورة" }).getByRole("button", { name: "إلغاء الفاتورة" }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: "لا يمكن إلغاء الفاتورة لأن عليها مرتجع مُرحّل، ألغِ المرتجع أولًا" }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("مُرحّل");
    });

    test("409 INVALID_STATUS on ترحيل → Arabic message + refresh (the buttons follow the real status)", async ({
      page,
    }) => {
      // DRAFT on screen; someone else posted it meanwhile → after the 409 the refresh reads POSTED.
      let changedElsewhere = false;
      await page.route(`${API_URL}/purchase-invoices/i1`, (route) =>
        route.fulfill(ok(invoiceItem(1, { status: changedElsewhere ? "POSTED" : "DRAFT" }))),
      );
      await page.route(`${API_URL}/purchase-invoices/i1/post`, (route) => {
        changedElsewhere = true;
        return route.fulfill(fail(409, "INVALID_STATUS", "status"));
      });
      await page.goto("/purchase-invoices/i1");
      await page.getByRole("button", { name: "ترحيل", exact: true }).click();
      await page.getByRole("dialog", { name: "ترحيل الفاتورة" }).getByRole("button", { name: "ترحيل الفاتورة" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "لا يمكن تنفيذ العملية في حالة المستند الحالية" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("مُرحّل");
      await expect(page.getByRole("button", { name: "إلغاء الفاتورة" })).toBeVisible();
    });

    test("post 400 on a missing expiry date → the line message + عدّل الفاتورة لإضافته, row marked", async ({ page }) => {
      await page.route(`${API_URL}/purchase-invoices/i1`, (route) => route.fulfill(ok(invoiceItem(1))));
      await page.route(`${API_URL}/purchase-invoices/i1/post`, (route) =>
        route.fulfill(fail(400, "VALIDATION_FAILED", "lines.0.expiryDate")),
      );
      await page.goto("/purchase-invoices/i1");
      await page.getByRole("button", { name: "ترحيل", exact: true }).click();
      await page.getByRole("dialog", { name: "ترحيل الفاتورة" }).getByRole("button", { name: "ترحيل الفاتورة" }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: "البند رقم 1: تاريخ الصلاحية مطلوب لهذا الصنف — عدّل الفاتورة لإضافته" }),
      ).toBeVisible();
      await expect(bodyRows(page).first()).toHaveClass(/bg-red-50/);
    });
  });

  test.describe("font كبير at 1280×720", () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test("details and form stay usable: actions, totals, the expiry date and the delete button visible", async ({
      page,
    }) => {
      await page.evaluate(([key]) => localStorage.setItem(key, "large"), [FONT_SIZE_KEY]);
      const tea = {
        id: "p2",
        code: "PRD-000002",
        name: "شاي باسم طويل نسبيًا للتجربة",
        itemType: "STOCK",
        hasExpiryDate: true,
        barcode: null,
        primaryItemUnitId: "u-piece",
        primaryItemUnit: { id: "u-piece", name: "قطعة" },
      };
      await page.route(`${API_URL}/products`, (route) => route.fulfill(ok([...PRODUCTS, tea])));
      await page.route(`${API_URL}/products/*/units`, (route) =>
        route.fulfill(
          ok([
            { id: null, isPrimary: true, itemUnitId: "u-piece", itemUnit: { id: "u-piece", name: "قطعة" }, factor: "1" },
            { id: "pu1", isPrimary: false, itemUnitId: "u-carton", itemUnit: { id: "u-carton", name: "كرتونة" }, factor: "12" },
          ]),
        ),
      );
      await page.route(`${API_URL}/purchase-invoices/i1`, (route) =>
        route.fulfill(ok(invoiceItem(1, { status: "POSTED", postedByUser: { id: "u1", username: "admin" } }))),
      );

      // Details: the action button, the lines and the totals.
      await page.goto("/purchase-invoices/i1");
      await expect(bodyRows(page)).toHaveCount(1);
      await expect(page.getByRole("button", { name: "إلغاء الفاتورة" })).toBeInViewport();
      await expect(page.getByRole("group", { name: "الإجماليات" })).toContainText("1,539.00");
      // The sticky actions column keeps the row button on screen while the wide table scrolls.
      const cardLink = page.getByRole("link", { name: "كارت الصنف — البند 1" });
      await cardLink.scrollIntoViewIfNeeded();
      await expect(cardLink).toBeInViewport({ ratio: 1 });

      // Form: a line with the expiry product; the date input and the delete button are on screen.
      await page.goto("/purchase-invoices/new");
      const line = lineFields(page, 1);
      await pickSearchOption(page, line.product, "شاي", /شاي/);
      await line.unit.selectOption("u-carton");
      await line.quantity.fill("3");
      await expect(page.getByText("= 36 قطعة")).toBeVisible();
      await line.expiry.scrollIntoViewIfNeeded();
      await expect(line.expiry).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("button", { name: "حذف البند رقم 1" })).toBeInViewport({ ratio: 1 });
    });
  });
});
