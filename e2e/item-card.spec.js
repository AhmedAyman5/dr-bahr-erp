// Item Card page (كارت الصنف) — every movement of one product in one warehouse, oldest first.
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// beforeEach creates a branch, a warehouse, a category, a unit and a product with a unique random tag.
// The story (each step writes one stock movement, through /product-inventory):
//   1. OPENING      +100 @ 10   balance 100                       (add to the warehouse)
//   2. ADJUSTMENT    -10 @ 10   balance 90    reason "جرد"
//   3. ADJUSTMENT      0 @ 12   balance 90    reason "إعادة تقييم"  (cost only)
//   4. ADJUSTMENT    -90 @ 12   balance 0     reason "حذف الصنف من المخزن" (remove from the warehouse)
// Movements are never deleted (backend rule): they stay attached to the soft-deleted test product.
// afterEach cleans up: stock records → products → category / unit → warehouse → branch.
//
// "mocked API" tests fake the endpoints with page.route (no backend needed).
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

const PICK_HINT = "اختر صنفاً ومخزناً لعرض كارت الصنف";
const LOCKED_NOTE = "وكل حركة مسجلة ولا تُعدَّل أو تُحذف";
// Any date-time (formatDateTime): the year is enough here.
const ANY_DATE = /\d{4}/;

function productLabel(product) {
  return `${product.name} (${product.code})`;
}

// The data rows of the table, top to bottom.
function bodyRows(page) {
  return page.locator("tbody tr");
}

// Every cell of a card row (7 columns, secondary info stacked under the main value):
//   date (+ "<time> · بواسطة <user>") · type (+ note: "تعديل تكلفة" for quantity 0 and / or the reason) ·
//   document · وارد · منصرف · balance after · unit cost (+ "المتوسط بعدها: <average after>").
// note: null = no second line under the badge. doc "-" = no document. inQty / outQty "" = empty cell.
async function expectCardRow(row, { type, note = null, doc = "-", inQty = "", outQty = "", balance, cost, avg }) {
  const cells = row.getByRole("cell");
  await expect(cells).toHaveCount(7);
  await expectStackedCell(cells.nth(0), ANY_DATE, /^\d{1,2}:\d{2} [صم] · بواسطة admin$/);
  await expectStackedCell(cells.nth(1), type, note);
  await expect(cells.nth(2)).toHaveText(doc);
  await expect(cells.nth(3)).toHaveText(inQty);
  await expect(cells.nth(4)).toHaveText(outQty);
  await expect(cells.nth(5)).toHaveText(balance);
  await expectStackedCell(cells.nth(6), cost, `المتوسط بعدها: ${avg}`);
}

// A summary card on top: "<label><value>".
async function expectSummary(page, label, value) {
  await expect(page.getByRole("group", { name: label })).toHaveText(`${label}${value}`);
}

