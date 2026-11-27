// Purchase returns (مرتجعات الشراء): list, new / edit form (two kinds: من فاتورة شراء / بدون فاتورة), details +
// post / cancel / delete, the stock they move (item card links), the links invoice ↔ return.
// Docs: ../backend/doc/week2/purchase-returns.txt + week2flow.txt (§5 steps 11–14, §6.3, §7.2, §9).
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down. beforeEach creates, with a
// unique tag: a supplier, a branch with ONE warehouse, item units (piece, carton), the brush (STOCK, carton = 12
// pieces, opening stock 100 @ 10 — the week2flow example) and a SERVICE product. Tests that need it create a POSTED
// invoice through the API (10 cartons × 150, 10% + 14% → 220 brushes @ 10.6818).
// Every invoice / return that may end POSTED or CANCELLED (never deletable) is dated 2001 (TEST_DOC_DATE): its own
// PI-2001-… / PR-2001-… numbers, sorted to the end of the lists. Every test document's notes contain "e2e-<tag>".
// afterEach (returns have no ?search=: found by the test's own supplier): POSTED returns are cancelled (they stay
// CANCELLED, allowed by the leftover check in global-setup.js), DRAFT returns deleted; then the invoices the same
// way; then the setup records.
//
// "mocked API" tests fake the endpoints with page.route: empty / error / pagination, an invoice whose lines are all
// returned, a 400 / 409 on post, font كبير at 1280×720.
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

const RETURN_CODE = /PR-\d{4}-\d{6}/;
// The details page of a saved return (never /purchase-returns/new).
const SAVED_URL = /\/purchase-returns\/(?!new$)[^/?]+$/;
const FONT_SIZE_KEY = "ui.fontSize";
// The return date of every test return: a few days after the test invoice (TEST_DOC_DATE).
const RETURN_DAY = addDays(TEST_DOC_DATE, 5);

test.use({ timezoneId: "Africa/Cairo" });

function bodyRows(page) {
  return page.locator("main table tbody tr");
}

// Chooses an option of a SearchSelect (combobox) by typing.
async function pickSearchOption(page, combobox, text, optionName) {
  await combobox.fill(text);
  await page.getByRole("listbox").getByRole("option", { name: optionName }).click();
}

// No sideways scroll of the first table in <main> at 1366×768 and 1280×720 (font متوسط).
async function expectTableFits(page, selector = "main table") {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    const box = page.locator(selector).first().locator("xpath=..");
    await expect.poll(() => box.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  }
}

