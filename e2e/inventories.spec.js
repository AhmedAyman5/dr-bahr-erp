// Inventories page (المخازن = warehouses).
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// Every test creates its own branch(es) + warehouses with a unique random tag in the name.
// afterEach deletes the tagged warehouses FIRST, then the tagged branches (also when the test failed).
//
// "mocked API" tests fake /inventory and /branch with page.route (no backend needed).
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

// The table row that contains this text.
function rowWith(page, text) {
  return page.getByRole("row").filter({ hasText: text });
}

// Collects every non-GET request sent to /inventory... (to check that nothing was sent).
function trackInventoryWrites(page) {
  const sent = [];
  page.on("request", (req) => {
    if (req.url().startsWith(`${API_URL}/inventory`) && req.method() !== "GET") {
      sent.push(`${req.method()} ${req.url()}`);
    }
  });
  return sent;
}

test.describe("with backend", () => {
  let token;
  let tag; // unique per test, part of every branch / warehouse name this test creates
  let branch; // a test branch created before every test

  function createBranch(request, name) {
    return createByApi(request, token, "/branch", { name, address: "عنوان فرع اختبار" });
  }

  function createInventory(request, branchId, body) {
    return createByApi(request, token, `/inventory/branch/${branchId}`, body);
  }

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);

    tag = randomTag();
    const session = await apiLogin(request);
    token = session.access_token;
    branch = await createBranch(request, `فرع مخازن ${tag}`);
    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;
    // Warehouses first, then their branches.
    await deleteByTag(request, token, "/inventory", tag);
    await deleteByTag(request, token, "/branch", tag);
    tag = undefined;
  });

  test("opens from the Sidebar link (between الفروع and التصنيفات) with no console errors", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link")).toContainText(["الفروع", "المخازن", "التصنيفات", "الوحدات"]);
    await nav.getByRole("link", { name: "المخازن" }).click();

    await expect(page).toHaveURL(/\/inventories$/);
    await expect(page.getByRole("heading", { name: "المخازن" })).toBeVisible();
    await expect(page.getByText("مخازن الشركة وتبعيتها للفروع")).toBeVisible();
    await expect(page.getByText("جارٍ تحميل المخازن...")).toBeHidden();
  });

  test("add: branch is required, then POST /inventory/branch/<id> with only { name, address }", async ({ page }) => {
    const sent = trackInventoryWrites(page);
    const name = `مخزن اختبار ${tag}`;
    await page.goto("/inventories");

    await page.getByRole("button", { name: "إضافة مخزن" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة مخزن" });
    await expect(dialog).toBeVisible();
    // No branch preselected → the branch Select gets focus.
    await expect(dialog.getByLabel("الفرع")).toBeFocused();

    // Without a branch: Arabic error, no request.
    await dialog.getByLabel("الاسم").fill(name);
    await dialog.getByLabel("العنوان").fill("القاهرة، المنطقة الصناعية");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    await expect(dialog.getByText("الفرع مطلوب")).toBeVisible();
    expect(sent).toEqual([]);

    await dialog.getByLabel("الفرع").selectOption({ label: branch.name });
    await expect(dialog.getByText("الفرع مطلوب")).toBeHidden();

    const requestPromise = page.waitForRequest(
      (req) => req.method() === "POST" && req.url().startsWith(`${API_URL}/inventory`),
    );
    // Enter in a field submits the form.
    await dialog.getByLabel("العنوان").press("Enter");
    const request = await requestPromise;
    expect(request.url()).toBe(`${API_URL}/inventory/branch/${branch.id}`);
    expect(request.postDataJSON()).toEqual({ name, address: "القاهرة، المنطقة الصناعية" });

    await expect(dialog).toBeHidden();
    const success = page.getByRole("alert").filter({ hasText: "تمت إضافة المخزن بنجاح" });
    await expect(success).toBeVisible();

    const row = rowWith(page, name);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").nth(1)).toHaveText(branch.name);
    await expect(row).toContainText("القاهرة، المنطقة الصناعية");

    // The success message hides by itself after ~4 seconds.
    await expect(success).toBeHidden({ timeout: 7000 });
  });

  test("validation: name and address are required (min 2), Arabic errors, no request", async ({ page }) => {
    const sent = trackInventoryWrites(page);
    await page.goto("/inventories");
    await page.getByRole("button", { name: "إضافة مخزن" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة مخزن" });
    const save = dialog.getByRole("button", { name: "حفظ" });
    await dialog.getByLabel("الفرع").selectOption({ label: branch.name });

    await save.click();
    await expect(dialog.getByText("الاسم مطلوب")).toBeVisible();
    await expect(dialog.getByText("العنوان مطلوب")).toBeVisible();

    // Only spaces counts as empty.
    await dialog.getByLabel("الاسم").fill("   ");
    await dialog.getByLabel("العنوان").fill("   ");
    await save.click();
    await expect(dialog.getByText("الاسم مطلوب")).toBeVisible();
    await expect(dialog.getByText("العنوان مطلوب")).toBeVisible();

    await dialog.getByLabel("الاسم").fill("م");
    await dialog.getByLabel("العنوان").fill("ع");
    await save.click();
    await expect(dialog.getByText("الاسم يجب أن يكون حرفين على الأقل")).toBeVisible();
    await expect(dialog.getByText("العنوان يجب أن يكون حرفين على الأقل")).toBeVisible();

    // A valid name alone is not enough.
    await dialog.getByLabel("الاسم").fill(`مخزن ${tag}`);
    await save.click();
    await expect(dialog.getByText("العنوان يجب أن يكون حرفين على الأقل")).toBeVisible();

    await expect(dialog).toBeVisible();
    expect(sent).toEqual([]);
  });

  test("edit: branch is read-only, name + address are updated", async ({ page, request }) => {
    const inventory = await createInventory(request, branch.id, { name: `مخزن قديم ${tag}`, address: "عنوان قديم" });
    const newName = `مخزن معدل ${tag}`;
    await page.goto("/inventories");

    await page.getByRole("button", { name: `تعديل ${inventory.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل المخزن" });
    await expect(dialog).toBeVisible();

    // Branch: shown by name, read-only, with the note. No branch Select.
    const branchField = dialog.getByLabel("الفرع");
    await expect(branchField).toHaveValue(branch.name);
    await expect(branchField).toHaveAttribute("readonly", "");
    await expect(dialog.getByText("لا يمكن تغيير فرع المخزن")).toBeVisible();
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await expect(dialog.getByLabel("الاسم")).toHaveValue(inventory.name);
    await expect(dialog.getByLabel("العنوان")).toHaveValue("عنوان قديم");

    await dialog.getByLabel("الاسم").fill(newName);
    await dialog.getByLabel("العنوان").fill("عنوان جديد");
    const requestPromise = page.waitForRequest((req) => req.method() === "PATCH");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    const patch = await requestPromise;
    expect(patch.url()).toBe(`${API_URL}/inventory/${inventory.id}`);
    expect(patch.postDataJSON()).toEqual({ name: newName, address: "عنوان جديد" });

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل المخزن بنجاح" })).toBeVisible();
    const row = rowWith(page, newName);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").nth(1)).toHaveText(branch.name);
    await expect(row).toContainText("عنوان جديد");
    await expect(rowWith(page, inventory.name)).toHaveCount(0);
  });

  test("branch filter + search work together; the add form preselects the filtered branch", async ({ page, request }) => {
    const otherBranch = await createBranch(request, `فرع آخر ${tag}`);
    const mainA = await createInventory(request, branch.id, { name: `مخزن رئيسي ${tag}`, address: "مدينة نصر" });
    const sideA = await createInventory(request, branch.id, { name: `مخزن فرعي ${tag}`, address: "حلوان" });
    const mainB = await createInventory(request, otherBranch.id, { name: `مخزن بعيد ${tag}`, address: "مدينة نصر" });
    await page.goto("/inventories");
    await expect(rowWith(page, tag)).toHaveCount(3);

    const filter = page.getByLabel("تصفية حسب الفرع");
    const search = page.getByPlaceholder("ابحث بالاسم أو العنوان");

    // Filter only: this branch's warehouses.
    await filter.selectOption({ label: branch.name });
    await expect(rowWith(page, mainA.name)).toHaveCount(1);
    await expect(rowWith(page, sideA.name)).toHaveCount(1);
    await expect(rowWith(page, mainB.name)).toHaveCount(0);
    await expect(page.getByText("عدد المخازن: 2")).toBeVisible();

    // Filter + search by address (case-insensitive, trimmed).
    await search.fill("  مدينة نصر  ");
    await expect(rowWith(page, mainA.name)).toHaveCount(1);
    await expect(rowWith(page, sideA.name)).toHaveCount(0);
    await expect(rowWith(page, mainB.name)).toHaveCount(0);
    await expect(page.getByText("عدد المخازن: 1")).toBeVisible();

    // Other branch + a name of the first branch → nothing.
    await filter.selectOption({ label: otherBranch.name });
    await search.fill(sideA.name);
    await expect(page.getByText("لا توجد نتائج مطابقة")).toBeVisible();
    await expect(page.getByText("عدد المخازن: 0")).toBeVisible();

    // The add form starts with the filtered branch selected, and focus on the name.
    await page.getByRole("button", { name: "إضافة مخزن" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة مخزن" });
    await expect(dialog.getByLabel("الفرع")).toHaveValue(otherBranch.id);
    await expect(dialog.getByLabel("الاسم")).toBeFocused();
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();

    // "كل الفروع" + empty search → all three again.
    await filter.selectOption({ label: "كل الفروع" });
    await search.fill(tag);
    await expect(rowWith(page, tag)).toHaveCount(3);
    await expect(page.getByText("عدد المخازن: 3")).toBeVisible();
  });

  test('delete: "إلغاء" keeps the warehouse, "حذف المخزن" removes it', async ({ page, request }) => {
    const inventory = await createInventory(request, branch.id, { name: `مخزن حذف ${tag}`, address: "الجيزة" });
    await page.goto("/inventories");
    await expect(rowWith(page, inventory.name)).toHaveCount(1);

    // Cancel
    await page.getByRole("button", { name: `حذف ${inventory.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "حذف المخزن" });
    await expect(dialog).toContainText(`هل أنت متأكد من حذف المخزن "${inventory.name}"؟`);
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    await expect(rowWith(page, inventory.name)).toHaveCount(1);

    // Confirm
    await page.getByRole("button", { name: `حذف ${inventory.name}` }).click();
    await dialog.getByRole("button", { name: "حذف المخزن" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم حذف المخزن بنجاح" })).toBeVisible();
    await expect(rowWith(page, inventory.name)).toHaveCount(0);

    // The API agrees: the warehouse is gone.
    const response = await request.get(`${API_URL}/inventory/${inventory.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(404);
  });

  test("unsaved changes: closing a changed form asks first", async ({ page }) => {
    await page.goto("/inventories");
    await page.getByRole("button", { name: "إضافة مخزن" }).first().click();
    const form = page.getByRole("dialog", { name: "إضافة مخزن" });
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    // Choosing only a branch already counts as a change.
    await form.getByLabel("الفرع").selectOption({ label: branch.name });

    // Escape → ask → "إلغاء" goes back to the form with the data kept.
    await page.keyboard.press("Escape");
    await expect(discard).toBeVisible();
    await expect(discard).toContainText("لديك تغييرات غير محفوظة. هل تريد إغلاق النموذج بدون حفظ؟");
    await discard.getByRole("button", { name: "إلغاء" }).click();
    await expect(discard).toBeHidden();
    await expect(form.getByLabel("الفرع")).toHaveValue(branch.id);

    // X → ask; Escape inside the question only closes the question.
    await form.getByLabel("الاسم").fill(`مخزن لن يحفظ ${tag}`);
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
    await expect(rowWith(page, `مخزن لن يحفظ ${tag}`)).toHaveCount(0);
  });

  test("unsaved changes: an untouched form closes without asking", async ({ page, request }) => {
    const inventory = await createInventory(request, branch.id, { name: `مخزن بدون تغيير ${tag}`, address: "طنطا" });
    await page.goto("/inventories");
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    // Add form: "إلغاء"
    await page.getByRole("button", { name: "إضافة مخزن" }).first().click();
    const addForm = page.getByRole("dialog", { name: "إضافة مخزن" });
    await addForm.getByRole("button", { name: "إلغاء" }).click();
    await expect(addForm).toBeHidden();

    // Edit form: Escape
    await page.getByRole("button", { name: `تعديل ${inventory.name}` }).click();
    const editForm = page.getByRole("dialog", { name: "تعديل المخزن" });
    await expect(editForm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editForm).toBeHidden();

    await expect(discard).toHaveCount(0);
  });
});

test.describe("mocked API", () => {
  const CORS = { "Access-Control-Allow-Origin": "*" };

  const BRANCH = {
    id: "b1",
    name: "فرع وهمي",
    code: "branch-000001",
    address: null,
    createdAt: "2026-11-21T10:00:00.000Z",
    updatedAt: "2026-11-21T10:00:00.000Z",
    deletedAt: null,
  };

  function inventory(id, name, branchId) {
    return {
      id,
      name,
      branchId,
      address: "عنوان وهمي",
      createdAt: "2026-11-21T10:00:00.000Z",
      updatedAt: "2026-11-21T10:00:00.000Z",
      deletedAt: null,
    };
  }

  // Answers GET /inventory and GET /branch with the given status + body.
  function mockInventories(page, status, body) {
    return page.route(
      (url) => url.pathname === "/inventory",
      (route) => route.fulfill({ status, json: body, headers: CORS }),
    );
  }
  function mockBranches(page, branches) {
    return page.route(
      (url) => url.pathname === "/branch",
      (route) =>
        route.fulfill({ status: 200, json: { message: "All branches returned successfully", data: branches }, headers: CORS }),
    );
  }

  test.describe("API error", () => {
    // The browser logs the failed request itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("shows ErrorState and the retry button loads the list", async ({ page }) => {
      await setFakeSession(page);
      await mockBranches(page, [BRANCH]);
      await mockInventories(page, 500, {
        statusCode: 500,
        message: "Internal server error",
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        field: null,
      });
      await page.goto("/inventories");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();

      await page.unroute((url) => url.pathname === "/inventory");
      await mockInventories(page, 200, {
        message: "All inventories returned successfully",
        data: [inventory("i1", "مخزن وهمي", "b1")],
      });
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();

      const row = rowWith(page, "مخزن وهمي");
      await expect(row).toHaveCount(1);
      await expect(row.getByRole("cell").nth(1)).toHaveText("فرع وهمي");
      await expect(row).toContainText("عنوان وهمي");
      await expect(row).toContainText("21 نوفمبر 2026");
    });
  });

  test("empty list shows EmptyState with the add button", async ({ page }) => {
    await setFakeSession(page);
    await mockBranches(page, [BRANCH]);
    await mockInventories(page, 200, { message: "All inventories returned successfully", data: [] });
    await page.goto("/inventories");

    const empty = page.getByText("لا توجد مخازن بعد").locator("..");
    await expect(empty).toBeVisible();
    await expect(page.getByText("لإضافة مخزن يجب إضافة فرع أولاً")).toHaveCount(0);
    await empty.getByRole("button", { name: "إضافة مخزن" }).click();
    await expect(page.getByRole("dialog", { name: "إضافة مخزن" })).toBeVisible();
  });

  test("no branches: add buttons are disabled and a hint links to /branches", async ({ page }) => {
    await setFakeSession(page);
    await mockBranches(page, []);
    await mockInventories(page, 200, { message: "All inventories returned successfully", data: [] });
    await page.goto("/inventories");

    await expect(page.getByText("لا توجد مخازن بعد")).toBeVisible();
    const addButtons = page.getByRole("button", { name: "إضافة مخزن" });
    await expect(addButtons).toHaveCount(2); // header + empty state
    for (const button of await addButtons.all()) {
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute("title", "أضف فرعاً أولاً");
    }

    await expect(page.getByText("لإضافة مخزن يجب إضافة فرع أولاً")).toBeVisible();
    await page.getByRole("link", { name: "إضافة فرع" }).click();
    await expect(page).toHaveURL(/\/branches$/);
  });

  test('a warehouse whose branch is not in the list shows "فرع محذوف" (also in the edit form)', async ({ page }) => {
    await setFakeSession(page);
    await mockBranches(page, [BRANCH]);
    await mockInventories(page, 200, {
      message: "All inventories returned successfully",
      data: [inventory("i1", "مخزن عادي", "b1"), inventory("i2", "مخزن يتيم", "deleted-branch")],
    });
    await page.goto("/inventories");

    await expect(rowWith(page, "مخزن عادي").getByRole("cell").nth(1)).toHaveText("فرع وهمي");
    const orphanCell = rowWith(page, "مخزن يتيم").getByRole("cell").nth(1);
    await expect(orphanCell).toHaveText("فرع محذوف");
    await expect(orphanCell.getByText("فرع محذوف")).toHaveClass(/text-slate-400/);

    await page.getByRole("button", { name: "تعديل مخزن يتيم" }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل المخزن" });
    await expect(dialog.getByLabel("الفرع")).toHaveValue("فرع محذوف");
  });
});