test.describe("with backend", () => {
  let token;
  let tag;
  let branch;
  let inventory;
  let category;
  let unit;
  let product;

  const headers = () => ({ Authorization: `Bearer ${token}` });

  async function callApi(request, method, path, data) {
    const response = await request.fetch(`${API_URL}${path}`, { method, headers: headers(), data });
    const details = response.ok() ? "" : ` (${response.status()} ${await response.text()})`;
    expect(response.ok(), `${method} ${path} failed${details}`).toBeTruthy();
    return method === "DELETE" ? null : (await response.json()).data;
  }

  // Steps 1–3 of the story, + step 4 when remove = true.
  async function buildStory(request, { remove = false } = {}) {
    const record = await callApi(request, "POST", `/product-inventory/inventory/${inventory.id}`, {
      productId: product.id,
      quantity: 100,
      costPrice: 10,
    });
    await callApi(request, "PATCH", `/product-inventory/${record.id}`, { quantity: 90, reason: "جرد" });
    await callApi(request, "PATCH", `/product-inventory/${record.id}`, { costPrice: 12, reason: "إعادة تقييم" });
    if (remove) await callApi(request, "DELETE", `/product-inventory/${record.id}`);
    return record;
  }

  // Stock records have no name: remove every record of every tagged warehouse.
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

  function cardUrl() {
    return `/item-card?product=${product.id}&inventory=${inventory.id}`;
  }

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);

    tag = randomTag();
    const session = await apiLogin(request);
    token = session.access_token;
    branch = await createByApi(request, token, "/branch", { name: `فرع كارت ${tag}`, address: "عنوان" });
    inventory = await createByApi(request, token, `/inventory/branch/${branch.id}`, {
      name: `مخزن كارت ${tag}`,
      address: "عنوان اختبار",
    });
    category = await createByApi(request, token, "/categories", { name: `تصنيف كارت ${tag}` });
    unit = await createByApi(request, token, "/item-unit", { name: `وحدة كارت ${tag}` });
    product = await createByApi(request, token, "/products", {
      name: `صنف كارت ${tag}`,
      categoryId: category.id,
      primaryItemUnitId: unit.id,
      retailPrice: 15,
      wholesalePrice: 12,
      bulkWholesalePrice: 10,
    });
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

  test("Sidebar link (after حركات المخزون); nothing chosen → hint; choosing both shows the card; URL + reload keep it", async ({
    page,
    request,
  }) => {
    await callApi(request, "POST", `/product-inventory/inventory/${inventory.id}`, {
      productId: product.id,
      quantity: 5,
      costPrice: 2,
    });

    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link")).toContainText(["أرصدة المخزون", "حركات المخزون", "كارت الصنف"]);
    await nav.getByRole("link", { name: "كارت الصنف" }).click();

    await expect(page).toHaveURL(/\/item-card$/);
    await expect(page.getByRole("heading", { name: "كارت الصنف", level: 1 })).toBeVisible();
    await expect(page.getByText(PICK_HINT)).toBeVisible();

    const productSelect = page.getByLabel("الصنف", { exact: true });
    const inventorySelect = page.getByLabel("المخزن", { exact: true });
    // SERVICE products have no stock: only STOCK ones are listed.
    await productSelect.selectOption({ label: productLabel(product) });
    await expect(page).toHaveURL(new RegExp(`/item-card\\?product=${product.id}$`));
    await expect(page.getByText(PICK_HINT)).toBeVisible();

    await inventorySelect.selectOption({ label: `${inventory.name} — ${branch.name}` });
    await expect(page).toHaveURL(new RegExp(`/item-card\\?product=${product.id}&inventory=${inventory.id}$`));
    await expect(bodyRows(page)).toHaveCount(1);
    await expectSummary(page, "الرصيد الحالي", `5 ${unit.name}`);

    await page.reload();
    await expect(page.getByLabel("الصنف", { exact: true })).toHaveValue(product.id);
    await expect(page.getByLabel("المخزن", { exact: true })).toHaveValue(inventory.id);
    await expect(bodyRows(page)).toHaveCount(1);
    await expectCardRow(bodyRows(page).first(), { type: "رصيد افتتاحي", inQty: "5", balance: "5", cost: "2.00", avg: "2.00" });
  });

  test("the card: oldest first, وارد / منصرف / الرصيد per row, the cost-only row, summary; then removal → balance 0", async ({
    page,
    request,
  }) => {
    await buildStory(request);
    await page.goto(cardUrl());

    const title = page.getByRole("heading", { level: 2 });
    await expect(title).toContainText(product.name);
    await expect(title).toContainText(product.code);
    await expect(title).toContainText(inventory.name);
    await expect(title).not.toContainText("محذوف");
    await expect(page.getByText(`الكميات بالـ${unit.name}، ${LOCKED_NOTE}`)).toBeVisible();

    await expect(bodyRows(page)).toHaveCount(3);
    const rows = bodyRows(page);
    await expectCardRow(rows.nth(0), { type: "رصيد افتتاحي", inQty: "100", balance: "100", cost: "10.00", avg: "10.00" });
    await expectCardRow(rows.nth(1), { type: "تسوية", note: "جرد", outQty: "10", balance: "90", cost: "10.00", avg: "10.00" });
    // Quantity 0: no وارد / منصرف, the type cell says "تعديل تكلفة".
    await expectCardRow(rows.nth(2), { type: "تسوية", note: "تعديل تكلفة · إعادة تقييم", balance: "90", cost: "12.00", avg: "12.00" });

    await expectSummary(page, "الرصيد الحالي", `90 ${unit.name}`);
    await expectSummary(page, "متوسط التكلفة", "12.00");
    await expectSummary(page, "قيمة المخزون", "1,080.00"); // 90 × 12
    await expectSummary(page, "إجمالي الوارد", `100 ${unit.name}`);
    await expectSummary(page, "إجمالي المنصرف", `10 ${unit.name}`);
    await expect(page.getByText("الرصيد لا يطابق آخر حركة")).toHaveCount(0);

    // Remove from the warehouse: the stock goes to 0 with one more movement.
    const stock = await callApi(request, "GET", `/product-inventory/inventory/${inventory.id}`);
    await callApi(request, "DELETE", `/product-inventory/${stock[0].id}`);
    await page.reload();

    await expect(bodyRows(page)).toHaveCount(4);
    await expectCardRow(bodyRows(page).nth(3), { type: "تسوية", note: "حذف الصنف من المخزن", outQty: "90", balance: "0", cost: "12.00", avg: "12.00" });
    await expectSummary(page, "الرصيد الحالي", `0 ${unit.name}`);
    await expectSummary(page, "قيمة المخزون", "0.00");
    await expectSummary(page, "إجمالي الوارد", `100 ${unit.name}`);
    await expectSummary(page, "إجمالي المنصرف", `100 ${unit.name}`);
  });

  test("أرصدة المخزون → كارت الصنف (before تسوية) opens the card of that product in that warehouse", async ({
    page,
    request,
  }) => {
    await buildStory(request);
    await page.goto(`/stock?inventory=${inventory.id}`);

    const row = page.getByRole("row").filter({ hasText: product.name });
    const actions = row.getByRole("cell").last();
    await expect(actions.locator("a, button").first()).toHaveAttribute("title", "كارت الصنف");
    await expect(actions.locator("a, button").nth(1)).toHaveAttribute("title", "تسوية الرصيد");
    await row.getByRole("link", { name: `كارت الصنف: ${product.name}` }).click();

    await expect(page).toHaveURL(new RegExp(`/item-card\\?product=${product.id}&inventory=${inventory.id}$`));
    await expect(page.getByLabel("الصنف", { exact: true })).toHaveValue(product.id);
    await expect(page.getByLabel("المخزن", { exact: true })).toHaveValue(inventory.id);
    await expect(bodyRows(page)).toHaveCount(3);
    await expectSummary(page, "الرصيد الحالي", `90 ${unit.name}`);
  });

  test("a deleted product from a link still shows its card, marked (محذوف)", async ({ page, request }) => {
    await buildStory(request, { remove: true });
    await callApi(request, "DELETE", `/products/${product.id}`);
    await page.goto(cardUrl());

    const productSelect = page.getByLabel("الصنف", { exact: true });
    await expect(productSelect).toHaveValue(product.id);
    await expect(productSelect.locator("option:checked")).toHaveText(`${productLabel(product)} (محذوف)`);
    await expect(productSelect).toHaveClass(/text-slate-400/);
    await expect(page.getByLabel("المخزن", { exact: true })).toHaveValue(inventory.id);

    const title = page.getByRole("heading", { level: 2 });
    await expect(title).toContainText(product.name);
    await expect(title.getByText("(محذوف)")).toHaveClass(/text-slate-400/);
    // The unit of a deleted product is not known any more.
    await expect(page.getByText(`الكميات بالوحدة الأساسية للصنف، ${LOCKED_NOTE}`)).toBeVisible();
    await expect(bodyRows(page)).toHaveCount(4);
    await expectSummary(page, "الرصيد الحالي", "0");
    await expectSummary(page, "إجمالي الوارد", "100");
  });
});

