// Categories page (التصنيفات) — same approach as branches.spec.js.
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// Every test creates its own data with a unique random tag in the name, and afterEach
// deletes everything with that tag through the API (also when the test failed):
// products first, then categories and units (the backend refuses to delete used ones).
//
// "mocked API" tests fake the /categories endpoint with page.route (no backend needed).
import {
  test,
  expect,
  setSession,
  setFakeSession,
  isApiUp,
  apiLogin,
  randomTag,
  createByApi,
  createProductByApi,
  deleteByTag,
  API_URL,
  API_DOWN_MESSAGE,
} from "./helpers";

const IN_USE_MESSAGE =
  "لا يمكن حذف هذا التصنيف لأنه مستخدم في أصناف حالية. انقل هذه الأصناف إلى تصنيف آخر أو احذفها أولاً.";

// The table row that contains this text.
function rowWith(page, text) {
  return page.getByRole("row").filter({ hasText: text });
}

test.describe("with backend", () => {
  let token;
  let tag; // unique per test, part of every name this test creates

  function createCategoryByApi(request, name) {
    return createByApi(request, token, "/categories", { name });
  }

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);

    tag = randomTag();
    const session = await apiLogin(request);
    token = session.access_token;
    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;
    await deleteByTag(request, token, "/products", tag);
    await deleteByTag(request, token, "/categories", tag);
    await deleteByTag(request, token, "/item-unit", tag);
    tag = undefined;
  });

  test("opens from the Sidebar link with no console errors", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "التصنيفات" }).click();

    await expect(page).toHaveURL(/\/categories$/);
    await expect(page.getByRole("heading", { name: "التصنيفات" })).toBeVisible();
    await expect(page.getByText("تصنيفات الأصناف مثل المشروبات والمنظفات")).toBeVisible();
    await expect(page.getByText("جارٍ تحميل التصنيفات...")).toBeHidden();
  });

  test("add a category → success message → it appears in the table with a code", async ({ page }) => {
    const name = `تصنيف اختبار ${tag}`;
    await page.goto("/categories");

    await page.getByRole("button", { name: "إضافة تصنيف" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة تصنيف" });
    await expect(dialog).toBeVisible();
    // The first field gets focus; there is no code field in add mode.
    await expect(dialog.getByLabel("الاسم")).toBeFocused();
    await expect(dialog.getByLabel("الكود")).toHaveCount(0);

    await dialog.getByLabel("الاسم").fill(name);
    // Enter in a field submits the form.
    await dialog.getByLabel("الاسم").press("Enter");

    await expect(dialog).toBeHidden();
    const success = page.getByRole("alert").filter({ hasText: "تمت إضافة التصنيف بنجاح" });
    await expect(success).toBeVisible();

    const row = rowWith(page, name);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").first()).toHaveText(/^category-\d+$/);

    // The success message hides by itself after ~4 seconds.
    await expect(success).toBeHidden({ timeout: 7000 });
  });

  test("search finds a category by name and by code (case-insensitive)", async ({ page, request }) => {
    const category = await createCategoryByApi(request, `تصنيف بحث ${tag}`);
    await page.goto("/categories");
    await expect(rowWith(page, category.name)).toHaveCount(1);

    const search = page.getByPlaceholder("ابحث بالاسم أو الكود");

    await search.fill(`  ${category.name}  `);
    await expect(rowWith(page, category.name)).toHaveCount(1);
    await expect(page.getByText("عدد التصنيفات: 1")).toBeVisible();

    await search.fill(category.code.toUpperCase());
    await expect(rowWith(page, category.name)).toHaveCount(1);
    await expect(page.getByText("عدد التصنيفات: 1")).toBeVisible();

    await search.fill(`لا يوجد ${tag} xyz`);
    await expect(page.getByText("لا توجد نتائج مطابقة للبحث")).toBeVisible();
    await expect(page.getByText("عدد التصنيفات: 0")).toBeVisible();
  });

  test("edit name → updated in the table, code unchanged", async ({ page, request }) => {
    const category = await createCategoryByApi(request, `تصنيف قديم ${tag}`);
    const newName = `تصنيف معدل ${tag}`;
    await page.goto("/categories");

    await page.getByRole("button", { name: `تعديل ${category.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل التصنيف" });
    await expect(dialog).toBeVisible();

    // Code is shown read-only, the name is filled with the current value.
    const code = dialog.getByLabel("الكود");
    await expect(code).toHaveValue(category.code);
    await expect(code).toHaveAttribute("readonly", "");
    await expect(dialog.getByLabel("الاسم")).toHaveValue(category.name);

    await dialog.getByLabel("الاسم").fill(newName);
    await dialog.getByRole("button", { name: "حفظ" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل التصنيف بنجاح" })).toBeVisible();
    const row = rowWith(page, newName);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(category.code);
    await expect(rowWith(page, category.name)).toHaveCount(0);
  });

  test("validation: empty name shows an Arabic error and sends no request", async ({ page }) => {
    const sentRequests = [];
    page.on("request", (req) => {
      if (req.url().startsWith(`${API_URL}/categories`) && req.method() !== "GET") {
        sentRequests.push(`${req.method()} ${req.url()}`);
      }
    });

    await page.goto("/categories");
    await page.getByRole("button", { name: "إضافة تصنيف" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة تصنيف" });
    const save = dialog.getByRole("button", { name: "حفظ" });

    await save.click();
    await expect(dialog.getByText("الاسم مطلوب")).toBeVisible();

    // Only spaces counts as empty.
    await dialog.getByLabel("الاسم").fill("   ");
    await save.click();
    await expect(dialog.getByText("الاسم مطلوب")).toBeVisible();

    // Typing clears the error.
    await dialog.getByLabel("الاسم").fill("م");
    await expect(dialog.getByText("الاسم مطلوب")).toBeHidden();

    await expect(dialog).toBeVisible();
    expect(sentRequests).toEqual([]);
  });

  test('delete: "إلغاء" keeps the category, "حذف التصنيف" removes it', async ({ page, request }) => {
    const category = await createCategoryByApi(request, `تصنيف حذف ${tag}`);
    await page.goto("/categories");
    await expect(rowWith(page, category.name)).toHaveCount(1);

    // Cancel
    await page.getByRole("button", { name: `حذف ${category.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "حذف التصنيف" });
    await expect(dialog).toContainText(`هل أنت متأكد من حذف التصنيف "${category.name}"؟`);
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    await expect(rowWith(page, category.name)).toHaveCount(1);

    // Confirm
    await page.getByRole("button", { name: `حذف ${category.name}` }).click();
    await dialog.getByRole("button", { name: "حذف التصنيف" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم حذف التصنيف بنجاح" })).toBeVisible();
    await expect(rowWith(page, category.name)).toHaveCount(0);

    // The API agrees: the category is gone.
    const response = await request.get(`${API_URL}/categories/${category.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(404);
  });

  test.describe("in use", () => {
    // The browser logs the refused DELETE (400) itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 400/] });

    test("delete a category used by a product shows the Arabic in-use message", async ({ page, request }) => {
      const category = await createCategoryByApi(request, `تصنيف مستخدم ${tag}`);
      const unit = await createByApi(request, token, "/item-unit", { name: `وحدة ${tag}` });
      await createProductByApi(request, token, {
        name: `صنف ${tag}`,
        categoryId: category.id,
        primaryItemUnitId: unit.id,
      });
      await page.goto("/categories");

      await page.getByRole("button", { name: `حذف ${category.name}` }).click();
      const dialog = page.getByRole("dialog", { name: "حذف التصنيف" });
      await dialog.getByRole("button", { name: "حذف التصنيف" }).click();

      await expect(dialog).toBeHidden();
      await expect(page.getByRole("alert").filter({ hasText: IN_USE_MESSAGE })).toBeVisible();
      await expect(page.getByText("تم حذف التصنيف بنجاح")).toHaveCount(0);
      await expect(rowWith(page, category.name)).toHaveCount(1);
    });
  });

  test("unsaved changes: closing a changed form asks first", async ({ page }) => {
    await page.goto("/categories");
    await page.getByRole("button", { name: "إضافة تصنيف" }).first().click();
    const form = page.getByRole("dialog", { name: "إضافة تصنيف" });
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    await form.getByLabel("الاسم").fill(`تصنيف لن يحفظ ${tag}`);

    // Escape → ask → "إلغاء" goes back to the form with the typed data kept.
    await page.keyboard.press("Escape");
    await expect(discard).toBeVisible();
    await expect(discard).toContainText("لديك تغييرات غير محفوظة. هل تريد إغلاق النموذج بدون حفظ؟");
    await discard.getByRole("button", { name: "إلغاء" }).click();
    await expect(discard).toBeHidden();
    await expect(form.getByLabel("الاسم")).toHaveValue(`تصنيف لن يحفظ ${tag}`);

    // X → ask; Escape inside the question only closes the question.
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
    await expect(rowWith(page, tag)).toHaveCount(0);
  });

  test("unsaved changes: an untouched form closes without asking", async ({ page, request }) => {
    const category = await createCategoryByApi(request, `تصنيف بدون تغيير ${tag}`);
    await page.goto("/categories");
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    // Add form: "إلغاء"
    await page.getByRole("button", { name: "إضافة تصنيف" }).first().click();
    const addForm = page.getByRole("dialog", { name: "إضافة تصنيف" });
    await addForm.getByRole("button", { name: "إلغاء" }).click();
    await expect(addForm).toBeHidden();

    // Edit form: Escape
    await page.getByRole("button", { name: `تعديل ${category.name}` }).click();
    const editForm = page.getByRole("dialog", { name: "تعديل التصنيف" });
    await expect(editForm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editForm).toBeHidden();

    await expect(discard).toHaveCount(0);
  });
});

test.describe("mocked API", () => {
  // Only the API URL (the app page can have the same path on port 5173).
  const isApiList = (url) => url.href === `${API_URL}/categories`;

  const FAKE_CATEGORY = {
    id: "c1",
    name: "تصنيف وهمي",
    code: "category-000001",
    createdAt: "2026-11-21T10:00:00.000Z",
    updatedAt: "2026-11-21T10:00:00.000Z",
    deletedAt: null,
  };

  // Answers GET /categories with the given status + body.
  function mockCategories(page, status, body) {
    return page.route(
      isApiList,
      (route) =>
        route.fulfill({ status, json: body, headers: { "Access-Control-Allow-Origin": "*" } }),
    );
  }

  test.describe("API error", () => {
    // The browser logs the failed request itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("shows ErrorState and the retry button loads the list", async ({ page }) => {
      await setFakeSession(page);
      await mockCategories(page, 500, {
        statusCode: 500,
        message: "Internal server error",
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        field: null,
      });
      await page.goto("/categories");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();

      await page.unroute(isApiList);
      await mockCategories(page, 200, {
        message: "All categories returned successfully",
        data: [FAKE_CATEGORY],
      });
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();

      const row = rowWith(page, "تصنيف وهمي");
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("category-000001");
      await expect(row).toContainText("21 نوفمبر 2026");
    });
  });

  test("empty list shows EmptyState with the add button", async ({ page }) => {
    await setFakeSession(page);
    await mockCategories(page, 200, { message: "All categories returned successfully", data: [] });
    await page.goto("/categories");

    const empty = page.getByText("لا توجد تصنيفات بعد").locator("..");
    await expect(empty).toBeVisible();
    await empty.getByRole("button", { name: "إضافة تصنيف" }).click();
    await expect(page.getByRole("dialog", { name: "إضافة تصنيف" })).toBeVisible();
  });

  test("add sends only { name } trimmed, and a 1-letter name is allowed", async ({ page }) => {
    let sentBody;
    await setFakeSession(page);
    await page.route(
      isApiList,
      (route) => {
        const headers = { "Access-Control-Allow-Origin": "*" };
        if (route.request().method() === "POST") {
          sentBody = route.request().postDataJSON();
          return route.fulfill({ status: 201, headers, json: { message: "ok", data: FAKE_CATEGORY } });
        }
        return route.fulfill({ status: 200, headers, json: { message: "ok", data: [FAKE_CATEGORY] } });
      },
    );
    await page.goto("/categories");

    await page.getByRole("button", { name: "إضافة تصنيف" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة تصنيف" });
    await dialog.getByLabel("الاسم").fill("  م  ");
    await dialog.getByRole("button", { name: "حفظ" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تمت إضافة التصنيف بنجاح" })).toBeVisible();
    expect(sentBody).toEqual({ name: "م" });
  });
});