test.describe("with backend", () => {
  let token;
  let tag;
  let session;
  let supplier;
  let branch;
  let warehouse;
  let piece;
  let carton;
  let brush;
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
    const category = await createByApi(request, token, "/categories", { name: `تصنيف مرتجعات ${tag} ${randomTag()}` });
    return createByApi(request, token, "/products", {
      categoryId: category.id,
      primaryItemUnitId: piece.id,
      retailPrice: 20,
      wholesalePrice: 18,
      bulkWholesalePrice: 16,
      ...body,
    });
  }

  // A POSTED invoice (2001, default currency): the brush, 10 cartons × 150, 10% + 14% → net 1,539.00.
  // Posting adds 120 brushes to the warehouse: 220 @ 10.6818.
  async function createPostedInvoice(request, overrides = {}) {
    const invoice = await createByApi(request, token, "/purchase-invoices", {
      invoiceDate: TEST_DOC_DATE,
      paymentType: "CREDIT",
      supplierId: supplier.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      currencyId: defaultCurrency.id,
      discountPercent: 10,
      discountValue: 0,
      taxPercent: 14,
      lines: [{ productId: brush.id, itemUnitId: carton.id, quantity: 10, unitCost: 150 }],
      ...overrides,
      notes: `${tagText()} فاتورة`,
    });
    return callApi(request, "POST", `/purchase-invoices/${invoice.id}/post`);
  }

  // A return through the API (notes always carry the tag), dated RETURN_DAY unless given.
  async function createReturn(request, body) {
    return createByApi(request, token, "/purchase-returns", {
      returnDate: RETURN_DAY,
      ...body,
      notes: `${tagText()} ${body.notes ?? "مرتجع"}`,
    });
  }

  // A linked return of `quantity` cartons of the invoice's first line.
  async function createLinkedReturn(request, invoice, quantity, extra = {}) {
    return createReturn(request, {
      purchaseInvoiceId: invoice.id,
      lines: [{ purchaseInvoiceLineId: invoice.lines[0].id, quantity }],
      ...extra,
    });
  }

  async function postReturn(request, id) {
    return callApi(request, "POST", `/purchase-returns/${id}/post`);
  }

  async function itemCard(request, productId = brush.id) {
    return callApi(request, "GET", `/stock-movements/item-card?productId=${productId}&warehouseId=${warehouse.id}`);
  }

  async function ownReturns(request) {
    if (!supplier) return [];
    const response = await request.get(`${API_URL}/purchase-returns`, {
      headers: headers(),
      params: { supplierId: supplier.id, pageSize: 100 },
    });
    return (await response.json()).data?.items ?? [];
  }

  async function taggedInvoices(request) {
    const response = await request.get(`${API_URL}/purchase-invoices`, {
      headers: headers(),
      params: { search: tagText(), pageSize: 100 },
    });
    return (await response.json()).data?.items ?? [];
  }

  // A posted test document whose goods were partly used can't be cancelled: raise the warehouse stock first.
  async function cancelForCleanup(request, path, document) {
    const cancel = () => request.post(`${API_URL}${path}/${document.id}/cancel`, { headers: headers() });
    if ((await cancel()).ok()) return;
    const stockResponse = await request.get(`${API_URL}/product-inventory/inventory/${document.warehouseId}`, {
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

    supplier = await createByApi(request, token, "/supplier", { name: `مورد مرتجعات ${tag}` });
    branch = await createByApi(request, token, "/branch", { name: `فرع مرتجعات ${tag}` });
    warehouse = await createByApi(request, token, `/inventory/branch/${branch.id}`, {
      name: `مخزن مرتجعات ${tag}`,
      address: "عنوان المخزن",
    });
    piece = await createByApi(request, token, "/item-unit", { name: `قطعة ${tag}` });
    carton = await createByApi(request, token, "/item-unit", { name: `كرتونة ${tag}` });
    brush = await createProduct(request, { name: `فرشة مرتجعات ${tag}` });
    await createByApi(request, token, `/products/${brush.id}/units`, { itemUnitId: carton.id, factor: 12 });
    await createByApi(request, token, `/product-inventory/inventory/${warehouse.id}`, {
      productId: brush.id,
      quantity: 100,
      costPrice: 10,
    });
    serviceProduct = await createProduct(request, { name: `خدمة مرتجعات ${tag}`, itemType: "SERVICE" });

    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;
    // Returns: POSTED → cancelled (they stay, CANCELLED); DRAFT → deleted.
    for (const item of await ownReturns(request)) {
      if (item.status === "POSTED") await cancelForCleanup(request, "/purchase-returns", item);
      if (item.status === "DRAFT") await request.delete(`${API_URL}/purchase-returns/${item.id}`, { headers: headers() });
    }
    // Invoices: the same (no POSTED return blocks the cancel any more).
    for (const invoice of await taggedInvoices(request)) {
      if (invoice.status === "POSTED") await cancelForCleanup(request, "/purchase-invoices", invoice);
      if (invoice.status === "DRAFT") {
        await request.delete(`${API_URL}/purchase-invoices/${invoice.id}`, { headers: headers() });
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

  test("list: Sidebar link, filters (supplier, status, plain dates), ?invoice= chip, columns, fits the screen", async ({
    page,
    request,
  }) => {
    const invoice = await createPostedInvoice(request);
    // A: linked, POSTED (2 cartons). B: not linked, DRAFT, 10 days later, refund 50.
    const linked = await createLinkedReturn(request, invoice, 2, { notes: "مربوط" });
    await postReturn(request, linked.id);
    const free = await createReturn(request, {
      notes: "بدون فاتورة",
      returnDate: addDays(TEST_DOC_DATE, 10),
      supplierId: supplier.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      discountPercent: 0,
      discountValue: 0,
      taxPercent: 0,
      refundAmount: 50,
      lines: [{ productId: brush.id, itemUnitId: piece.id, quantity: 10, unitCost: 10 }],
    });

    await page.goto("/");
    const nav = page.getByRole("navigation");
    // After فواتير الشراء in the المشتريات group.
    await expect(nav.getByRole("link")).toContainText(["عروض أسعار الشراء", "فواتير الشراء", "مرتجعات الشراء"]);
    await nav.getByRole("link", { name: "مرتجعات الشراء" }).click();
    await expect(page).toHaveURL(/\/purchase-returns$/);
    await expect(page.getByRole("heading", { name: "مرتجعات الشراء" })).toBeVisible();
    await expect(page.getByText("البضاعة المرتجعة للموردين — الترحيل يُخرج الكميات من المخزن")).toBeVisible();
    // No search box: the API has none.
    await expect(page.getByRole("searchbox")).toHaveCount(0);

    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await expect(bodyRows(page)).toHaveCount(2);
    // Newest returnDate first: B (day +10), then A (day +5).
    await expect(bodyRows(page).nth(0)).toContainText(free.code);
    await expect(bodyRows(page).nth(1)).toContainText(linked.code);

    const linkedRow = bodyRows(page).nth(1);
    await expect(linkedRow).toContainText("عدد البنود: 1");
    await expect(linkedRow).toContainText(supplier.name);
    await expect(linkedRow.getByRole("link", { name: invoice.code })).toHaveAttribute("href", `/purchase-invoices/${invoice.id}`);
    await expect(linkedRow).toContainText(warehouse.name);
    await expect(linkedRow).toContainText("307.80");
    await expect(linkedRow).toContainText("مُرحّل");
    // A POSTED return can't be edited: disabled with the reason.
    await expect(page.getByRole("button", { name: `تعديل ${linked.code}` })).toBeDisabled();
    await expect(page.locator('span[title="لا يمكن تعديل مرتجع حالته «مُرحّل»"]')).toHaveCount(1);
    const freeRow = bodyRows(page).nth(0);
    await expect(freeRow).toContainText("بدون فاتورة");
    await expect(freeRow).toContainText("100.00");
    await expect(freeRow).toContainText("مسترد 50.00");
    await expect(freeRow).toContainText("مسودة");
    await expect(page.getByRole("link", { name: `تعديل ${free.code}` })).toHaveAttribute("href", `/purchase-returns/${free.id}/edit`);

    await page.getByLabel("الحالة").selectOption("POSTED");
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page).first()).toContainText(linked.code);
    await page.getByLabel("الحالة").selectOption("");
    await expect(bodyRows(page)).toHaveCount(2);

    // Dates: a DATE-ONLY column → the plain "YYYY-MM-DD" in the request.
    const from = addDays(TEST_DOC_DATE, 8);
    const to = addDays(TEST_DOC_DATE, 12);
    const dated = page.waitForRequest(
      (req) =>
        req.url().includes("/purchase-returns?") &&
        req.url().includes(`dateFrom=${from}`) &&
        req.url().includes(`dateTo=${to}`),
    );
    await page.getByLabel("من تاريخ").fill(typedDate(from));
    await page.getByLabel("إلى تاريخ").fill(typedDate(to));
    await dated;
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page).first()).toContainText(free.code);

    await page.getByRole("button", { name: "مسح الفلاتر" }).click();
    await expect(page.getByRole("combobox", { name: "المورد" })).toHaveValue("كل الموردين");
    await expect(page.getByRole("button", { name: "مسح الفلاتر" })).toBeHidden();

    // No sideways scroll at 1366×768 and 1280×720 (font متوسط).
    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await expect(bodyRows(page)).toHaveCount(2);
    await expectTableFits(page);

    // ?invoice=<id>: only that invoice's returns, a chip "فاتورة PI-…"; ✕ removes it (and the query string).
    await page.setViewportSize({ width: 1366, height: 768 });
    const invoiceFiltered = page.waitForRequest((req) => req.url().includes(`purchaseInvoiceId=${invoice.id}`));
    await page.goto(`/purchase-returns?invoice=${invoice.id}`);
    await invoiceFiltered;
    await expect(page.getByText(`فاتورة ${invoice.code}`)).toBeVisible();
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page).first()).toContainText(linked.code);
    await page.getByRole("button", { name: "إزالة فلتر الفاتورة" }).click();
    await expect(page).toHaveURL(/\/purchase-returns$/);
    await expect(page.getByText(`فاتورة ${invoice.code}`)).toHaveCount(0);
    // "مسح الفلاتر" drops it too.
    await page.goto(`/purchase-returns?invoice=${invoice.id}`);
    await expect(page.getByText(`فاتورة ${invoice.code}`)).toBeVisible();
    await page.getByRole("button", { name: "مسح الفلاتر" }).click();
    await expect(page.getByText(`فاتورة ${invoice.code}`)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "مسح الفلاتر" })).toBeHidden();
  });

  // ─── 2. Linked: from the invoice ──────────────────────────────────────────────────────────────────────────

  test("from the invoice: عمل مرتجع → kind + invoice locked; متاح 10, الكل, = 24 قطعة; preview 307.80; body; server values", async ({
    page,
    request,
  }) => {
    const invoice = await createPostedInvoice(request);
    await page.goto(`/purchase-invoices/${invoice.id}`);
    await page.getByRole("link", { name: "عمل مرتجع" }).click();
    await expect(page).toHaveURL(new RegExp(`/purchase-returns/new\\?invoice=${invoice.id}$`));
    await expect(page.getByRole("heading", { name: "مرتجع شراء جديد" })).toBeVisible();

    // Kind + invoice fixed: no radio cards, no invoice picker.
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByText("من فاتورة شراء", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "فاتورة الشراء" })).toHaveCount(0);
    await expect(page.locator("main").getByRole("link", { name: invoice.code })).toHaveAttribute(
      "href",
      `/purchase-invoices/${invoice.id}`,
    );
    // From the invoice (read only).
    const fromInvoice = page.locator("main dl").first();
    await expect(fromInvoice).toContainText(branch.name);
    await expect(fromInvoice).toContainText(warehouse.name);
    await expect(fromInvoice).toContainText("15 يناير 2001");
    await expect(fromInvoice).toContainText(`(${defaultCurrency.code})`);
    await expect(fromInvoice).toContainText("10%");
    await expect(fromInvoice).toContainText("14%");

    const row = bodyRows(page).first();
    await expect(row).toContainText("متاح للإرجاع 10");
    await expect(row).toContainText("اشتريت 10");
    await expect(row).not.toContainText("مرتجع سابقًا");
    await expect(row).toContainText(`12 قطعة ${tag}`);
    // The price after the invoice line discount (none here): 1500 / 10.
    await expect(row).toContainText("150.00");
    // The stock of the invoice's warehouse now (100 + 120 posted), with the average cost.
    await expect(row).toContainText(`المتاح في المخزن: 220 قطعة ${tag} · متوسط التكلفة 10.6818`);

    const quantity = page.getByLabel("كمية المرتجع — البند 1");
    await page.getByRole("button", { name: "الكل — البند 1" }).click();
    await expect(quantity).toHaveValue("10");
    await quantity.fill("2");
    await expect(row).toContainText(`= 24 قطعة ${tag}`);
    await expect(row).toContainText("300.00");

    // Preview: the invoice's discount SHARE (300 × 150 / 1500 = 30) and its tax (14% of 270 = 37.80).
    const totals = page.getByRole("group", { name: "الإجماليات" });
    await expect(totals).toContainText(/الإجمالي\s*300.00/);
    await expect(totals).toContainText(/الخصم \(10%\)\s*من الفاتورة\s*30.00/);
    await expect(totals).toContainText(/الضريبة \(14%\)\s*من الفاتورة\s*37.80/);
    await expect(totals).toContainText(/الصافي\s*307.80/);
    await expect(totals).toContainText("معاينة");
    await expect(totals.getByLabel("المبلغ المسترد نقدًا")).toHaveValue("0");
    await expect(totals).toContainText("اتركه 0 لو سيُخصم المرتجع من حساب المورد");
    // No discount / tax inputs: they come from the invoice.
    await expect(totals.getByLabel("نسبة الخصم %")).toHaveCount(0);

    await page.getByLabel("تاريخ المرتجع").fill(typedDate(RETURN_DAY));
    await page.getByLabel("ملاحظات").fill(`${tagText()} من الفاتورة`);

    const sent = page.waitForRequest((req) => req.url() === `${API_URL}/purchase-returns` && req.method() === "POST");
    await page.getByRole("button", { name: "حفظ" }).click();
    // Only the linked fields: never product / unit / unitCost / discounts / tax / supplier / branch / warehouse.
    expect((await sent).postDataJSON()).toEqual({
      returnDate: RETURN_DAY,
      purchaseInvoiceId: invoice.id,
      notes: `${tagText()} من الفاتورة`,
      refundAmount: 0,
      lines: [{ purchaseInvoiceLineId: invoice.lines[0].id, quantity: 2 }],
    });

    await expect(page).toHaveURL(SAVED_URL);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(RETURN_CODE);
    await expect(page.getByRole("dialog")).toBeHidden();
    const saved = await callApi(request, "GET", `/purchase-returns/${page.url().split("/").pop()}`);
    expect(saved).toMatchObject({
      status: "DRAFT",
      purchaseInvoiceId: invoice.id,
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      subTotal: "300",
      discountValue: "30",
      taxValue: "37.8",
      netTotal: "307.8",
      refundAmount: "0",
    });
  });

  test("linked, picked in the form: kinds, supplier filter → POSTED invoices only; date before the invoice; reason chips", async ({
    page,
    request,
  }) => {
    const invoice = await createPostedInvoice(request);
    // A DRAFT invoice of the same supplier: never in the picker.
    const draft = await createByApi(request, token, "/purchase-invoices", {
      invoiceDate: TEST_DOC_DATE,
      paymentType: "CASH",
      supplierId: supplier.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      currencyId: defaultCurrency.id,
      discountPercent: 0,
      discountValue: 0,
      taxPercent: 0,
      lines: [{ productId: brush.id, itemUnitId: piece.id, quantity: 1, unitCost: 10 }],
      notes: `${tagText()} مسودة`,
    });

    await page.goto("/purchase-returns");
    await page.getByRole("link", { name: "مرتجع جديد" }).first().click();
    await expect(page.getByRole("heading", { name: "مرتجع شراء جديد" })).toBeVisible();
    // Two kinds; من فاتورة شراء is the default.
    await expect(page.getByRole("radio", { name: /من فاتورة شراء/ })).toBeChecked();
    await expect(page.getByText("الأسعار والخصم والضريبة من الفاتورة — موصى به")).toBeVisible();
    await expect(page.getByText("لبضاعة لا توجد فاتورتها في النظام")).toBeVisible();
    await expect(page.getByText("اختر فاتورة الشراء لعرض بنودها")).toBeVisible();
    await expect(page.getByText("تظهر أحدث 100 فاتورة مُرحّلة؛ اختر المورد لتضييق القائمة")).toBeVisible();

    // Nothing chosen → client errors, no request.
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("اختر فاتورة الشراء", { exact: true })).toBeVisible();

    // The supplier narrows the picker: the POSTED invoice only (the DRAFT one never shows).
    const filtered = page.waitForRequest(
      (req) => req.url().includes("/purchase-invoices?") && req.url().includes(`supplierId=${supplier.id}`),
    );
    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    expect((await filtered).url()).toContain("status=POSTED");
    const picker = page.getByRole("combobox", { name: "فاتورة الشراء" });
    await picker.click();
    const options = page.getByRole("listbox").getByRole("option");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText(invoice.code);
    await expect(options.first()).toContainText(`الصافي 1,539.00 ${defaultCurrency.code}`);
    await expect(page.getByRole("listbox")).not.toContainText(draft.code);
    await options.first().click();
    await expect(page.getByLabel("كمية المرتجع — البند 1")).toBeVisible();

    // Return date before the invoice date (15/01/2001) → client error.
    await page.getByLabel("كمية المرتجع — البند 1").fill("1");
    await page.getByLabel("تاريخ المرتجع").fill(typedDate(addDays(TEST_DOC_DATE, -1)));
    const posts = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().startsWith(`${API_URL}/purchase-returns`)) posts.push(req.url());
    });
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تاريخ المرتجع لا يمكن أن يكون قبل تاريخ الفاتورة")).toBeVisible();
    // More than is left → client error.
    await page.getByLabel("كمية المرتجع — البند 1").fill("11");
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("الكمية أكبر من المتاح للإرجاع (10)")).toBeVisible();
    expect(posts).toEqual([]);

    // Reason chips fill the input (free text stays possible).
    const reason = page.getByLabel("سبب الإرجاع");
    await page.getByRole("button", { name: "منتهي الصلاحية" }).click();
    await expect(reason).toHaveValue("منتهي الصلاحية");
    await expect(page.getByRole("button", { name: "منتهي الصلاحية" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "تالف" }).click();
    await expect(reason).toHaveValue("تالف");
    await reason.fill("كسر في الشحن");
    await expect(page.getByRole("button", { name: "تالف" })).toHaveAttribute("aria-pressed", "false");

    // Switching to بدون فاتورة shows its own fields; back keeps the invoice.
    await page.getByRole("radio", { name: /بدون فاتورة/ }).check();
    await expect(page.getByLabel("الفرع")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "خصم البند" })).toHaveCount(0);
    await page.getByRole("radio", { name: /من فاتورة شراء/ }).check();
    await expect(page.getByLabel("كمية المرتجع — البند 1")).toHaveValue("11");

    // The table fits 1366×768 and 1280×720 at font متوسط.
    await expectTableFits(page);
  });

  // ─── 6. Not linked ────────────────────────────────────────────────────────────────────────────────────────

  test("بدون فاتورة: supplier / branch / warehouse, no line discount, 5% + 14%, refund 50 → body both discounts; server values", async ({
    page,
    request,
  }) => {
    await page.goto("/purchase-returns/new");
    await page.getByRole("radio", { name: /بدون فاتورة/ }).check();
    await expect(page.getByRole("combobox", { name: "فاتورة الشراء" })).toHaveCount(0);

    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await page.getByLabel("الفرع").selectOption(branch.id);
    // The branch's only warehouse is chosen by itself.
    await expect(page.getByLabel("المخزن")).toHaveValue(warehouse.id);
    await page.getByLabel("تاريخ المرتجع").fill(typedDate(RETURN_DAY));
    await page.getByLabel("ملاحظات").fill(`${tagText()} بدون فاتورة`);

    // LinesTable without the line discount column; the price is "سعر الوحدة".
    await expect(page.getByRole("columnheader", { name: "خصم البند" })).toHaveCount(0);
    await pickSearchOption(page, page.getByRole("combobox", { name: "الصنف — البند 1" }), brush.name, new RegExp(brush.name));
    await page.getByLabel("الوحدة — البند 1", { exact: true }).selectOption(carton.id);
    await page.getByLabel("الكمية — البند 1").fill("1");
    await expect(page.getByText(`= 12 قطعة ${tag}`)).toBeVisible();
    await page.getByLabel("سعر الوحدة — البند 1").fill("120");
    await expect(page.getByText(`المتاح في المخزن: 100 قطعة ${tag} · متوسط التكلفة 10.00`)).toBeVisible();

    const totals = page.getByRole("group", { name: "الإجماليات" });
    await totals.getByLabel("نسبة الخصم %").fill("5");
    await totals.getByLabel("نسبة الضريبة %").fill("14");
    // 120 − 6 = 114; tax 15.96 → net 129.96.
    await expect(totals).toContainText(/الإجمالي\s*120.00/);
    await expect(totals).toContainText("6.00");
    await expect(totals).toContainText("15.96");
    await expect(totals).toContainText(/الصافي\s*129.96/);
    await expect(totals).toContainText("المبالغ بالعملة الأساسية");

    // Refund above the net → client error.
    const refund = totals.getByLabel("المبلغ المسترد نقدًا");
    await refund.fill("200");
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("المبلغ المسترد أكبر من صافي المرتجع")).toBeVisible();
    await refund.fill("50");

    const sent = page.waitForRequest((req) => req.url() === `${API_URL}/purchase-returns` && req.method() === "POST");
    await page.getByRole("button", { name: "حفظ" }).click();
    const body = (await sent).postDataJSON();
    expect(body).toEqual({
      returnDate: RETURN_DAY,
      notes: `${tagText()} بدون فاتورة`,
      refundAmount: 50,
      supplierId: supplier.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      discountPercent: 5,
      discountValue: 0,
      taxPercent: 14,
      lines: [{ productId: brush.id, itemUnitId: carton.id, quantity: 1, unitCost: 120 }],
    });

    await expect(page).toHaveURL(SAVED_URL);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(RETURN_CODE);
    const saved = await callApi(request, "GET", `/purchase-returns/${page.url().split("/").pop()}`);
    expect(saved).toMatchObject({
      purchaseInvoiceId: null,
      subTotal: "120",
      discountPercent: "5",
      discountValue: "6",
      taxValue: "15.96",
      netTotal: "129.96",
      refundAmount: "50",
    });
  });

  // ─── 7. Stock hint (form) ─────────────────────────────────────────────────────────────────────────────────

  test("stock hint: lines of the same product add up → amber warning; SERVICE has no stock; still saves", async ({ page }) => {
    await page.goto("/purchase-returns/new");
    await page.getByRole("radio", { name: /بدون فاتورة/ }).check();
    await pickSearchOption(page, page.getByRole("combobox", { name: "المورد" }), supplier.name, new RegExp(supplier.name));
    await page.getByLabel("الفرع").selectOption(branch.id);
    await page.getByLabel("تاريخ المرتجع").fill(typedDate(RETURN_DAY));
    await page.getByLabel("ملاحظات").fill(`${tagText()} مخزون`);
    const warning = page.getByText("الكمية أكبر من المتاح في المخزن");

    // 8 cartons = 96 pieces ≤ 100: no warning. 9 cartons = 108 > 100: warning.
    await pickSearchOption(page, page.getByRole("combobox", { name: "الصنف — البند 1" }), brush.name, new RegExp(brush.name));
    await page.getByLabel("الوحدة — البند 1", { exact: true }).selectOption(carton.id);
    await page.getByLabel("الكمية — البند 1").fill("8");
    await page.getByLabel("سعر الوحدة — البند 1").fill("100");
    await expect(page.getByText(`المتاح في المخزن: 100 قطعة ${tag}`)).toBeVisible();
    await expect(warning).toHaveCount(0);
    await page.getByLabel("الكمية — البند 1").fill("9");
    await expect(warning).toHaveCount(1);
    await page.getByLabel("الكمية — البند 1").fill("8");
    await expect(warning).toHaveCount(0);

    // A second line of the same product: 96 + 5 = 101 > 100 → both lines warn.
    await page.getByRole("button", { name: "إضافة بند" }).click();
    await pickSearchOption(page, page.getByRole("combobox", { name: "الصنف — البند 2" }), brush.name, new RegExp(brush.name));
    await page.getByLabel("الكمية — البند 2").fill("5");
    await page.getByLabel("سعر الوحدة — البند 2").fill("10");
    await expect(warning).toHaveCount(2);

    // SERVICE: no stock line.
    await page.getByRole("button", { name: "إضافة بند" }).click();
    await pickSearchOption(page, page.getByRole("combobox", { name: "الصنف — البند 3" }), serviceProduct.name, new RegExp(serviceProduct.name));
    await page.getByLabel("الكمية — البند 3").fill("1");
    await page.getByLabel("سعر الوحدة — البند 3").fill("50");
    await expect(page.getByText("خدمة — لا تخرج من المخزن")).toBeVisible();

    // A warning only: it saves (posting decides). Wait for the details page (cleanup must not run under it).
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page).toHaveURL(SAVED_URL);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(RETURN_CODE);
    await expect(page.getByRole("alert").filter({ hasText: "لا تكفي للبنود" })).toBeVisible();
  });

  // ─── 3 + 5. Post, item card, links; cancel ────────────────────────────────────────────────────────────────

  test("post: confirm names the warehouse → POSTED, item card −24 (220 → 196) at the average, links both ways; cancel → +24", async ({
    page,
    request,
  }) => {
    const invoice = await createPostedInvoice(request);
    const draft = await createLinkedReturn(request, invoice, 2, { reason: "تالف", notes: "ترحيل" });

    await page.goto(`/purchase-returns/${draft.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`مرتجع شراء ${draft.code}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("مسودة");
    const info = page.locator("main dl");
    await expect(info.getByRole("link", { name: invoice.code })).toHaveAttribute("href", `/purchase-invoices/${invoice.id}`);
    await expect(info).toContainText("15 يناير 2001");
    await expect(info).toContainText(`(${defaultCurrency.code})`);
    await expect(info).toContainText("تالف");
    await expect(info).toContainText(warehouse.name);
    const row = bodyRows(page).first();
    await expect(row).toContainText(`= 24 قطعة ${tag}`);
    await expect(row).toContainText(`من بند الفاتورة: 10 كرتونة ${tag}`);
    await expect(row).toContainText("150.00");
    await expect(row).toContainText("300.00");
    // DRAFT: nothing moved yet → no item card button.
    await expect(page.getByRole("link", { name: "كارت الصنف — البند 1" })).toHaveCount(0);
    const totals = page.getByRole("group", { name: "الإجماليات" });
    await expect(totals).toContainText(/الخصم \(10%\)\s*30.00/);
    await expect(totals).toContainText(/الضريبة \(14%\)\s*37.80/);
    await expect(totals).toContainText(/الصافي\s*307.80/);
    await expect(totals).toContainText(/المبلغ المسترد\s*0.00/);
    await expect(totals).not.toContainText("معاينة");
    // Buttons of a DRAFT.
    await expect(page.getByRole("link", { name: "تعديل", exact: true })).toHaveAttribute(
      "href",
      `/purchase-returns/${draft.id}/edit`,
    );
    await expect(page.getByRole("button", { name: "حذف" })).toBeVisible();

    await page.getByRole("button", { name: "ترحيل" }).click();
    const confirm = page.getByRole("dialog", { name: "ترحيل المرتجع" });
    await expect(confirm).toContainText(`سيتم إخراج كميات البنود من «${warehouse.name}» بمتوسط التكلفة الحالي`);
    await confirm.getByRole("button", { name: "ترحيل المرتجع" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "تم ترحيل المرتجع وإخراج الكميات من المخزن" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("مُرحّل");
    await expect(page.getByRole("button", { name: "ترحيل" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "إلغاء المرتجع" })).toBeVisible();
    await expect(page.locator("main dl")).toContainText("رحّله");

    // The item card: PURCHASE_RETURN −24 at the current average; the average stays 10.6818.
    const card = await itemCard(request);
    expect(card.movements.at(-1)).toMatchObject({
      type: "PURCHASE_RETURN",
      quantity: "-24",
      unitCost: "10.6818",
      balanceAfter: "196",
      avgCostAfter: "10.6818",
      sourceType: "PR",
      sourceCode: draft.code,
    });
    // The item card page (row button) → the PR number links back to the return.
    await page.getByRole("link", { name: "كارت الصنف — البند 1" }).click();
    await expect(page).toHaveURL(/\/item-card\?/);
    await page.getByRole("link", { name: draft.code }).first().click();
    await expect(page).toHaveURL(new RegExp(`/purchase-returns/${draft.id}$`));

    // The invoice: its returns link to the return; its cancel is blocked by the POSTED return (real, not mocked).
    await page.goto(`/purchase-invoices/${invoice.id}`);
    const returns = page.locator("section", { has: page.getByRole("heading", { name: "المرتجعات" }) });
    await expect(returns.getByRole("link", { name: draft.code })).toHaveAttribute("href", `/purchase-returns/${draft.id}`);
    await expect(returns.getByRole("link", { name: "عرض في قائمة المرتجعات" })).toHaveAttribute(
      "href",
      `/purchase-returns?invoice=${invoice.id}`,
    );
    await expect(page.getByRole("button", { name: "إلغاء الفاتورة" })).toBeDisabled();
    await expect(page.locator('span[title="عليها مرتجع مُرحّل، ألغِ المرتجع أولًا"]')).toHaveCount(1);

    // Cancel the return: "رجوع" keeps it; confirm → CANCELLED, +24 at the same cost, returnable again.
    await page.goto(`/purchase-returns/${draft.id}`);
    await page.getByRole("button", { name: "إلغاء المرتجع" }).click();
    const cancelDialog = page.getByRole("dialog", { name: "إلغاء المرتجع" });
    await expect(cancelDialog).toContainText(`ستعود كميات المرتجع إلى «${warehouse.name}» بنفس التكلفة التي خرجت بها`);
    await cancelDialog.getByRole("button", { name: "رجوع" }).click();
    await expect(cancelDialog).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("مُرحّل");
    await page.getByRole("button", { name: "إلغاء المرتجع" }).click();
    await page.getByRole("dialog", { name: "إلغاء المرتجع" }).getByRole("button", { name: "إلغاء المرتجع" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "تم إلغاء المرتجع وإرجاع الكميات إلى المخزن" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ملغي");
    await expect(page.getByRole("button", { name: "إلغاء المرتجع" })).toHaveCount(0);
    await expect(page.locator("main dl")).toContainText("ألغاه");

    const after = await itemCard(request);
    expect(after.movements.at(-1)).toMatchObject({
      type: "PURCHASE_RETURN_CANCEL",
      quantity: "24",
      unitCost: "10.6818",
      balanceAfter: "220",
    });
    const returnable = await callApi(request, "GET", `/purchase-invoices/${invoice.id}/returnable`);
    expect(returnable.lines[0]).toMatchObject({ returnedQuantity: "0", remainingQuantity: "10" });
    // The invoice can be cancelled again (afterEach does it).
    await page.goto(`/purchase-invoices/${invoice.id}`);
    await expect(page.getByRole("button", { name: "إلغاء الفاتورة" })).toBeEnabled();
  });

  // ─── 7. Stock hint (details) ──────────────────────────────────────────────────────────────────────────────

  test("a DRAFT needing more than the warehouse has: amber alert + ترحيل disabled with the reason", async ({ page, request }) => {
    // 9 cartons = 108 pieces; the warehouse has 100.
    const draft = await createReturn(request, {
      notes: "أكثر من المخزن",
      supplierId: supplier.id,
      branchId: branch.id,
      warehouseId: warehouse.id,
      discountPercent: 0,
      discountValue: 0,
      taxPercent: 0,
      lines: [
        { productId: brush.id, itemUnitId: carton.id, quantity: 9, unitCost: 100 },
        { productId: serviceProduct.id, itemUnitId: piece.id, quantity: 1, unitCost: 50 },
      ],
    });
    // The server orders a return's lines by id: the brush line's number comes from its answer.
    const brushLine = draft.lines.findIndex((line) => line.productId === brush.id) + 1;
    await page.goto(`/purchase-returns/${draft.id}`);
    await expect(
      page.getByRole("alert").filter({ hasText: `الكمية المتاحة في «${warehouse.name}» الآن لا تكفي للبنود: ${brushLine}.` }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "ترحيل" })).toBeDisabled();
    await expect(
      page.locator(`span[title="الكمية المتاحة في المخزن لا تكفي للبنود: ${brushLine} — لا يمكن الترحيل الآن"]`),
    ).toHaveCount(1);
    await expect(page.locator("main dl")).toContainText("بدون فاتورة");
    await expect(bodyRows(page).filter({ hasText: serviceProduct.name })).toContainText("خدمة — لا تخرج من المخزن");
    // Editing it down to 8 cartons (96 pieces) → ترحيل is allowed.
    await callApi(request, "PATCH", `/purchase-returns/${draft.id}`, {
      lines: [{ productId: brush.id, itemUnitId: carton.id, quantity: 8, unitCost: 100 }],
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "ترحيل" })).toBeEnabled();
    await expect(page.getByText("لا تكفي للبنود")).toHaveCount(0);
  });

  // ─── 10. Delete ───────────────────────────────────────────────────────────────────────────────────────────

  test("delete a DRAFT: confirm → the list with تم حذف مرتجع الشراء", async ({ page, request }) => {
    const invoice = await createPostedInvoice(request);
    const draft = await createLinkedReturn(request, invoice, 1, { notes: "حذف" });
    await page.goto(`/purchase-returns/${draft.id}`);
    await page.getByRole("button", { name: "حذف" }).click();
    const dialog = page.getByRole("dialog", { name: "حذف المرتجع" });
    await expect(dialog).toContainText(`هل أنت متأكد من حذف مرتجع الشراء ${draft.code}؟`);
    await dialog.getByRole("button", { name: "حذف المرتجع" }).click();
    await expect(page).toHaveURL(/\/purchase-returns$/);
    await expect(page.getByRole("alert").filter({ hasText: `تم حذف مرتجع الشراء ${draft.code}` })).toBeVisible();
    expect((await ownReturns(request)).map((item) => item.id)).not.toContain(draft.id);
  });

  // ─── 9. Edit ──────────────────────────────────────────────────────────────────────────────────────────────

  test.describe("expected API errors", () => {
    test.use({ allowedConsoleErrors: [/status of (400|404)/] });

    test("edit a linked DRAFT: kind + invoice read only, PATCH sends purchaseInvoiceId again; POSTED edit URL; unknown id", async ({
      page,
      request,
    }) => {
      const invoice = await createPostedInvoice(request);
      const draft = await createLinkedReturn(request, invoice, 2, { reason: "تالف", notes: "تعديل" });
      const posted = await createLinkedReturn(request, invoice, 1, { notes: "مرحل" });
      await postReturn(request, posted.id);

      await page.goto(`/purchase-returns/${draft.id}/edit`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(`تعديل مرتجع الشراء ${draft.code}`);
      await expect(page.getByRole("radio")).toHaveCount(0);
      await expect(page.getByText("النوع والفاتورة ثابتان بعد الإنشاء: لتغييره احذف المسودة وأنشئ مرتجعًا جديدًا.")).toBeVisible();
      await expect(page.locator("main").getByRole("link", { name: invoice.code })).toBeVisible();
      await expect(page.getByLabel("سبب الإرجاع")).toHaveValue("تالف");
      const quantity = page.getByLabel("كمية المرتجع — البند 1");
      await expect(quantity).toHaveValue("2");
      // 1 carton was posted by another return: 9 left (this draft is not counted).
      await expect(bodyRows(page).first()).toContainText("متاح للإرجاع 9");
      await expect(bodyRows(page).first()).toContainText("اشتريت 10 · مرتجع سابقًا 1");

      await quantity.fill("3");
      await page.getByLabel("سبب الإرجاع").fill("");
      const sent = page.waitForRequest((req) => req.url() === `${API_URL}/purchase-returns/${draft.id}` && req.method() === "PATCH");
      await page.getByRole("button", { name: "حفظ" }).click();
      expect((await sent).postDataJSON()).toEqual({
        returnDate: RETURN_DAY,
        reason: null,
        notes: `${tagText()} تعديل`,
        refundAmount: 0,
        purchaseInvoiceId: invoice.id,
        lines: [{ purchaseInvoiceLineId: invoice.lines[0].id, quantity: 3 }],
      });
      await expect(page).toHaveURL(new RegExp(`/purchase-returns/${draft.id}$`));
      const saved = await callApi(request, "GET", `/purchase-returns/${draft.id}`);
      expect(saved).toMatchObject({ reason: null, subTotal: "450" });

      // A POSTED return can't be edited.
      await page.goto(`/purchase-returns/${posted.id}/edit`);
      await expect(page.getByText("لا يمكن تعديل هذا المرتجع لأن حالته «مُرحّل»")).toBeVisible();
      await expect(page.getByRole("link", { name: "عرض التفاصيل" })).toHaveAttribute("href", `/purchase-returns/${posted.id}`);

      // Unknown id.
      await page.goto("/purchase-returns/does-not-exist/edit");
      await expect(page.getByText("مرتجع الشراء غير موجود أو محذوف")).toBeVisible();
    });

    test("a linked DRAFT whose invoice was cancelled: amber alert, حفظ disabled with the reason", async ({ page, request }) => {
      const invoice = await createPostedInvoice(request);
      const draft = await createLinkedReturn(request, invoice, 2, { notes: "فاتورة ملغاة" });
      // A DRAFT return does not block the invoice cancel.
      await callApi(request, "POST", `/purchase-invoices/${invoice.id}/cancel`);

      await page.goto(`/purchase-returns/${draft.id}/edit`);
      const reason = "الفاتورة الأصلية لم تعد مُرحّلة، لا يمكن حفظ هذا المرتجع أو ترحيله — احذفه وأنشئ مرتجعًا جديدًا";
      await expect(page.getByRole("alert").filter({ hasText: reason })).toBeVisible();
      await expect(page.getByRole("button", { name: "حفظ" })).toBeDisabled();
      await expect(page.locator(`span[title="${reason}"]`)).toHaveCount(1);

      // Details: the same alert, ترحيل disabled with the reason, حذف still works.
      await page.goto(`/purchase-returns/${draft.id}`);
      await expect(page.getByRole("alert").filter({ hasText: reason })).toBeVisible();
      await expect(page.getByRole("button", { name: "ترحيل" })).toBeDisabled();
      await expect(page.locator(`span[title="${reason}"]`)).toHaveCount(1);
      await page.getByRole("button", { name: "حذف" }).click();
      await page.getByRole("dialog", { name: "حذف المرتجع" }).getByRole("button", { name: "حذف المرتجع" }).click();
      await expect(page.getByRole("alert").filter({ hasText: `تم حذف مرتجع الشراء ${draft.code}` })).toBeVisible();
    });

    test("returnable after a posted return: متاح 8 · مرتجع سابقًا 2; 9 → client error; QUANTITY_EXCEEDED on save and on post", async ({
      page,
      request,
    }) => {
      const invoice = await createPostedInvoice(request);
      const first = await createLinkedReturn(request, invoice, 2, { notes: "الأول" });
      await postReturn(request, first.id);
      // Two drafts on the same line (posted later: the first one posted wins).
      const draftA = await createLinkedReturn(request, invoice, 2, { notes: "مسودة أ" });
      const draftB = await createLinkedReturn(request, invoice, 2, { notes: "مسودة ب" });

      await page.goto(`/purchase-returns/new?invoice=${invoice.id}`);
      await expect(page.getByText("توجد مرتجعات مسودة أخرى على هذه الفاتورة")).toBeVisible();
      await expect(page.getByRole("link", { name: draftA.code })).toHaveAttribute("href", `/purchase-returns/${draftA.id}`);
      await expect(page.getByRole("link", { name: draftB.code })).toHaveAttribute("href", `/purchase-returns/${draftB.id}`);
      await expect(page.getByText("— أول مرتجع يُرحَّل يأخذ الكمية")).toBeVisible();
      const row = bodyRows(page).first();
      await expect(row).toContainText("متاح للإرجاع 8");
      await expect(row).toContainText("اشتريت 10 · مرتجع سابقًا 2");
      const quantity = page.getByLabel("كمية المرتجع — البند 1");
      await quantity.fill("9");
      await page.getByLabel("تاريخ المرتجع").fill(typedDate(RETURN_DAY));
      await page.getByLabel("ملاحظات").fill(`${tagText()} من الشاشة`);
      await page.getByRole("button", { name: "حفظ" }).click();
      await expect(page.getByText("الكمية أكبر من المتاح للإرجاع (8)")).toBeVisible();

      // Meanwhile another return of 5 is posted: the screen still says 8 → the server refuses 6.
      const other = await createLinkedReturn(request, invoice, 5, { notes: "في نفس الوقت" });
      await postReturn(request, other.id);
      await quantity.fill("6");
      await page.getByRole("button", { name: "حفظ" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "البند رقم 1: الكمية أكبر من المسموح بإرجاعه" })).toBeVisible();
      await expect(row).toHaveClass(/bg-red-50/);
      await expect(row.getByText("البند رقم 1: الكمية أكبر من المسموح بإرجاعه")).toBeVisible();
      // What is left is loaded again: 3.
      await expect(row).toContainText("متاح للإرجاع 3");
      await expect(row).toContainText("مرتجع سابقًا 7");

      // The drafts: A is posted first (1 left), B asks for 2 → QUANTITY_EXCEEDED on post.
      await postReturn(request, draftA.id);
      // Leaving the changed form: the browser's own "Leave site?" prompt (beforeunload) → leave.
      page.once("dialog", (browserDialog) => browserDialog.accept());
      await page.goto(`/purchase-returns/${draftB.id}`);
      await page.getByRole("button", { name: "ترحيل" }).click();
      await page.getByRole("dialog", { name: "ترحيل المرتجع" }).getByRole("button", { name: "ترحيل المرتجع" }).click();
      await expect(
        page.getByRole("alert").filter({
          hasText: "البند رقم 1: الكمية أكبر من المسموح بإرجاعه — تم ترحيل مرتجع آخر على نفس البند",
        }),
      ).toBeVisible();
      await expect(bodyRows(page).first()).toHaveClass(/bg-red-50/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("مسودة");
    });
  });
});

// ─── Mocked API ───────────────────────────────────────────────────────────────────────────────────────────────

const HEADERS = { "Access-Control-Allow-Origin": "*" };
const ok = (data) => ({ status: 200, headers: HEADERS, json: { message: "ok", data } });

function returnItem(n, overrides = {}) {
  return {
    id: `pr${n}`,
    code: `PR-2026-${String(n).padStart(6, "0")}`,
    returnDate: "2026-11-25T00:00:00.000Z",
    status: "DRAFT",
    reason: null,
    supplierId: "s1",
    branchId: "b1",
    warehouseId: "w1",
    purchaseInvoiceId: null,
    subTotal: "300",
    discountPercent: "0",
    discountValue: "0",
    taxPercent: "0",
    taxValue: "0",
    netTotal: "300",
    refundAmount: "0",
    notes: null,
    supplier: { id: "s1", code: "SUP-1", name: "النيل" },
    branch: { id: "b1", code: "branch-1", name: "فرع المعادي" },
    warehouse: { id: "w1", name: "مخزن المعادي" },
    purchaseInvoice: null,
    _count: { lines: 1 },
    ...overrides,
  };
}

function page1(items, meta = {}) {
  return { items, meta: { page: 1, pageSize: 20, total: items.length, totalPages: 1, ...meta } };
}

const fail = (status, code, field = null) => ({
  status,
  headers: HEADERS,
  json: { statusCode: status, message: "English text", error: "Error", code, field },
});

const SUPPLIER = { id: "s1", code: "SUP-1", name: "النيل" };
const BRANCH = { id: "b1", code: "branch-1", name: "فرع المعادي" };
const WAREHOUSE = { id: "w1", name: "مخزن المعادي", branchId: "b1" };
const EGP = { id: "c1", code: "EGP", name: "جنيه مصري", symbol: "ج.م", isDefault: true };
const PIECE = { id: "u-piece", code: "unit-1", name: "قطعة" };
const CARTON = { id: "u-carton", code: "unit-2", name: "كرتونة" };
const BRUSH = { id: "p1", code: "PRD-000001", name: "فرشة", itemType: "STOCK", hasExpiryDate: false };
const PRODUCTS = [
  { ...BRUSH, barcode: null, primaryItemUnitId: PIECE.id, primaryItemUnit: PIECE },
  {
    id: "p2",
    code: "PRD-000002",
    name: "معجون أسنان باسم طويل نسبيًا للتجربة",
    itemType: "STOCK",
    hasExpiryDate: false,
    barcode: null,
    primaryItemUnitId: PIECE.id,
    primaryItemUnit: PIECE,
  },
];

// The brush invoice of week2flow (POSTED): 10 cartons × 150, 10% + 14%.
function invoiceDetail(overrides = {}) {
  return {
    id: "i1",
    code: "PI-2026-000001",
    invoiceDate: "2026-11-24T00:00:00.000Z",
    status: "POSTED",
    supplierInvoiceNumber: "NILE-778",
    supplierId: SUPPLIER.id,
    branchId: BRANCH.id,
    warehouseId: WAREHOUSE.id,
    currencyId: EGP.id,
    subTotal: "1500",
    discountPercent: "10",
    discountValue: "150",
    taxPercent: "14",
    taxValue: "189",
    netTotal: "1539",
    supplier: SUPPLIER,
    branch: BRANCH,
    warehouse: { id: WAREHOUSE.id, name: WAREHOUSE.name },
    currency: EGP,
    purchaseReturns: [],
    lines: [
      {
        id: "l1",
        productId: BRUSH.id,
        itemUnitId: CARTON.id,
        unitFactor: "12",
        quantity: "10",
        baseQuantity: "120",
        unitCost: "150",
        lineTotal: "1500",
        product: BRUSH,
        itemUnit: CARTON,
      },
    ],
    ...overrides,
  };
}

function returnableOf(returned) {
  return {
    invoiceId: "i1",
    code: "PI-2026-000001",
    status: "POSTED",
    lines: [
      {
        lineId: "l1",
        productId: BRUSH.id,
        product: BRUSH,
        itemUnitId: CARTON.id,
        itemUnit: CARTON,
        unitFactor: "12",
        quantity: "10",
        returnedQuantity: String(returned),
        remainingQuantity: String(10 - returned),
      },
    ],
  };
}

// A linked DRAFT return of 2 cartons (307.80).
function returnDetail(overrides = {}) {
  return {
    ...returnItem(1, {
      purchaseInvoiceId: "i1",
      subTotal: "300",
      discountPercent: "10",
      discountValue: "30",
      taxPercent: "14",
      taxValue: "37.8",
      netTotal: "307.8",
    }),
    purchaseInvoice: {
      id: "i1",
      code: "PI-2026-000001",
      invoiceDate: "2026-11-24T00:00:00.000Z",
      status: "POSTED",
      supplierInvoiceNumber: "NILE-778",
    },
    createdDate: "2026-11-25T10:00:00.000Z",
    modifiedDate: "2026-11-25T10:00:00.000Z",
    createdByUser: { id: "u1", username: "admin" },
    modifiedByUser: null,
    postedByUser: null,
    cancelledByUser: null,
    lines: [
      {
        id: "rl1",
        purchaseInvoiceLineId: "l1",
        productId: BRUSH.id,
        itemUnitId: CARTON.id,
        unitFactor: "12",
        quantity: "2",
        baseQuantity: "24",
        unitCost: "150",
        lineTotal: "300",
        notes: null,
        product: BRUSH,
        itemUnit: CARTON,
        purchaseInvoiceLine: { id: "l1", quantity: "10", unitCost: "150", lineTotal: "1500" },
      },
    ],
    ...overrides,
  };
}

// The lists + the warehouse stock every form / details page reads (220 brushes @ 10.6818).
async function mockFormLists(page) {
  await page.route(`${API_URL}/supplier`, (route) => route.fulfill(ok([SUPPLIER])));
  await page.route(`${API_URL}/branch`, (route) => route.fulfill(ok([BRANCH])));
  await page.route(`${API_URL}/inventory`, (route) => route.fulfill(ok([WAREHOUSE])));
  await page.route(`${API_URL}/currency`, (route) => route.fulfill(ok([EGP])));
  await page.route(`${API_URL}/products`, (route) => route.fulfill(ok(PRODUCTS)));
  await page.route(`${API_URL}/products/*/units`, (route) =>
    route.fulfill(
      ok([
        { id: null, isPrimary: true, itemUnitId: PIECE.id, itemUnit: PIECE, factor: "1" },
        { id: "pu1", isPrimary: false, itemUnitId: CARTON.id, itemUnit: CARTON, factor: "12" },
      ]),
    ),
  );
  await page.route(`${API_URL}/product-inventory/inventory/w1`, (route) =>
    route.fulfill(ok([{ id: "pi1", productId: BRUSH.id, inventoryId: "w1", quantity: "220", costPrice: "10.6818" }])),
  );
  await page.route(`${API_URL}/purchase-invoices?*`, (route) => route.fulfill(ok(page1([invoiceDetail()]))));
}

// (API_URL routes only: the app's own page is /purchase-returns too.)
async function mockListApi(page, onReturns) {
  await page.route(`${API_URL}/supplier`, (route) => route.fulfill(ok([{ id: "s1", code: "SUP-1", name: "النيل" }])));
  await page.route(`${API_URL}/purchase-returns?*`, onReturns);
}

test.describe("mocked API", () => {
  test.beforeEach(async ({ page }) => {
    await setFakeSession(page);
  });

  test("empty list: لا توجد مرتجعات شراء بعد + مرتجع جديد", async ({ page }) => {
    await mockListApi(page, (route) => route.fulfill(ok(page1([]))));
    await page.goto("/purchase-returns");
    const empty = page.getByText("لا توجد مرتجعات شراء بعد");
    await expect(empty).toBeVisible();
    await expect(page.getByRole("link", { name: "مرتجع جديد" })).toHaveCount(2);
  });

  test.describe("list error", () => {
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("error + retry", async ({ page }) => {
      // Fails until the retry is clicked (StrictMode loads twice in dev: never "only the 1st call").
      let failing = true;
      await mockListApi(page, (route) =>
        failing
          ? route.fulfill({ status: 500, headers: HEADERS, json: { statusCode: 500, code: "INTERNAL_ERROR", field: null } })
          : route.fulfill(ok(page1([returnItem(1)]))),
      );
      await page.goto("/purchase-returns");
      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();
      failing = false;
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();
      await expect(bodyRows(page)).toHaveCount(1);
    });
  });

  test("filtered empty: لا توجد مرتجعات شراء تطابق الفلاتر + مسح الفلاتر", async ({ page }) => {
    await mockListApi(page, (route) => {
      const filtered = new URL(route.request().url()).searchParams.has("status");
      return route.fulfill(ok(page1(filtered ? [] : [returnItem(1)])));
    });
    await page.goto("/purchase-returns");
    await expect(bodyRows(page)).toHaveCount(1);
    await page.getByLabel("الحالة").selectOption("CANCELLED");
    await expect(page.getByText("لا توجد مرتجعات شراء تطابق الفلاتر")).toBeVisible();
    await page.getByRole("main").getByRole("button", { name: "مسح الفلاتر" }).last().click();
    await expect(bodyRows(page)).toHaveCount(1);
  });

  test("pagination: total 45 → صفحة 1 من 3; التالي asks for page=2", async ({ page }) => {
    const pages = [];
    await mockListApi(page, (route) => {
      const pageNumber = Number(new URL(route.request().url()).searchParams.get("page"));
      pages.push(pageNumber);
      const items = Array.from({ length: 20 }, (_, i) => returnItem((pageNumber - 1) * 20 + i + 1));
      return route.fulfill(ok(page1(items, { page: pageNumber, total: 45, totalPages: 3 })));
    });
    await page.goto("/purchase-returns");
    await expect(page.getByText("صفحة 1 من 3")).toBeVisible();
    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.getByText("صفحة 2 من 3")).toBeVisible();
    await expect(bodyRows(page).first()).toContainText("PR-2026-000021");
    expect(pages).toContain(2);
  });

  test("an invoice whose lines are all returned: a clear empty state + عرض الفاتورة", async ({ page }) => {
    await mockFormLists(page);
    await page.route(`${API_URL}/purchase-invoices/i1`, (route) => route.fulfill(ok(invoiceDetail())));
    await page.route(`${API_URL}/purchase-invoices/i1/returnable`, (route) => route.fulfill(ok(returnableOf(10))));
    await page.goto("/purchase-returns/new?invoice=i1");
    await expect(page.getByText("تم إرجاع كل بنود هذه الفاتورة بالكامل، لا توجد كميات متاحة للإرجاع")).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "عرض الفاتورة" })).toHaveAttribute("href", "/purchase-invoices/i1");
    await expect(page.getByLabel("كمية المرتجع — البند 1")).toHaveCount(0);
  });

  test("?invoice= of an invoice that is not POSTED: a clear message + a link back, حفظ disabled", async ({ page }) => {
    await mockFormLists(page);
    await page.route(`${API_URL}/purchase-invoices/i1`, (route) => route.fulfill(ok(invoiceDetail({ status: "DRAFT" }))));
    await page.route(`${API_URL}/purchase-invoices/i1/returnable`, (route) => route.fulfill(ok(returnableOf(0))));
    await page.goto("/purchase-returns/new?invoice=i1");
    const alert = page.getByRole("alert").filter({ hasText: "لا يمكن عمل مرتجع من الفاتورة PI-2026-000001 لأن حالتها «مسودة»" });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole("link", { name: "عرض الفاتورة" })).toHaveAttribute("href", "/purchase-invoices/i1");
    await expect(page.getByRole("button", { name: "حفظ" })).toBeDisabled();
  });

  test.describe("action errors", () => {
    // One regex: an array of two would be read by Playwright as [value, fixture options].
    test.use({ allowedConsoleErrors: [/status of (409|400)/] });

    test("post 400 BAD_REQUEST purchaseInvoiceId → الفاتورة الأصلية لم تعد مُرحّلة + refresh (amber alert, ترحيل disabled)", async ({
      page,
    }) => {
      // The invoice is cancelled meanwhile: the refresh after the 400 reads it CANCELLED.
      let invoiceStatus = "POSTED";
      await mockFormLists(page);
      await page.route(`${API_URL}/purchase-returns/pr1`, (route) => route.fulfill(ok(returnDetail())));
      await page.route(`${API_URL}/purchase-invoices/i1`, (route) =>
        route.fulfill(ok(invoiceDetail({ status: invoiceStatus }))),
      );
      await page.route(`${API_URL}/purchase-returns/pr1/post`, (route) => {
        invoiceStatus = "CANCELLED";
        return route.fulfill(fail(400, "BAD_REQUEST", "purchaseInvoiceId"));
      });
      await page.goto("/purchase-returns/pr1");
      await expect(page.getByRole("group", { name: "الإجماليات" })).toContainText("307.80");
      await page.getByRole("button", { name: "ترحيل", exact: true }).click();
      await page.getByRole("dialog", { name: "ترحيل المرتجع" }).getByRole("button", { name: "ترحيل المرتجع" }).click();
      await expect(page.getByRole("alert").filter({ hasText: /^الفاتورة الأصلية لم تعد مُرحّلة$/ })).toBeVisible();
      const reason = "الفاتورة الأصلية لم تعد مُرحّلة، لا يمكن حفظ هذا المرتجع أو ترحيله — احذفه وأنشئ مرتجعًا جديدًا";
      await expect(page.getByRole("alert").filter({ hasText: reason })).toBeVisible();
      await expect(page.getByRole("button", { name: "ترحيل", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "حذف" })).toBeEnabled();
    });

    test("409 INVALID_STATUS on ترحيل → Arabic message + refresh (the buttons follow the real status)", async ({ page }) => {
      // DRAFT on screen; someone else posted it meanwhile → after the 409 the refresh reads POSTED.
      let changedElsewhere = false;
      await mockFormLists(page);
      await page.route(`${API_URL}/purchase-invoices/i1`, (route) => route.fulfill(ok(invoiceDetail())));
      await page.route(`${API_URL}/purchase-returns/pr1`, (route) =>
        route.fulfill(ok(returnDetail({ status: changedElsewhere ? "POSTED" : "DRAFT" }))),
      );
      await page.route(`${API_URL}/purchase-returns/pr1/post`, (route) => {
        changedElsewhere = true;
        return route.fulfill(fail(409, "INVALID_STATUS", "status"));
      });
      await page.goto("/purchase-returns/pr1");
      await page.getByRole("button", { name: "ترحيل", exact: true }).click();
      await page.getByRole("dialog", { name: "ترحيل المرتجع" }).getByRole("button", { name: "ترحيل المرتجع" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "لا يمكن تنفيذ العملية في حالة المستند الحالية" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("مُرحّل");
      await expect(page.getByRole("button", { name: "إلغاء المرتجع" })).toBeVisible();
    });

    test("post 400 INSUFFICIENT_STOCK → the line message, row marked, still DRAFT", async ({ page }) => {
      await mockFormLists(page);
      await page.route(`${API_URL}/purchase-invoices/i1`, (route) => route.fulfill(ok(invoiceDetail())));
      await page.route(`${API_URL}/purchase-returns/pr1`, (route) => route.fulfill(ok(returnDetail())));
      await page.route(`${API_URL}/purchase-returns/pr1/post`, (route) =>
        route.fulfill(fail(400, "INSUFFICIENT_STOCK", "lines.0.quantity")),
      );
      await page.goto("/purchase-returns/pr1");
      await page.getByRole("button", { name: "ترحيل", exact: true }).click();
      await page.getByRole("dialog", { name: "ترحيل المرتجع" }).getByRole("button", { name: "ترحيل المرتجع" }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: "البند رقم 1: الكمية المتاحة في المخزن غير كافية" }),
      ).toBeVisible();
      await expect(bodyRows(page).first()).toHaveClass(/bg-red-50/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("مسودة");
    });
  });

  test.describe("font كبير at 1280×720", () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test("details and both form kinds stay usable: actions, totals, quantity + الكل, the line delete button", async ({
      page,
    }) => {
      await page.evaluate(([key]) => localStorage.setItem(key, "large"), [FONT_SIZE_KEY]);
      await mockFormLists(page);
      await page.route(`${API_URL}/purchase-invoices/i1`, (route) => route.fulfill(ok(invoiceDetail())));
      await page.route(`${API_URL}/purchase-invoices/i1/returnable`, (route) => route.fulfill(ok(returnableOf(2))));
      await page.route(`${API_URL}/purchase-returns/pr1`, (route) =>
        route.fulfill(ok(returnDetail({ status: "POSTED", postedByUser: { id: "u1", username: "admin" } }))),
      );

      // Details: the action button, the lines and the totals; the sticky row button stays on screen.
      await page.goto("/purchase-returns/pr1");
      await expect(bodyRows(page)).toHaveCount(1);
      await expect(page.getByRole("button", { name: "إلغاء المرتجع" })).toBeInViewport();
      await expect(page.getByRole("group", { name: "الإجماليات" })).toContainText("307.80");
      const cardLink = page.getByRole("link", { name: "كارت الصنف — البند 1" });
      await cardLink.scrollIntoViewIfNeeded();
      await expect(cardLink).toBeInViewport({ ratio: 1 });

      // Linked form: the quantity input and "الكل" can be reached.
      await page.goto("/purchase-returns/new?invoice=i1");
      await expect(bodyRows(page).first()).toContainText("متاح للإرجاع 8");
      const quantity = page.getByLabel("كمية المرتجع — البند 1");
      await quantity.scrollIntoViewIfNeeded();
      await expect(quantity).toBeInViewport({ ratio: 1 });
      await page.getByRole("button", { name: "الكل — البند 1" }).click();
      await expect(quantity).toHaveValue("8");
      await expect(page.getByRole("group", { name: "الإجماليات" })).toContainText("1,231.20");

      // Not-linked form: a long product name; the quantity and the delete button are on screen.
      page.once("dialog", (browserDialog) => browserDialog.accept());
      await page.goto("/purchase-returns/new");
      await page.getByRole("radio", { name: /بدون فاتورة/ }).check();
      await pickSearchOption(page, page.getByRole("combobox", { name: "الصنف — البند 1" }), "معجون", /معجون/);
      await page.getByLabel("الكمية — البند 1").fill("3");
      const deleteLine = page.getByRole("button", { name: "حذف البند رقم 1" });
      await deleteLine.scrollIntoViewIfNeeded();
      await expect(deleteLine).toBeInViewport({ ratio: 1 });
      await expect(page.getByLabel("سعر الوحدة — البند 1")).toBeVisible();
    });
  });
});