test.describe("mocked API", () => {
  const CORS = { "Access-Control-Allow-Origin": "*" };
  const DATES = { createdAt: "2026-11-21T10:00:00.000Z", updatedAt: "2026-11-21T10:00:00.000Z", deletedAt: null };
  const BRANCH = { id: "b1", code: "branch-000001", name: "فرع المعادي", address: null, ...DATES };
  const UNIT = { id: "u1", code: "unit-000001", name: "قطعة", ...DATES };
  const BRUSH = product("p1", "فرشة");
  const OTHER = product("p2", "مشط");
  const WAREHOUSE = { id: "w1", name: "مخزن المعادي", branchId: BRANCH.id, address: null, ...DATES };
  const USER = { id: "user1", username: "admin" };

  function product(id, name) {
    return {
      id,
      code: `PRD-${id}`,
      name,
      barcode: null,
      itemType: "STOCK",
      primaryItemUnitId: UNIT.id,
      primaryItemUnit: UNIT,
      ...DATES,
    };
  }

  let movementCount = 0;
  function movement(type, quantity, unitCost, totalCost, balanceAfter, avgCostAfter, extra = {}) {
    movementCount += 1;
    return {
      id: `m${movementCount}`,
      movementDate: `2026-11-2${movementCount % 10}T10:00:00.000Z`,
      type,
      productId: BRUSH.id,
      warehouseId: WAREHOUSE.id,
      quantity,
      unitCost,
      totalCost,
      balanceAfter,
      avgCostAfter,
      sourceType: null,
      sourceId: null,
      sourceLineId: null,
      sourceCode: null,
      reason: null,
      createdBy: USER.id,
      createdDate: "2026-11-24T10:00:00.000Z",
      createdByUser: USER,
      ...extra,
    };
  }

  function card(quantity, avgCost, movements) {
    return {
      product: { id: BRUSH.id, code: BRUSH.code, name: BRUSH.name },
      warehouse: { id: WAREHOUSE.id, name: WAREHOUSE.name },
      quantity,
      avgCost,
      movements,
    };
  }

  // The brush example of ../backend/doc/week2/week2flow.txt, step 16 (5 rows, quantity 218).
  const BRUSH_CARD = card("218", "10.6818", [
    movement("OPENING", "100", "10", "1000", "100", "10"),
    movement("PURCHASE", "120", "11.25", "1350", "220", "10.6818", {
      sourceType: "PI",
      sourceId: "pi1",
      sourceCode: "PI-2026-000001",
    }),
    movement("PURCHASE_RETURN", "-24", "10.6818", "-256.36", "196", "10.6818", {
      sourceType: "PR",
      sourceId: "pr1",
      sourceCode: "PR-2026-000001",
    }),
    movement("PURCHASE_RETURN_CANCEL", "24", "10.6818", "256.36", "220", "10.6818", {
      sourceType: "PR",
      sourceId: "pr1",
      sourceCode: "PR-2026-000001",
    }),
    movement("ADJUSTMENT", "-2", "10.6818", "-21.36", "218", "10.6818", { reason: "جرد" }),
  ]);

  const API_PATHS = {};
  function apiPath(path) {
    API_PATHS[path] ??= (url) => url.origin === API_URL && url.pathname === path;
    return API_PATHS[path];
  }
  function mockGet(page, path, status, body) {
    return page.route(apiPath(path), (route) => route.fulfill({ status, json: body, headers: CORS }));
  }
  function mockOk(page, path, data) {
    return mockGet(page, path, 200, { message: "ok", data });
  }
  function apiError(statusCode, code, field = null) {
    return { statusCode, message: "error", error: "Error", code, field };
  }

  async function mockLists(page, { products = [BRUSH, OTHER], inventories = [WAREHOUSE] } = {}) {
    await mockOk(page, "/products", products);
    await mockOk(page, "/inventory", inventories);
    await mockOk(page, "/branch", [BRANCH]);
  }

  async function openCard(page, cardData, url = "/item-card?product=p1&inventory=w1") {
    await setFakeSession(page);
    await mockLists(page);
    await mockOk(page, "/stock-movements/item-card", cardData);
    await page.goto(url);
  }

  test("the brush card of week2flow step 16: 5 rows, document numbers, badge colors, summary (218)", async ({
    page,
  }) => {
    const requests = [];
    page.on("request", (req) => {
      if (req.url().includes("/stock-movements/item-card")) requests.push(req.url());
    });
    await openCard(page, BRUSH_CARD);

    await expect(bodyRows(page)).toHaveCount(5);
    // Exactly the two documented params. (React StrictMode loads twice in dev, so count unique URLs.)
    expect([...new Set(requests)]).toEqual([`${API_URL}/stock-movements/item-card?productId=p1&warehouseId=w1`]);
    const rows = bodyRows(page);
    await expectCardRow(rows.nth(0), { type: "رصيد افتتاحي", inQty: "100", balance: "100", cost: "10.00", avg: "10.00" });
    await expectCardRow(rows.nth(1), { type: "شراء", doc: "PI-2026-000001", inQty: "120", balance: "220", cost: "11.25", avg: "10.6818" });
    await expectCardRow(rows.nth(2), { type: "مرتجع شراء", doc: "PR-2026-000001", outQty: "24", balance: "196", cost: "10.6818", avg: "10.6818" });
    await expectCardRow(rows.nth(3), { type: "إلغاء مرتجع شراء", doc: "PR-2026-000001", inQty: "24", balance: "220", cost: "10.6818", avg: "10.6818" });
    await expectCardRow(rows.nth(4), { type: "تسوية", note: "جرد", outQty: "2", balance: "218", cost: "10.6818", avg: "10.6818" });

    // Document numbers: a purchase invoice is a link to it; a purchase return is plain text (no page yet).
    await expect(rows.nth(1).getByRole("link", { name: "PI-2026-000001" })).toHaveAttribute("href", "/purchase-invoices/pi1");
    await expect(rows.nth(2).getByRole("link")).toHaveCount(0);
    await expect(rows.nth(0).getByRole("link")).toHaveCount(0);

    // Badge colors: stock in = green, stock out = red, تسوية = neutral gray.
    await expect(rows.nth(1).getByText("شراء", { exact: true })).toHaveClass(/bg-green-50/);
    await expect(rows.nth(2).getByText("مرتجع شراء", { exact: true })).toHaveClass(/bg-red-50/);
    await expect(rows.nth(3).getByText("إلغاء مرتجع شراء", { exact: true })).toHaveClass(/bg-green-50/);
    await expect(rows.nth(4).getByText("تسوية", { exact: true })).toHaveClass(/bg-slate-100/);

    await expectSummary(page, "الرصيد الحالي", "218 قطعة");
    await expectSummary(page, "متوسط التكلفة", "10.6818");
    await expectSummary(page, "قيمة المخزون", "2,328.63"); // 218 × 10.6818 = 2328.6324
    await expectSummary(page, "إجمالي الوارد", "244 قطعة"); // 100 + 120 + 24
    await expectSummary(page, "إجمالي المنصرف", "26 قطعة"); // 24 + 2
    await expect(page.getByText(`الكميات بالـقطعة، ${LOCKED_NOTE}`)).toBeVisible();
    await expect(page.getByText("الرصيد لا يطابق آخر حركة")).toHaveCount(0);
  });

  test('the old English reason "Week 1 opening balance" is shown as "رصيد افتتاحي"', async ({ page }) => {
    await openCard(
      page,
      card("10", "5", [movement("OPENING", "10", "5", "50", "10", "5", { reason: "Week 1 opening balance" })]),
    );
    await expectCardRow(bodyRows(page).first(), { type: "رصيد افتتاحي", note: "رصيد افتتاحي", inQty: "10", balance: "10", cost: "5.00", avg: "5.00" });
    await expect(page.getByText("Week 1 opening balance")).toHaveCount(0);
  });

  test("the balance does not match the last movement → amber Alert", async ({ page }) => {
    await openCard(page, card("50", "10", [movement("OPENING", "40", "10", "400", "40", "10")]));

    const alert = page.getByRole("alert").filter({ hasText: "الرصيد لا يطابق آخر حركة، أبلغ الدعم الفني" });
    await expect(alert).toBeVisible();
    await expect(alert).toHaveClass(/amber/);
    await expect(bodyRows(page)).toHaveCount(1);
  });

  test("no movements → empty state with a 0 summary", async ({ page }) => {
    await openCard(page, card("0", "0", []));

    await expect(page.getByText("لا توجد حركات لهذا الصنف في هذا المخزن")).toBeVisible();
    await expect(page.locator("table")).toHaveCount(0);
    await expectSummary(page, "الرصيد الحالي", "0 قطعة");
    await expectSummary(page, "قيمة المخزون", "0.00");
    await expect(page.getByText("الرصيد لا يطابق آخر حركة")).toHaveCount(0);
  });

  test.describe("404 NOT_FOUND (an id from a link that does not exist)", () => {
    test.use({ allowedConsoleErrors: [/status of 404/] });

    test("product → الصنف غير موجود, the product Select is cleared; choosing another product loads its card", async ({
      page,
    }) => {
      await setFakeSession(page);
      await mockLists(page);
      // 404 for the wrong product, the brush card for the brush.
      await page.route(apiPath("/stock-movements/item-card"), (route) => {
        const productId = new URL(route.request().url()).searchParams.get("productId");
        if (productId === "p1") return route.fulfill({ json: { message: "ok", data: BRUSH_CARD }, headers: CORS });
        return route.fulfill({ status: 404, json: apiError(404, "NOT_FOUND"), headers: CORS });
      });
      await page.goto("/item-card?product=wrong-id&inventory=w1");

      const productSelect = page.getByLabel("الصنف", { exact: true });
      await expect(page.getByText("الصنف غير موجود")).toBeVisible();
      await expect(productSelect).toHaveValue("");
      await expect(page.getByLabel("المخزن", { exact: true })).toHaveValue("w1");
      await expect(page.getByText("المخزن غير موجود")).toHaveCount(0);
      await expect(page.getByText(PICK_HINT)).toBeVisible();

      await productSelect.selectOption({ label: productLabel(BRUSH) });
      await expect(page).toHaveURL(/\/item-card\?product=p1&inventory=w1$/);
      await expect(page.getByText("الصنف غير موجود")).toHaveCount(0);
      await expect(bodyRows(page)).toHaveCount(5);
    });

    test("warehouse → المخزن غير موجود; the next choice leaves the wrong id out of the URL", async ({ page }) => {
      await setFakeSession(page);
      await mockLists(page);
      await mockGet(page, "/stock-movements/item-card", 404, apiError(404, "NOT_FOUND"));
      await page.goto("/item-card?product=p1&inventory=wrong-id");

      await expect(page.getByText("المخزن غير موجود")).toBeVisible();
      await expect(page.getByLabel("المخزن", { exact: true })).toHaveValue("");
      await expect(page.getByLabel("الصنف", { exact: true })).toHaveValue("p1");
      await expect(page.getByText("الصنف غير موجود")).toHaveCount(0);

      await page.getByLabel("الصنف", { exact: true }).selectOption({ label: productLabel(OTHER) });
      await expect(page).toHaveURL(/\/item-card\?product=p2$/);
      await expect(page.getByText(PICK_HINT)).toBeVisible();
    });
  });

  test.describe("API errors", () => {
    test.use({ allowedConsoleErrors: [/status of (400|500)/] });

    test("400 VALIDATION_FAILED → Arabic message", async ({ page }) => {
      await setFakeSession(page);
      await mockLists(page);
      await mockGet(page, "/stock-movements/item-card", 400, apiError(400, "VALIDATION_FAILED", "productId"));
      await page.goto("/item-card?product=p1&inventory=w1");

      await expect(page.getByText("البيانات المدخلة غير صحيحة، راجع حقل الصنف")).toBeVisible();
      await expect(page.getByLabel("الصنف", { exact: true })).toHaveValue("p1");
    });

    test("server error on the card → retry loads it", async ({ page }) => {
      await setFakeSession(page);
      await mockLists(page);
      await mockGet(page, "/stock-movements/item-card", 500, apiError(500, "INTERNAL_ERROR"));
      await page.goto("/item-card?product=p1&inventory=w1");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();
      await page.unroute(apiPath("/stock-movements/item-card"));
      await mockOk(page, "/stock-movements/item-card", BRUSH_CARD);
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();
      await expect(bodyRows(page)).toHaveCount(5);
    });

    test("server error on the lists → retry shows the Selects", async ({ page }) => {
      await setFakeSession(page);
      await mockLists(page);
      await mockGet(page, "/products", 500, apiError(500, "INTERNAL_ERROR"));
      await page.goto("/item-card");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();
      await expect(page.getByLabel("الصنف", { exact: true })).toHaveCount(0);
      await page.unroute(apiPath("/products"));
      await mockOk(page, "/products", [BRUSH]);
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();
      await expect(page.getByLabel("الصنف", { exact: true })).toBeVisible();
      await expect(page.getByText(PICK_HINT)).toBeVisible();
    });
  });
});
