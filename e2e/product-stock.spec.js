// Product Stock page (أرصدة المخزون) — same approach as branches.spec.js.
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// beforeEach creates a branch, a warehouse, a category and a unit with a unique random tag;
// products get the tag in their name and a random barcode.
// afterEach cleans up in this order (also when the test failed):
//   stock records → products → categories / units → warehouses → branches.
// Other spec files run in parallel and create warehouses too, so these tests open
// /stock?inventory=<id> directly instead of relying on "the only warehouse".
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
  API_URL,
  API_DOWN_MESSAGE,
} from "./helpers";

// Column order in the table.
const COL = { code: 0, name: 1, category: 2, unit: 3, quantity: 4, costPrice: 5 };
const LOW_STOCK = "أقل من حد الطلب";

// The table row that contains this text.
function rowWith(page, text) {
  return page.getByRole("row").filter({ hasText: text });
}

function randomBarcode() {
  return `BC${Date.now()}${randomTag()}`;
}

function productLabel(product) {
  return `${product.name} (${product.code})`;
}

test.describe("with backend", () => {
  let token;
  let tag; // unique per test, part of every name this test creates
  let branch;
  let inventory; // the main test warehouse
  let category;
  let unit;

  const headers = () => ({ Authorization: `Bearer ${token}` });

  function createProduct(request, body) {
    return createByApi(request, token, "/products", {
      barcode: randomBarcode(),
      categoryId: category.id,
      primaryItemUnitId: unit.id,
      retailPrice: 15,
      wholesalePrice: 12,
      bulkWholesalePrice: 10,
      ...body,
    });
  }

  function createInventory(request, name) {
    return createByApi(request, token, `/inventory/branch/${branch.id}`, { name, address: "عنوان اختبار" });
  }

  function addStockByApi(request, inventoryId, body) {
    return createByApi(request, token, `/product-inventory/inventory/${inventoryId}`, body);
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

  async function openWarehouse(page) {
    await page.goto(`/stock?inventory=${inventory.id}`);
    await expect(page.getByText("جارٍ تحميل أرصدة المخزن...")).toBeHidden();
  }

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);

    tag = randomTag();
    const session = await apiLogin(request);
    token = session.access_token;
    branch = await createByApi(request, token, "/branch", { name: `فرع أرصدة ${tag}`, address: "عنوان" });
    inventory = await createInventory(request, `مخزن أرصدة ${tag}`);
    category = await createByApi(request, token, "/categories", { name: `تصنيف أرصدة ${tag}` });
    unit = await createByApi(request, token, "/item-unit", { name: `وحدة أرصدة ${tag}` });
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

  test("opens from the Sidebar link (after الأصناف) with no console errors", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link")).toContainText(["الأصناف", "أرصدة المخزون"]);
    await nav.getByRole("link", { name: "أرصدة المخزون" }).click();

    await expect(page).toHaveURL(/\/stock/);
    await expect(page.getByRole("heading", { name: "أرصدة المخزون" })).toBeVisible();
    await expect(page.getByText("كميات الأصناف وتكلفتها في كل مخزن")).toBeVisible();
    await expect(page.getByText("جارٍ تحميل المخازن...")).toBeHidden();
  });

  test("warehouse Select: nothing before choosing, choosing loads its stock, URL + reload keep it", async ({
    page,
    request,
  }) => {
    const otherInventory = await createInventory(request, `مخزن ثان ${tag}`);
    const product = await createProduct(request, { name: `صنف مخزن ${tag}` });
    await addStockByApi(request, inventory.id, { productId: product.id, quantity: 5, costPrice: 2 });

    await page.goto("/stock");
    // At least 2 warehouses → none is selected: nothing listed, add is disabled.
    await expect(page.getByText("اختر مخزناً لعرض أرصدته")).toBeVisible();
    await expect(rowWith(page, tag)).toHaveCount(0);
    const addButton = page.getByRole("button", { name: "إضافة صنف للمخزن" });
    await expect(addButton).toBeDisabled();
    await expect(addButton).toHaveAttribute("title", "اختر مخزناً أولاً");

    // Options are "<warehouse> — <branch>".
    const select = page.getByLabel("المخزن");
    await select.selectOption({ label: `${inventory.name} — ${branch.name}` });
    await expect(page).toHaveURL(new RegExp(`/stock\\?inventory=${inventory.id}$`));
    await expect(rowWith(page, product.name)).toHaveCount(1);
    await expect(page.getByText("عدد الأصناف في المخزن: 1")).toBeVisible();
    await expect(addButton).toBeEnabled();

    // Reload keeps the same warehouse.
    await page.reload();
    await expect(page.getByLabel("المخزن")).toHaveValue(inventory.id);
    await expect(rowWith(page, product.name)).toHaveCount(1);

    // The other warehouse is empty.
    await page.getByLabel("المخزن").selectOption({ label: `${otherInventory.name} — ${branch.name}` });
    await expect(page).toHaveURL(new RegExp(`inventory=${otherInventory.id}$`));
    await expect(page.getByText("لا توجد أصناف في هذا المخزن بعد")).toBeVisible();
    await expect(rowWith(page, product.name)).toHaveCount(0);
  });

  test("add: only STOCK products not yet in the warehouse; validation; POST body is exactly 3 numbers", async ({
    page,
    request,
  }) => {
    const newProduct = await createProduct(request, { name: `صنف جديد ${tag}` });
    const service = await createProduct(request, { name: `خدمة ${tag}`, itemType: "SERVICE" });
    const existing = await createProduct(request, { name: `صنف موجود ${tag}` });
    await addStockByApi(request, inventory.id, { productId: existing.id, quantity: 1, costPrice: 1 });
    const sent = [];
    page.on("request", (req) => {
      if (req.url().startsWith(`${API_URL}/product-inventory`) && req.method() === "POST") sent.push(req.url());
    });
    await openWarehouse(page);

    await page.getByRole("button", { name: "إضافة صنف للمخزن" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة صنف للمخزن" });
    await expect(dialog).toBeVisible();

    const warehouseField = dialog.getByLabel("المخزن");
    await expect(warehouseField).toHaveValue(`${inventory.name} — ${branch.name}`);
    await expect(warehouseField).toHaveAttribute("readonly", "");
    const productSelect = dialog.getByLabel("الصنف");
    await expect(productSelect).toBeFocused();

    const options = await productSelect.locator("option").allTextContents();
    expect(options).toContain(productLabel(newProduct));
    expect(options).not.toContain(productLabel(service));
    expect(options).not.toContain(productLabel(existing));

    // Numbers start empty and are required.
    await expect(dialog.getByLabel("الكمية")).toHaveValue("");
    await expect(dialog.getByLabel("سعر التكلفة")).toHaveValue("");
    const save = dialog.getByRole("button", { name: "حفظ" });
    await save.click();
    await expect(dialog.getByText("الصنف مطلوب")).toBeVisible();
    await expect(dialog.getByText("الكمية مطلوبة")).toBeVisible();
    await expect(dialog.getByText("سعر التكلفة مطلوب")).toBeVisible();

    // The unit shows next to the quantity once a product is chosen.
    await productSelect.selectOption({ label: productLabel(newProduct) });
    await expect(dialog.getByLabel(`الكمية (${unit.name})`)).toBeVisible();

    // 5 decimals and negative values are rejected.
    await dialog.getByLabel("الكمية").fill("1.23456");
    await dialog.getByLabel("سعر التكلفة").fill("-1");
    await save.click();
    await expect(dialog.getByText("الحد الأقصى 4 أرقام بعد العلامة العشرية")).toBeVisible();
    await expect(dialog.getByText("القيمة يجب ألا تقل عن 0")).toBeVisible();
    expect(sent).toEqual([]);

    // 4 decimals are fine.
    await dialog.getByLabel("الكمية").fill("100.1234");
    await dialog.getByLabel("سعر التكلفة").fill("12.5");
    const requestPromise = page.waitForRequest(
      (req) => req.url().startsWith(`${API_URL}/product-inventory`) && req.method() === "POST",
    );
    // Enter in a field submits the form.
    await dialog.getByLabel("سعر التكلفة").press("Enter");
    const post = await requestPromise;
    expect(post.url()).toBe(`${API_URL}/product-inventory/inventory/${inventory.id}`);
    expect(post.postDataJSON()).toEqual({ productId: newProduct.id, quantity: 100.1234, costPrice: 12.5 });

    await expect(dialog).toBeHidden();
    const success = page.getByRole("alert").filter({ hasText: "تمت إضافة الصنف للمخزن بنجاح" });
    await expect(success).toBeVisible();

    const cells = rowWith(page, newProduct.name).getByRole("cell");
    await expect(cells.nth(COL.code)).toHaveText(newProduct.code);
    await expect(cells.nth(COL.category)).toHaveText(category.name);
    await expect(cells.nth(COL.unit)).toHaveText(unit.name);
    await expect(cells.nth(COL.quantity)).toHaveText("100.1234");
    await expect(cells.nth(COL.costPrice)).toHaveText("12.50");
    await expect(page.getByText("عدد الأصناف في المخزن: 2")).toBeVisible();

    // The success message hides by itself after ~4 seconds.
    await expect(success).toBeHidden({ timeout: 7000 });
  });

  test("restore: add → remove → add again shows the normal success message and the row is back", async ({
    page,
    request,
  }) => {
    const product = await createProduct(request, { name: `صنف استرجاع ${tag}` });
    await openWarehouse(page);

    async function addThroughForm(quantity, costPrice) {
      await page.getByRole("button", { name: "إضافة صنف للمخزن" }).first().click();
      const dialog = page.getByRole("dialog", { name: "إضافة صنف للمخزن" });
      await dialog.getByLabel("الصنف").selectOption({ label: productLabel(product) });
      await dialog.getByLabel("الكمية").fill(quantity);
      await dialog.getByLabel("سعر التكلفة").fill(costPrice);
      const responsePromise = page.waitForResponse(
        (res) => res.url().startsWith(`${API_URL}/product-inventory`) && res.request().method() === "POST",
      );
      await dialog.getByRole("button", { name: "حفظ" }).click();
      const response = await responsePromise;
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("alert").filter({ hasText: "تمت إضافة الصنف للمخزن بنجاح" })).toBeVisible();
      return (await response.json()).message;
    }

    expect(await addThroughForm("10", "3")).toBe("Product inventory created successfully");
    await expect(rowWith(page, product.name)).toHaveCount(1);

    await page.getByRole("button", { name: `إزالة ${product.name}` }).click();
    await page.getByRole("dialog", { name: "إزالة الصنف من المخزن" }).getByRole("button", { name: "إزالة الصنف" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "تمت إزالة الصنف من المخزن بنجاح" })).toBeVisible();
    await expect(rowWith(page, product.name)).toHaveCount(0);

    // Same product again: the backend restores the old record; the user sees a normal add.
    expect(await addThroughForm("42", "7.25")).toBe("Product inventory restored successfully");
    const cells = rowWith(page, product.name).getByRole("cell");
    await expect(cells.nth(COL.quantity)).toHaveText("42.00");
    await expect(cells.nth(COL.costPrice)).toHaveText("7.25");
  });

  test("edit: product + warehouse read-only, PATCH sends only quantity + costPrice", async ({ page, request }) => {
    const product = await createProduct(request, { name: `صنف تعديل ${tag}` });
    const record = await addStockByApi(request, inventory.id, { productId: product.id, quantity: 100, costPrice: 12.5 });
    await openWarehouse(page);

    await page.getByRole("button", { name: `تعديل ${product.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل الرصيد" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("التعديل للتصحيح اليدوي فقط (مثل خطأ في الرصيد الافتتاحي)")).toBeVisible();

    const productField = dialog.getByLabel("الصنف");
    await expect(productField).toHaveValue(productLabel(product));
    await expect(productField).toHaveAttribute("readonly", "");
    await expect(dialog.getByLabel("المخزن")).toHaveAttribute("readonly", "");
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await expect(dialog.getByLabel(`الكمية (${unit.name})`)).toHaveValue("100");
    await expect(dialog.getByLabel("سعر التكلفة")).toHaveValue("12.5");

    await dialog.getByLabel("الكمية").fill("150.5");
    await dialog.getByLabel("سعر التكلفة").fill("13");
    const requestPromise = page.waitForRequest((req) => req.method() === "PATCH");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    const patch = await requestPromise;
    expect(patch.url()).toBe(`${API_URL}/product-inventory/${record.id}`);
    expect(patch.postDataJSON()).toEqual({ quantity: 150.5, costPrice: 13 });

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل الرصيد بنجاح" })).toBeVisible();
    const cells = rowWith(page, product.name).getByRole("cell");
    await expect(cells.nth(COL.quantity)).toHaveText("150.50");
    await expect(cells.nth(COL.costPrice)).toHaveText("13.00");
  });

  test("low-stock badge: only when reorderLimit > 0 and quantity ≤ reorderLimit", async ({ page, request }) => {
    const cases = [
      { name: `صنف أقل ${tag}`, reorderLimit: 10, quantity: 5, low: true },
      { name: `صنف يساوي ${tag}`, reorderLimit: 10, quantity: 10, low: true },
      { name: `صنف أكثر ${tag}`, reorderLimit: 10, quantity: 10.5, low: false },
      { name: `صنف بلا حد ${tag}`, reorderLimit: 0, quantity: 0, low: false },
    ];
    for (const item of cases) {
      const product = await createProduct(request, { name: item.name, reorderLimit: item.reorderLimit });
      await addStockByApi(request, inventory.id, { productId: product.id, quantity: item.quantity, costPrice: 1 });
    }
    await openWarehouse(page);

    for (const item of cases) {
      const quantityCell = rowWith(page, item.name).getByRole("cell").nth(COL.quantity);
      await expect(quantityCell.getByText(LOW_STOCK)).toHaveCount(item.low ? 1 : 0);
    }
    await expect(rowWith(page, cases[0].name).getByText(LOW_STOCK)).toHaveClass(/amber/);
  });

  test("search by product name, code and barcode", async ({ page, request }) => {
    const first = await createProduct(request, { name: `صنف بحث أول ${tag}` });
    const second = await createProduct(request, { name: `صنف بحث ثان ${tag}` });
    for (const product of [first, second]) {
      await addStockByApi(request, inventory.id, { productId: product.id, quantity: 1, costPrice: 1 });
    }
    await openWarehouse(page);
    await expect(page.getByText("عدد الأصناف في المخزن: 2")).toBeVisible();

    const search = page.getByPlaceholder("ابحث باسم الصنف أو الكود أو الباركود");
    for (const text of [`  ${first.name}  `, first.code.toLowerCase(), first.barcode.toLowerCase()]) {
      await search.fill(text);
      await expect(rowWith(page, first.name)).toHaveCount(1);
      await expect(rowWith(page, second.name)).toHaveCount(0);
      await expect(page.getByText("عدد الأصناف في المخزن: 1")).toBeVisible();
    }

    await search.fill(`لا يوجد ${tag}`);
    await expect(page.getByText("لا توجد نتائج مطابقة للبحث")).toBeVisible();
    await expect(page.getByText("عدد الأصناف في المخزن: 0")).toBeVisible();
  });

  test('remove: "إلغاء" keeps the product, "إزالة الصنف" removes it from the warehouse', async ({
    page,
    request,
  }) => {
    const product = await createProduct(request, { name: `صنف إزالة ${tag}` });
    const record = await addStockByApi(request, inventory.id, { productId: product.id, quantity: 3, costPrice: 1 });
    await openWarehouse(page);

    const removeButton = page.getByRole("button", { name: `إزالة ${product.name}` });
    await expect(removeButton).toHaveAttribute("title", "إزالة من المخزن");

    // Cancel
    await removeButton.click();
    const dialog = page.getByRole("dialog", { name: "إزالة الصنف من المخزن" });
    await expect(dialog).toContainText(`هل أنت متأكد من إزالة "${product.name}" من "${inventory.name}"؟`);
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    await expect(rowWith(page, product.name)).toHaveCount(1);

    // Confirm
    await removeButton.click();
    await dialog.getByRole("button", { name: "إزالة الصنف" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تمت إزالة الصنف من المخزن بنجاح" })).toBeVisible();
    await expect(page.getByText("لا توجد أصناف في هذا المخزن بعد")).toBeVisible();

    // The API agrees: the record is gone.
    const response = await request.get(`${API_URL}/product-inventory/${record.id}`, { headers: headers() });
    expect(response.status()).toBe(404);
  });

  test("unsaved changes: a changed form asks first, an untouched one closes directly", async ({ page, request }) => {
    const product = await createProduct(request, { name: `صنف تغييرات ${tag}` });
    await addStockByApi(request, inventory.id, { productId: product.id, quantity: 7.5, costPrice: 2.25 });
    await openWarehouse(page);
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    // Untouched edit form: Escape closes without asking.
    await page.getByRole("button", { name: `تعديل ${product.name}` }).click();
    const editForm = page.getByRole("dialog", { name: "تعديل الرصيد" });
    await expect(editForm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editForm).toBeHidden();
    await expect(discard).toHaveCount(0);

    // Changed edit form: asks; "إلغاء" keeps the data, "تجاهل التغييرات" closes.
    await page.getByRole("button", { name: `تعديل ${product.name}` }).click();
    await editForm.getByLabel("الكمية").fill("8");
    await editForm.getByRole("button", { name: "إلغاء" }).click();
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "إلغاء" }).click();
    await expect(editForm.getByLabel("الكمية")).toHaveValue("8");
    await editForm.getByRole("button", { name: "إغلاق" }).click();
    await discard.getByRole("button", { name: "تجاهل التغييرات" }).click();
    await expect(editForm).toBeHidden();
    await expect(rowWith(page, product.name).getByRole("cell").nth(COL.quantity)).toHaveText("7.50");
  });
});

test.describe("mocked API", () => {
  const CORS = { "Access-Control-Allow-Origin": "*" };
  const DATES = { createdAt: "2026-11-21T10:00:00.000Z", updatedAt: "2026-11-21T10:00:00.000Z", deletedAt: null };
  const BRANCH = { id: "b1", code: "branch-000001", name: "فرع وهمي", address: null, ...DATES };
  const CATEGORY = { id: "cat1", code: "category-000001", name: "تصنيف وهمي", ...DATES };
  const UNIT = { id: "unit1", code: "unit-000001", name: "قطعة", ...DATES };

  function inventory(id, name) {
    return { id, name, branchId: BRANCH.id, address: "عنوان", ...DATES };
  }

  function product(id, name, extra = {}) {
    return {
      id,
      code: `PRD-${id}`,
      barcode: null,
      name,
      categoryId: CATEGORY.id,
      primaryItemUnitId: UNIT.id,
      itemType: "STOCK",
      costingMethod: "WEIGHTED_AVERAGE",
      retailPrice: "15",
      wholesalePrice: "12",
      bulkWholesalePrice: "10",
      reorderLimit: "0",
      hasExpiryDate: false,
      ...DATES,
      category: CATEGORY,
      primaryItemUnit: UNIT,
      ...extra,
    };
  }

  function stockRecord(id, inventoryId, prod, quantity, costPrice) {
    return { id, productId: prod.id, inventoryId, quantity, costPrice, deletedAt: null, product: prod };
  }

  // Matchers per API path (only on the API origin, never the page itself).
  const API_PATHS = {};
  function apiPath(path) {
    API_PATHS[path] ??= (url) => url.origin === API_URL && url.pathname === path;
    return API_PATHS[path];
  }
  function mockGet(page, path, status, body) {
    return page.route(apiPath(path), (route) => route.fulfill({ status, json: body, headers: CORS }));
  }
  function mockList(page, path, data) {
    return mockGet(page, path, 200, { message: "fetched successfully", data });
  }

  // Mocks the base lists + the stock of each given warehouse.
  async function mockAll(page, { inventories, products = [], stock = {} }) {
    await mockList(page, "/inventory", inventories);
    await mockList(page, "/branch", [BRANCH]);
    await mockList(page, "/products", products);
    for (const [inventoryId, records] of Object.entries(stock)) {
      await mockList(page, `/product-inventory/inventory/${inventoryId}`, records);
    }
  }

  test("a single warehouse is selected automatically (URL too) and its empty state shows", async ({ page }) => {
    await setFakeSession(page);
    await mockAll(page, { inventories: [inventory("w1", "المخزن الوحيد")], stock: { w1: [] } });
    await page.goto("/stock");

    await expect(page).toHaveURL(/\/stock\?inventory=w1$/);
    await expect(page.getByLabel("المخزن")).toHaveValue("w1");
    await expect(page.getByText("لا توجد أصناف في هذا المخزن بعد")).toBeVisible();
    const addButtons = page.getByRole("button", { name: "إضافة صنف للمخزن" });
    await expect(addButtons).toHaveCount(2); // header + empty state
    await expect(addButtons.first()).toBeEnabled();
  });

  test("a warehouse id in the URL that no longer exists is cleared (and never requested)", async ({ page }) => {
    const stockRequests = [];
    page.on("request", (req) => {
      if (req.url().includes("/product-inventory/")) stockRequests.push(req.url());
    });
    await setFakeSession(page);
    await mockAll(page, { inventories: [inventory("w1", "مخزن 1"), inventory("w2", "مخزن 2")] });
    await page.goto("/stock?inventory=deleted-id");

    await expect(page).toHaveURL(/\/stock$/);
    await expect(page.getByText("اختر مخزناً لعرض أرصدته")).toBeVisible();
    await expect(page.getByLabel("المخزن")).toHaveValue("");
    expect(stockRequests).toEqual([]);
  });

  test("no warehouses: amber hint with a link to /inventories, add disabled", async ({ page }) => {
    await setFakeSession(page);
    await mockAll(page, { inventories: [] });
    await page.goto("/stock");

    const hint = page.getByRole("alert").filter({ hasText: "لعرض أرصدة المخزون يجب إضافة مخزن أولاً" });
    await expect(hint).toBeVisible();
    await expect(hint).toHaveClass(/amber/);
    await expect(page.getByLabel("المخزن")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "إضافة صنف للمخزن" })).toBeDisabled();

    await hint.getByRole("link", { name: "إضافة مخزن" }).click();
    await expect(page).toHaveURL(/\/inventories$/);
  });

  test.describe("API error", () => {
    // The browser logs the failed request itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("base data error → retry loads; numbers with 2–4 decimals and the low-stock badge", async ({ page }) => {
      const low = product("p1", "صنف قليل", { reorderLimit: "20" });
      const normal = product("p2", "صنف عادي", { reorderLimit: "5" });
      await setFakeSession(page);
      await mockAll(page, {
        inventories: [inventory("w1", "مخزن 1"), inventory("w2", "مخزن 2")],
        stock: { w1: [stockRecord("s1", "w1", low, "12.5", "12.3456"), stockRecord("s2", "w1", normal, "100", "3")] },
      });
      await mockGet(page, "/inventory", 500, {
        statusCode: 500,
        message: "Internal server error",
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        field: null,
      });
      await page.goto("/stock?inventory=w1");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();

      await page.unroute(apiPath("/inventory"));
      await mockList(page, "/inventory", [inventory("w1", "مخزن 1"), inventory("w2", "مخزن 2")]);
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();

      await expect(page.getByLabel("المخزن")).toHaveValue("w1");
      await expect(page.getByLabel("المخزن").locator("option:checked")).toHaveText("مخزن 1 — فرع وهمي");
      const lowCells = rowWith(page, "صنف قليل").getByRole("cell");
      await expect(lowCells.nth(COL.code)).toHaveText("PRD-p1");
      await expect(lowCells.nth(COL.unit)).toHaveText("قطعة");
      await expect(lowCells.nth(COL.quantity)).toHaveText(`12.50${LOW_STOCK}`);
      await expect(lowCells.nth(COL.quantity).locator("span[dir=ltr]")).toHaveText("12.50");
      await expect(lowCells.nth(COL.costPrice)).toHaveText("12.3456");
      const normalCells = rowWith(page, "صنف عادي").getByRole("cell");
      await expect(normalCells.nth(COL.quantity)).toHaveText("100.00");
      await expect(normalCells.nth(COL.costPrice)).toHaveText("3.00");
      await expect(page.getByText("عدد الأصناف في المخزن: 2")).toBeVisible();
    });
  });

  test("add form: every STOCK product is already here → hint and save disabled", async ({ page }) => {
    const inStock = product("p1", "صنف موجود");
    const service = product("p2", "خدمة", { itemType: "SERVICE" });
    await setFakeSession(page);
    await mockAll(page, {
      inventories: [inventory("w1", "مخزن 1")],
      products: [inStock, service],
      stock: { w1: [stockRecord("s1", "w1", inStock, "1", "1")] },
    });
    await page.goto("/stock?inventory=w1");

    await page.getByRole("button", { name: "إضافة صنف للمخزن" }).click();
    const dialog = page.getByRole("dialog", { name: "إضافة صنف للمخزن" });
    await expect(dialog.getByText("كل الأصناف المخزنية موجودة في هذا المخزن")).toBeVisible();
    await expect(dialog.getByLabel("الصنف").locator("option")).toHaveText(["اختر الصنف"]);
    await expect(dialog.getByRole("button", { name: "حفظ" })).toBeDisabled();
  });

  test("add form: no STOCK products at all → link to /products", async ({ page }) => {
    await setFakeSession(page);
    await mockAll(page, {
      inventories: [inventory("w1", "مخزن 1")],
      products: [product("p2", "خدمة", { itemType: "SERVICE" })],
      stock: { w1: [] },
    });
    await mockList(page, "/categories", []);
    await mockList(page, "/item-unit", []);
    await page.goto("/stock?inventory=w1");

    await page.getByRole("button", { name: "إضافة صنف للمخزن" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة صنف للمخزن" });
    await expect(dialog.getByText("كل الأصناف المخزنية موجودة في هذا المخزن")).toHaveCount(0);
    await expect(dialog.getByText("لا توجد أصناف مخزنية بعد.")).toBeVisible();
    await dialog.getByRole("link", { name: "إضافة صنف" }).click();
    await expect(page).toHaveURL(/\/products$/);
  });
});
