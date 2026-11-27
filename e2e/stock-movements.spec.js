// Stock Movements page (حركات المخزون) — every movement, newest first, paginated, with filters.
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// beforeEach creates a branch, a warehouse, a category, a unit and a product with a unique random tag,
// then the story (one movement per step, through /product-inventory):
//   1. OPENING      +100 @ 10   balance 100
//   2. ADJUSTMENT    -10 @ 10   balance 90    reason "جرد"
//   3. ADJUSTMENT      0 @ 12   balance 90    reason "إعادة تقييم"  (cost only)
//   4. ADJUSTMENT    -90 @ 12   balance 0     reason "حذف الصنف من المخزن" (remove from the warehouse)
// Other spec files write movements at the same time, so every check filters on the test product.
// Movements are never deleted (backend rule): they stay attached to the soft-deleted test product.
//
// Dates are typed DD/MM/YYYY (DateInput). movementDate is a date-time, so a day filter sends the LOCAL (Cairo)
// day boundaries (utils/dates.js): these tests run in the Africa/Cairo time zone.
//
// "mocked API" tests fake the endpoints with page.route (no backend needed): pagination, empty states,
// errors, the exact day boundaries sent, the overflow fade of the table and display details.
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
  expectStackedCell,
  API_URL,
  API_DOWN_MESSAGE,
} from "./helpers";

const DATE_RANGE_ERROR = "تاريخ البداية بعد تاريخ النهاية";
// Line 1 of the date cell: "25 نوفمبر 2026"; line 2: "8:03 م · بواسطة admin".
const ANY_DAY = /^\d{1,2} \S+ \d{4}$/;
const TIME_BY_ADMIN = /^\d{1,2}:\d{2} [صم] · بواسطة admin$/;

test.use({ timezoneId: "Africa/Cairo" });

function productLabel(product) {
  return `${product.name} (${product.code})`;
}

function bodyRows(page) {
  return page.locator("tbody tr");
}

// Every cell of a list row (6 columns + the row action, secondary info stacked under the main value):
//   date (+ "<time> · بواسطة admin") · product (+ code) · warehouse · type (+ note: document number / reason) ·
//   quantity (+ cost line) · balance after · action (icon only → "").
// note: null = no second line under the badge.
async function expectMovementRow(row, { product, warehouse, type, note = null, quantity, costLine, balance }) {
  const cells = row.getByRole("cell");
  await expect(cells).toHaveCount(7);
  await expectStackedCell(cells.nth(0), ANY_DAY, TIME_BY_ADMIN);
  await expectStackedCell(cells.nth(1), product.name, product.code);
  await expect(cells.nth(2)).toHaveText(warehouse);
  await expectStackedCell(cells.nth(3), type, note);
  await expectStackedCell(cells.nth(4), quantity, costLine);
  await expect(cells.nth(5)).toHaveText(balance);
  await expect(cells.nth(6)).toHaveText("");
}

// "2026-11-25" → "2026-11-24" (days = -1).
function shiftDay(day, days) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// "2026-11-25" → "25/11/2026" (what the user types in a DateInput).
function typed(day) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

// The Cairo calendar day of a moment: "2026-11-24T23:30:00.000Z" → "2026-11-25".
function cairoDay(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date(iso));
}

// The start / end of a day in the page's time zone (Cairo), as the page must send them.
function dayBoundaries(page, day) {
  return page.evaluate((value) => {
    const [year, month, date] = value.split("-").map(Number);
    return {
      dateFrom: new Date(year, month - 1, date).toISOString(),
      dateTo: new Date(year, month - 1, date, 23, 59, 59, 999).toISOString(),
    };
  }, day);
}

// Collects the query string of every GET /stock-movements (list) request.
function recordListRequests(page) {
  const sent = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.origin === API_URL && url.pathname === "/stock-movements") sent.push(Object.fromEntries(url.searchParams));
  });
  return sent;
}

test.describe("with backend", () => {
  let token;
  let tag;
  let branch;
  let inventory;
  let category;
  let unit;
  let product;
  let movementDay; // "YYYY-MM-DD": the Cairo day of the test movements

  const headers = () => ({ Authorization: `Bearer ${token}` });

  async function callApi(request, method, path, data) {
    const response = await request.fetch(`${API_URL}${path}`, { method, headers: headers(), data });
    const details = response.ok() ? "" : ` (${response.status()} ${await response.text()})`;
    expect(response.ok(), `${method} ${path} failed${details}`).toBeTruthy();
    return method === "DELETE" ? null : (await response.json()).data;
  }

  async function deleteTaggedStock(request) {
    const response = await request.get(`${API_URL}/inventory`, { headers: headers() });
    const inventories = ((await response.json()).data || []).filter((item) => item.name.includes(tag));
    for (const item of inventories) {
      const stockResponse = await request.get(`${API_URL}/product-inventory/inventory/${item.id}`, {
        headers: headers(),
      });
      for (const record of (await stockResponse.json()).data || []) {
        await request.delete(`${API_URL}/product-inventory/${record.id}`, { headers: headers() });
      }
    }
  }

  // Waits until the filter lists and the first page are on screen.
  async function waitForPage(page) {
    await expect(page.getByLabel("الصنف", { exact: true })).toBeVisible();
    await expect(page.getByText("جارٍ تحميل الحركات...")).toBeHidden();
  }

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);

    tag = randomTag();
    const session = await apiLogin(request);
    token = session.access_token;
    branch = await createByApi(request, token, "/branch", { name: `فرع حركات ${tag}`, address: "عنوان" });
    inventory = await createByApi(request, token, `/inventory/branch/${branch.id}`, {
      name: `مخزن حركات ${tag}`,
      address: "عنوان اختبار",
    });
    category = await createByApi(request, token, "/categories", { name: `تصنيف حركات ${tag}` });
    unit = await createByApi(request, token, "/item-unit", { name: `وحدة حركات ${tag}` });
    product = await createByApi(request, token, "/products", {
      name: `صنف حركات ${tag}`,
      categoryId: category.id,
      primaryItemUnitId: unit.id,
      retailPrice: 15,
      wholesalePrice: 12,
      bulkWholesalePrice: 10,
    });

    const record = await callApi(request, "POST", `/product-inventory/inventory/${inventory.id}`, {
      productId: product.id,
      quantity: 100,
      costPrice: 10,
    });
    await callApi(request, "PATCH", `/product-inventory/${record.id}`, { quantity: 90, reason: "جرد" });
    await callApi(request, "PATCH", `/product-inventory/${record.id}`, { costPrice: 12, reason: "إعادة تقييم" });
    await callApi(request, "DELETE", `/product-inventory/${record.id}`);

    const card = await callApi(
      request,
      "GET",
      `/stock-movements/item-card?productId=${product.id}&warehouseId=${inventory.id}`,
    );
    movementDay = cairoDay(card.movements[0].movementDate);

    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;
    await deleteTaggedStock(request);
    await deleteByTag(request, token, "/products", tag);
    await deleteByTag(request, token, "/categories", tag);
    await deleteByTag(request, token, "/item-unit", tag);
    await deleteByTag(request, token, "/inventory", tag);
    await deleteByTag(request, token, "/branch", tag);
    tag = undefined;
  });

  test("Sidebar link (after أرصدة المخزون); product filter: newest first, signed quantities; row link → item card", async ({
    page,
  }) => {
    const sent = recordListRequests(page);
    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link")).toContainText(["أرصدة المخزون", "حركات المخزون", "كارت الصنف"]);
    await nav.getByRole("link", { name: "حركات المخزون" }).click();

    await expect(page).toHaveURL(/\/stock-movements$/);
    await expect(page.getByRole("heading", { name: "حركات المخزون" })).toBeVisible();
    await waitForPage(page);
    // First page, nothing else: an empty filter is never sent.
    expect(sent[0]).toEqual({ page: "1", pageSize: "20" });
    await expect(page.getByRole("button", { name: "مسح الفلاتر" })).toHaveCount(0);

    await page.getByLabel("الصنف", { exact: true }).selectOption({ label: productLabel(product) });
    await expect(bodyRows(page)).toHaveCount(4);
    expect(sent.at(-1)).toEqual({ page: "1", pageSize: "20", productId: product.id });
    await expect(page.getByText("إجمالي: 4")).toBeVisible();

    const rows = bodyRows(page);
    const common = { product, warehouse: inventory.name };
    await expectMovementRow(rows.nth(0), {
      ...common,
      type: "تسوية",
      note: "حذف الصنف من المخزن",
      quantity: "-90",
      costLine: "× 12.00 = -1,080.00",
      balance: "0",
    });
    // Quantity 0: "تعديل تكلفة" with the new cost under it.
    await expectMovementRow(rows.nth(1), {
      ...common,
      type: "تسوية",
      note: "إعادة تقييم",
      quantity: "تعديل تكلفة",
      costLine: "التكلفة الجديدة: 12.00",
      balance: "90",
    });
    await expectMovementRow(rows.nth(2), {
      ...common,
      type: "تسوية",
      note: "جرد",
      quantity: "-10",
      costLine: "× 10.00 = -100.00",
      balance: "90",
    });
    // An opening balance has no reason and no document: no second line under the badge.
    await expectMovementRow(rows.nth(3), {
      ...common,
      type: "رصيد افتتاحي",
      quantity: "+100",
      costLine: "× 10.00 = 1,000.00",
      balance: "100",
    });
    // + green (in), − red (out), 0 gray.
    await expect(rows.nth(3).getByText("+100")).toHaveClass(/text-green-700/);
    await expect(rows.nth(2).getByText("-10", { exact: true })).toHaveClass(/text-red-700/);
    await expect(rows.nth(1).getByText("تعديل تكلفة")).toHaveClass(/text-slate-500/);

    await rows.nth(0).getByRole("link", { name: `كارت الصنف: ${product.name}` }).click();
    await expect(page).toHaveURL(new RegExp(`/item-card\\?product=${product.id}&inventory=${inventory.id}$`));
    await expect(page.locator("tbody tr")).toHaveCount(4);
  });

  test("filters: start from the link, type, Cairo-day dates, a bad date range (inline error, nothing sent), مسح الفلاتر", async ({
    page,
  }) => {
    const sent = recordListRequests(page);
    // Starting filters from a link.
    await page.goto(`/stock-movements?product=${product.id}&inventory=${inventory.id}`);
    await waitForPage(page);
    await expect(page.getByLabel("الصنف", { exact: true })).toHaveValue(product.id);
    await expect(page.getByLabel("المخزن", { exact: true })).toHaveValue(inventory.id);
    await expect(bodyRows(page)).toHaveCount(4);
    expect(sent[0]).toEqual({ page: "1", pageSize: "20", productId: product.id, warehouseId: inventory.id });

    // Type: only the opening balance. The first change clears the link's query string.
    await page.getByLabel("نوع الحركة").selectOption({ label: "رصيد افتتاحي" });
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(page).toHaveURL(/\/stock-movements$/);
    expect(sent.at(-1)).toMatchObject({ productId: product.id, warehouseId: inventory.id, type: "OPENING" });
    await page.getByLabel("نوع الحركة").selectOption({ label: "كل الأنواع" });
    await expect(bodyRows(page)).toHaveCount(4);

    // Dates (both inclusive), typed DD/MM/YYYY: the (Cairo) day of the movements keeps them all.
    // The page sends that day's local start and end, and the real backend uses them exactly.
    const dateFrom = page.getByLabel("من تاريخ");
    const dateTo = page.getByLabel("إلى تاريخ");
    await dateFrom.fill(typed(movementDay));
    await dateTo.fill(typed(movementDay));
    const day = await dayBoundaries(page, movementDay);
    await expect.poll(() => sent.at(-1)).toMatchObject({ dateFrom: day.dateFrom, dateTo: day.dateTo });
    await expect(bodyRows(page)).toHaveCount(4);

    // A range that ends before it starts: inline error, nothing is sent, the list stays.
    const countBefore = sent.length;
    await dateTo.fill(typed(shiftDay(movementDay, -1)));
    await expect(page.getByText(DATE_RANGE_ERROR)).toBeVisible();
    await page.waitForTimeout(300);
    expect(sent.length).toBe(countBefore);
    await expect(bodyRows(page)).toHaveCount(4);

    // From the next day on: none.
    await dateTo.fill("");
    await dateFrom.fill(typed(shiftDay(movementDay, 1)));
    await expect(page.getByText(DATE_RANGE_ERROR)).toHaveCount(0);
    await expect(page.getByText("لا توجد حركات تطابق الفلاتر")).toBeVisible();
    const nextDay = await dayBoundaries(page, shiftDay(movementDay, 1));
    expect(sent.at(-1)).toEqual({
      page: "1",
      pageSize: "20",
      productId: product.id,
      warehouseId: inventory.id,
      dateFrom: nextDay.dateFrom,
    });

    // مسح الفلاتر (in the empty state): everything back to "all".
    await page.getByRole("button", { name: "مسح الفلاتر" }).last().click();
    await expect(page.getByLabel("الصنف", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("المخزن", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("نوع الحركة")).toHaveValue("");
    await expect(dateFrom).toHaveValue("");
    await expect(dateTo).toHaveValue("");
    await expect(page.getByRole("button", { name: "مسح الفلاتر" })).toHaveCount(0);
    await expect.poll(() => sent.at(-1)).toEqual({ page: "1", pageSize: "20" });
    await expect(bodyRows(page).first()).toBeVisible();
  });
});

test.describe("mocked API", () => {
  const CORS = { "Access-Control-Allow-Origin": "*" };
  const DATES = { createdAt: "2026-11-21T10:00:00.000Z", updatedAt: "2026-11-21T10:00:00.000Z", deletedAt: null };
  const BRANCH = { id: "b1", code: "branch-000001", name: "فرع المعادي", address: null, ...DATES };
  const UNIT = { id: "u1", code: "unit-000001", name: "قطعة", ...DATES };
  const BRUSH = product("p1", "فرشة");
  const SERVICE = { ...product("p9", "خدمة توصيل"), itemType: "SERVICE" };
  const WAREHOUSE = { id: "w1", name: "مخزن المعادي", branchId: BRANCH.id, address: null, ...DATES };
  const USER = { id: "user1", username: "admin" };

  function product(id, name) {
    return { id, code: `PRD-${id}`, name, itemType: "STOCK", primaryItemUnitId: UNIT.id, primaryItemUnit: UNIT, ...DATES };
  }

  function movement(id, extra = {}) {
    return {
      id,
      movementDate: "2026-11-24T10:00:00.000Z",
      type: "OPENING",
      productId: BRUSH.id,
      warehouseId: WAREHOUSE.id,
      quantity: "100",
      unitCost: "10",
      totalCost: "1000",
      balanceAfter: "100",
      avgCostAfter: "10",
      sourceType: null,
      sourceId: null,
      sourceLineId: null,
      sourceCode: null,
      reason: null,
      createdBy: USER.id,
      createdDate: "2026-11-24T10:00:00.000Z",
      product: { id: BRUSH.id, code: BRUSH.code, name: BRUSH.name },
      warehouse: { id: WAREHOUSE.id, name: WAREHOUSE.name },
      createdByUser: USER,
      ...extra,
    };
  }

  const API_PATHS = {};
  function apiPath(path) {
    API_PATHS[path] ??= (url) => url.origin === API_URL && url.pathname === path;
    return API_PATHS[path];
  }
  function mockGet(page, path, status, body) {
    return page.route(apiPath(path), (route) => route.fulfill({ status, json: body, headers: CORS }));
  }
  function apiError(statusCode, code, field = null) {
    return { statusCode, message: "error", error: "Error", code, field };
  }

  async function mockLists(page) {
    await mockGet(page, "/products", 200, { message: "ok", data: [BRUSH, SERVICE] });
    await mockGet(page, "/inventory", 200, { message: "ok", data: [WAREHOUSE] });
    await mockGet(page, "/branch", 200, { message: "ok", data: [BRANCH] });
  }

  // Answers GET /stock-movements with the right slice of `all` for the requested page / pageSize
  // (filters are not applied: the tests check what was SENT).
  function mockMovements(page, all) {
    return page.route(apiPath("/stock-movements"), (route) => {
      const params = new URL(route.request().url()).searchParams;
      const pageNumber = Number(params.get("page"));
      const pageSize = Number(params.get("pageSize"));
      const items = all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
      const meta = { page: pageNumber, pageSize, total: all.length, totalPages: Math.ceil(all.length / pageSize) };
      return route.fulfill({ json: { message: "ok", data: { items, meta } }, headers: CORS });
    });
  }

  async function openPage(page, movements, url = "/stock-movements") {
    await setFakeSession(page);
    await mockLists(page);
    await mockMovements(page, movements);
    await page.goto(url);
  }

  test("rows: signed quantities, cost line, cost only, document number, badges, Arabic reason; STOCK-only filter", async ({
    page,
  }) => {
    await openPage(page, [
      movement("m1", {
        type: "PURCHASE_RETURN",
        quantity: "-24",
        unitCost: "10.6818",
        totalCost: "-256.36",
        balanceAfter: "196",
        sourceType: "PR",
        sourceId: "pr1",
        sourceCode: "PR-2026-000001",
      }),
      movement("m2", {
        type: "PURCHASE",
        quantity: "1200.5",
        unitCost: "11.25",
        totalCost: "13505.63",
        balanceAfter: "1300.5",
        sourceType: "PI",
        sourceId: "pi1",
        sourceCode: "PI-2026-000001",
      }),
      movement("m3", { type: "ADJUSTMENT", quantity: "0", unitCost: "12", totalCost: "0", reason: "إعادة تقييم" }),
      movement("m4", { reason: "Week 1 opening balance" }),
    ]);

    const rows = bodyRows(page);
    await expect(rows).toHaveCount(4);
    const common = { product: BRUSH, warehouse: WAREHOUSE.name };
    // The document number sits under the type badge.
    await expectMovementRow(rows.nth(0), {
      ...common,
      type: "مرتجع شراء",
      note: "PR-2026-000001",
      quantity: "-24",
      costLine: "× 10.6818 = -256.36",
      balance: "196",
    });
    await expectMovementRow(rows.nth(1), {
      ...common,
      type: "شراء",
      note: "PI-2026-000001",
      quantity: "+1,200.5",
      costLine: "× 11.25 = 13,505.63",
      balance: "1,300.5",
    });
    await expectMovementRow(rows.nth(2), {
      ...common,
      type: "تسوية",
      note: "إعادة تقييم",
      quantity: "تعديل تكلفة",
      costLine: "التكلفة الجديدة: 12.00",
      balance: "100",
    });
    // The old English reason of Week 1 stock is shown in Arabic.
    await expectMovementRow(rows.nth(3), {
      ...common,
      type: "رصيد افتتاحي",
      note: "رصيد افتتاحي",
      quantity: "+100",
      costLine: "× 10.00 = 1,000.00",
      balance: "100",
    });
    await expect(page.getByText("Week 1 opening balance")).toHaveCount(0);
    // The purchase invoice number links to the invoice, the return number to the return.
    await expect(rows.nth(1).getByRole("link", { name: "PI-2026-000001" })).toHaveAttribute("href", "/purchase-invoices/pi1");
    await expect(rows.nth(0).getByRole("cell").nth(3).getByRole("link", { name: "PR-2026-000001" })).toHaveAttribute(
      "href",
      "/purchase-returns/pr1",
    );

    // Badges: out = red, in = green, تسوية = neutral.
    await expect(rows.nth(0).getByText("مرتجع شراء")).toHaveClass(/bg-red-50/);
    await expect(rows.nth(1).getByText("شراء", { exact: true })).toHaveClass(/bg-green-50/);
    await expect(rows.nth(2).getByText("تسوية", { exact: true })).toHaveClass(/bg-slate-100/);
    // The minus stays on the left in RTL (quantity and cost line are LTR).
    await expect(rows.nth(0).getByText("-24", { exact: true })).toHaveAttribute("dir", "ltr");
    await expect(rows.nth(0).getByText("× 10.6818 = -256.36")).toHaveAttribute("dir", "ltr");

    // Filters: SERVICE products have no movements; warehouses read "<warehouse> — <branch>".
    await expect(page.getByLabel("الصنف", { exact: true }).locator("option")).toHaveText([
      "كل الأصناف",
      "فرشة (PRD-p1)",
    ]);
    await expect(page.getByLabel("المخزن", { exact: true }).locator("option")).toHaveText([
      "كل المخازن",
      "مخزن المعادي — فرع المعادي",
    ]);
    await expect(page.getByLabel("نوع الحركة").locator("option")).toHaveText([
      "كل الأنواع",
      "رصيد افتتاحي",
      "تسوية",
      "شراء",
      "إلغاء فاتورة شراء",
      "مرتجع شراء",
      "إلغاء مرتجع شراء",
    ]);
  });

  test('dates: "25/11/2026" sends the Cairo day boundaries; a movement at 01:30 Cairo shows on the 25th', async ({
    page,
  }) => {
    const sent = recordListRequests(page);
    // 23:30 UTC on the 24th = 01:30 on the 25th in Cairo (UTC+2).
    await openPage(page, [movement("m1", { movementDate: "2026-11-24T23:30:00.000Z" })]);
    await expect(bodyRows(page)).toHaveCount(1);
    await expectStackedCell(bodyRows(page).first().getByRole("cell").nth(0), "25 نوفمبر 2026", "1:30 ص · بواسطة admin");

    await page.getByLabel("من تاريخ").fill("25/11/2026");
    await page.getByLabel("إلى تاريخ").fill("25/11/2026");
    // NOT the plain "2026-11-25" (the backend would read it as a UTC day and miss this movement).
    await expect.poll(() => sent.at(-1)).toEqual({
      page: "1",
      pageSize: "20",
      dateFrom: "2026-11-24T22:00:00.000Z",
      dateTo: "2026-11-25T21:59:59.999Z",
    });
    // The fields keep showing the day the user typed.
    await expect(page.getByLabel("من تاريخ")).toHaveValue("25/11/2026");
    await expect(page.getByLabel("إلى تاريخ")).toHaveValue("25/11/2026");
  });

  test("dates: a half-typed or impossible date is not sent; مسح الفلاتر clears it", async ({ page }) => {
    const sent = recordListRequests(page);
    await openPage(page, [movement("m1")]);
    await expect(bodyRows(page)).toHaveCount(1);
    const countBefore = sent.length;

    const dateFrom = page.getByLabel("من تاريخ");
    await dateFrom.pressSequentially("3102");
    await expect(dateFrom).toHaveValue("31/02/");
    await dateFrom.pressSequentially("2026");
    await expect(page.getByText("تاريخ غير صحيح")).toBeVisible();
    await page.waitForTimeout(300);
    expect(sent.length).toBe(countBefore);

    await page.getByRole("button", { name: "مسح الفلاتر" }).click();
    await expect(dateFrom).toHaveValue("");
    await expect(page.getByText("تاريخ غير صحيح")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "مسح الفلاتر" })).toHaveCount(0);
  });

  test("pagination: several pages, page size change keeps the filters, last page", async ({ page }) => {
    const all = Array.from({ length: 45 }, (_, index) => movement(`m${index + 1}`, { reason: `سبب ${index + 1}` }));
    const sent = recordListRequests(page);
    await openPage(page, all);

    await expect(bodyRows(page)).toHaveCount(20);
    await expect(page.getByText("إجمالي: 45")).toBeVisible();
    await expect(page.getByText("صفحة 1 من 3")).toBeVisible();
    await expect(page.getByRole("button", { name: "السابق" })).toBeDisabled();

    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.getByText("صفحة 2 من 3")).toBeVisible();
    await expect(bodyRows(page).first()).toContainText("سبب 21");
    expect(sent.at(-1)).toEqual({ page: "2", pageSize: "20" });

    // A filter goes back to page 1.
    await page.getByLabel("نوع الحركة").selectOption("ADJUSTMENT");
    await expect(page.getByText("صفحة 1 من 3")).toBeVisible();
    expect(sent.at(-1)).toEqual({ page: "1", pageSize: "20", type: "ADJUSTMENT" });

    // Page size 50: page 1, the filter is kept.
    await page.getByLabel("عدد الصفوف في الصفحة").selectOption("50");
    await expect(page.getByText("صفحة 1 من 1")).toBeVisible();
    await expect(bodyRows(page)).toHaveCount(45);
    expect(sent.at(-1)).toEqual({ page: "1", pageSize: "50", type: "ADJUSTMENT" });

    // Back to 20 and on to the last page: 5 rows, التالي disabled.
    await page.getByLabel("عدد الصفوف في الصفحة").selectOption("20");
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.getByText("صفحة 3 من 3")).toBeVisible();
    await expect(bodyRows(page)).toHaveCount(5);
    await expect(bodyRows(page).first()).toContainText("سبب 41");
    await expect(page.getByRole("button", { name: "التالي" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "السابق" })).toBeEnabled();
    expect(sent.at(-1)).toEqual({ page: "3", pageSize: "20", type: "ADJUSTMENT" });
  });

  test("the table fits at 1280 wide; at 1024 it scrolls and a fade marks the side with hidden columns", async ({
    page,
  }) => {
    const long = { name: "مخزن رئيسي طويل الاسم جدًا للتجربة" };
    const rows = Array.from({ length: 3 }, (_, index) =>
      movement(`m${index + 1}`, {
        type: "PURCHASE",
        quantity: "1200.5",
        unitCost: "10.6818",
        totalCost: "12823.51",
        balanceAfter: "123456.789",
        sourceCode: "PI-2026-000123",
        product: { id: BRUSH.id, code: BRUSH.code, name: "صنف باسم طويل جدًا للتأكد من التفاف النص في الجدول" },
        warehouse: { id: WAREHOUSE.id, ...long },
      }),
    );
    await page.setViewportSize({ width: 1280, height: 720 });
    await openPage(page, rows);
    await expect(bodyRows(page)).toHaveCount(3);

    const box = page.locator("table").locator("xpath=..");
    const startFade = page.locator('[data-overflow-fade="start"]');
    const endFade = page.locator('[data-overflow-fade="end"]');
    // 1280: everything fits (long names wrap), no fade.
    expect(await box.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    await expect(startFade).toHaveCount(0);
    await expect(endFade).toHaveCount(0);

    // 1024: the table scrolls; in RTL the hidden columns are on the left (the "end" side).
    await page.setViewportSize({ width: 1024, height: 720 });
    await expect(endFade).toBeVisible();
    await expect(startFade).toHaveCount(0);
    const endBox = await endFade.boundingBox();
    const tableBox = await box.boundingBox();
    // On the left, just before the sticky actions column (which stays at the left edge).
    const stickyBox = await page.locator("th[data-sticky-actions]").boundingBox();
    expect(stickyBox.x).toBeLessThan(tableBox.x + 5);
    expect(Math.abs(endBox.x - (stickyBox.x + stickyBox.width))).toBeLessThan(2);

    // Scrolled all the way: the hidden columns are now on the right ("start").
    await box.evaluate((el) => el.scrollTo({ left: -el.scrollWidth }));
    await expect(startFade).toBeVisible();
    await expect(endFade).toHaveCount(0);
    const startBox = await startFade.boundingBox();
    expect(startBox.x + startBox.width).toBeGreaterThan(tableBox.x + tableBox.width - 5); // on the right edge

    // Half way: both sides.
    await box.evaluate((el) => el.scrollTo({ left: -(el.scrollWidth - el.clientWidth) / 2 }));
    await expect(startFade).toBeVisible();
    await expect(endFade).toBeVisible();

    // Wide again: it fits, no fade.
    await page.setViewportSize({ width: 1600, height: 900 });
    await expect(startFade).toHaveCount(0);
    await expect(endFade).toHaveCount(0);
  });

  test("a deleted product / warehouse from a link stays visible as the chosen filter", async ({ page }) => {
    const gone = { id: "old", code: "PRD-OLD", name: "صنف قديم" };
    await openPage(
      page,
      [movement("m1", { productId: gone.id, product: gone, warehouseId: "w-old", warehouse: { id: "w-old", name: "مخزن قديم" } })],
      "/stock-movements?product=old&inventory=w-old",
    );

    const productSelect = page.getByLabel("الصنف", { exact: true });
    await expect(productSelect).toHaveValue("old");
    await expect(productSelect.locator("option:checked")).toHaveText("صنف قديم (PRD-OLD) (محذوف)");
    await expect(productSelect).toHaveClass(/text-slate-400/);
    const inventorySelect = page.getByLabel("المخزن", { exact: true });
    await expect(inventorySelect).toHaveValue("w-old");
    await expect(inventorySelect.locator("option:checked")).toHaveText("مخزن قديم (محذوف)");
  });

  test("empty: no movements at all / none for the filters (+ مسح الفلاتر)", async ({ page }) => {
    await openPage(page, []);

    await expect(page.getByText("لا توجد حركات", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "مسح الفلاتر" })).toHaveCount(0);
    await expect(page.locator("table")).toHaveCount(0);

    await page.getByLabel("الصنف", { exact: true }).selectOption("p1");
    await expect(page.getByText("لا توجد حركات تطابق الفلاتر")).toBeVisible();
    // One in the filters box, one in the empty state.
    await expect(page.getByRole("button", { name: "مسح الفلاتر" })).toHaveCount(2);
    await page.getByRole("button", { name: "مسح الفلاتر" }).last().click();
    await expect(page.getByText("لا توجد حركات", { exact: true })).toBeVisible();
    await expect(page.getByLabel("الصنف", { exact: true })).toHaveValue("");
  });

  test.describe("API errors", () => {
    test.use({ allowedConsoleErrors: [/status of (400|500)/] });

    test("400 VALIDATION_FAILED from a filter → Arabic message, the filters stay", async ({ page }) => {
      await setFakeSession(page);
      await mockLists(page);
      await page.route(apiPath("/stock-movements"), (route) => {
        const params = new URL(route.request().url()).searchParams;
        if (params.get("dateFrom")) {
          return route.fulfill({ status: 400, json: apiError(400, "VALIDATION_FAILED", "dateFrom"), headers: CORS });
        }
        const meta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
        return route.fulfill({ json: { message: "ok", data: { items: [movement("m1")], meta } }, headers: CORS });
      });
      await page.goto("/stock-movements");
      await expect(bodyRows(page)).toHaveCount(1);

      await page.getByLabel("من تاريخ").fill("01/11/2026");
      await expect(page.getByText("البيانات المدخلة غير صحيحة، راجع حقل من تاريخ")).toBeVisible();
      await expect(page.getByLabel("من تاريخ")).toHaveValue("01/11/2026");
      await expect(page.getByRole("heading", { name: "حركات المخزون" })).toBeVisible();

      await page.getByRole("button", { name: "مسح الفلاتر" }).click();
      await expect(bodyRows(page)).toHaveCount(1);
    });

    test("server error on the list → retry loads it", async ({ page }) => {
      await setFakeSession(page);
      await mockLists(page);
      await mockGet(page, "/stock-movements", 500, apiError(500, "INTERNAL_ERROR"));
      await page.goto("/stock-movements");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();
      await page.unroute(apiPath("/stock-movements"));
      await mockMovements(page, [movement("m1")]);
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();
      await expect(bodyRows(page)).toHaveCount(1);
    });

    test("server error on the filter lists → retry shows the filters", async ({ page }) => {
      await setFakeSession(page);
      await mockLists(page);
      await mockMovements(page, [movement("m1")]);
      await mockGet(page, "/inventory", 500, apiError(500, "INTERNAL_ERROR"));
      await page.goto("/stock-movements");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();
      await expect(page.getByLabel("المخزن", { exact: true })).toHaveCount(0);
      await page.unroute(apiPath("/inventory"));
      await mockGet(page, "/inventory", 200, { message: "ok", data: [WAREHOUSE] });
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();
      await expect(page.getByLabel("المخزن", { exact: true })).toBeVisible();
      await expect(bodyRows(page)).toHaveCount(1);
    });
  });
});
