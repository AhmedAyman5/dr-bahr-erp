// Item Units page (الوحدات) — same approach as branches.spec.js.
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// Every test creates its own data with a unique random tag in the name, and afterEach
// deletes everything with that tag through the API (also when the test failed):
// products first, then categories and units (the backend refuses to delete used ones).
//
// "mocked API" tests fake the /item-unit endpoint with page.route (no backend needed).
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
  saveWithCodeRetry,
} from "./helpers";

// Week 2: a unit is "in use" as a product's primary unit OR as one of its other units (carton = 12).
const IN_USE_MESSAGE = "لا يمكن حذف هذه الوحدة لأنها مستخدمة في أصناف أو في وحدات الأصناف.";

// The table row that contains this text.
function rowWith(page, text) {
  return page.getByRole("row").filter({ hasText: text });
}

test.describe("with backend", () => {
  let token;
  let tag; // unique per test, part of every name this test creates

  function createUnitByApi(request, name) {
    return createByApi(request, token, "/item-unit", { name });
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
    await page.getByRole("navigation").getByRole("link", { name: "الوحدات" }).click();

    await expect(page).toHaveURL(/\/units$/);
    await expect(page.getByRole("heading", { name: "الوحدات" })).toBeVisible();
    await expect(page.getByText("وحدات القياس مثل القطعة والكرتونة والكيلو")).toBeVisible();
    await expect(page.getByText("جارٍ تحميل الوحدات...")).toBeHidden();
  });

  test("add a unit → success message → it appears in the table with a code", async ({ page }) => {
    const name = `وحدة اختبار ${tag}`;
    await page.goto("/units");

    await page.getByRole("button", { name: "إضافة وحدة" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة وحدة" });
    await expect(dialog).toBeVisible();
    // The first field gets focus; there is no code field in add mode.
    await expect(dialog.getByLabel("الاسم")).toBeFocused();
    await expect(dialog.getByLabel("الكود")).toHaveCount(0);

    await dialog.getByLabel("الاسم").fill(name);
    // Enter in a field submits the form (a random-code collision: حفظ once more, like a user).
    await saveWithCodeRetry(page, dialog.getByRole("button", { name: "حفظ" }), () => dialog.getByLabel("الاسم").press("Enter"));

    await expect(dialog).toBeHidden();
    const success = page.getByRole("alert").filter({ hasText: "تمت إضافة الوحدة بنجاح" });
    await expect(success).toBeVisible();

    const row = rowWith(page, name);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").first()).toHaveText(/^unit-\d+$/);

    // The success message hides by itself after ~4 seconds.
    await expect(success).toBeHidden({ timeout: 7000 });
  });

  test("search finds a unit by name and by code (case-insensitive)", async ({ page, request }) => {
    const unit = await createUnitByApi(request, `وحدة بحث ${tag}`);
    await page.goto("/units");
    await expect(rowWith(page, unit.name)).toHaveCount(1);

    const search = page.getByPlaceholder("ابحث بالاسم أو الكود");

    await search.fill(`  ${unit.name}  `);
    await expect(rowWith(page, unit.name)).toHaveCount(1);
    await expect(page.getByText("عدد الوحدات: 1")).toBeVisible();

    await search.fill(unit.code.toUpperCase());
    await expect(rowWith(page, unit.name)).toHaveCount(1);
    await expect(page.getByText("عدد الوحدات: 1")).toBeVisible();

    await search.fill(`لا يوجد ${tag} xyz`);
    await expect(page.getByText("لا توجد نتائج مطابقة للبحث")).toBeVisible();
    await expect(page.getByText("عدد الوحدات: 0")).toBeVisible();
  });

  test("edit name → updated in the table, code unchanged", async ({ page, request }) => {
    const unit = await createUnitByApi(request, `وحدة قديمة ${tag}`);
    const newName = `وحدة معدلة ${tag}`;
    await page.goto("/units");

    await page.getByRole("button", { name: `تعديل ${unit.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل الوحدة" });
    await expect(dialog).toBeVisible();

    // Code is shown read-only, the name is filled with the current value.
    const code = dialog.getByLabel("الكود");
    await expect(code).toHaveValue(unit.code);
    await expect(code).toHaveAttribute("readonly", "");
    await expect(dialog.getByLabel("الاسم")).toHaveValue(unit.name);

    await dialog.getByLabel("الاسم").fill(newName);
    await dialog.getByRole("button", { name: "حفظ" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل الوحدة بنجاح" })).toBeVisible();
    const row = rowWith(page, newName);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(unit.code);
    await expect(rowWith(page, unit.name)).toHaveCount(0);
  });

  test("validation: empty name shows an Arabic error and sends no request", async ({ page }) => {
    const sentRequests = [];
    page.on("request", (req) => {
      if (req.url().startsWith(`${API_URL}/item-unit`) && req.method() !== "GET") {
        sentRequests.push(`${req.method()} ${req.url()}`);
      }
    });

    await page.goto("/units");
    await page.getByRole("button", { name: "إضافة وحدة" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة وحدة" });
    const save = dialog.getByRole("button", { name: "حفظ" });

    await save.click();
    await expect(dialog.getByText("الاسم مطلوب")).toBeVisible();

    // Only spaces counts as empty.
    await dialog.getByLabel("الاسم").fill("   ");
    await save.click();
    await expect(dialog.getByText("الاسم مطلوب")).toBeVisible();

    // Typing clears the error.
    await dialog.getByLabel("الاسم").fill("ك");
    await expect(dialog.getByText("الاسم مطلوب")).toBeHidden();

    await expect(dialog).toBeVisible();
    expect(sentRequests).toEqual([]);
  });

  test('delete: "إلغاء" keeps the unit, "حذف الوحدة" removes it', async ({ page, request }) => {
    const unit = await createUnitByApi(request, `وحدة حذف ${tag}`);
    await page.goto("/units");
    await expect(rowWith(page, unit.name)).toHaveCount(1);

    // Cancel
    await page.getByRole("button", { name: `حذف ${unit.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "حذف الوحدة" });
    await expect(dialog).toContainText(`هل أنت متأكد من حذف الوحدة "${unit.name}"؟`);
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    await expect(rowWith(page, unit.name)).toHaveCount(1);

    // Confirm
    await page.getByRole("button", { name: `حذف ${unit.name}` }).click();
    await dialog.getByRole("button", { name: "حذف الوحدة" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم حذف الوحدة بنجاح" })).toBeVisible();
    await expect(rowWith(page, unit.name)).toHaveCount(0);

    // The API agrees: the unit is gone.
    const response = await request.get(`${API_URL}/item-unit/${unit.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(404);
  });

  test.describe("in use", () => {
    // The browser logs the refused DELETE (400) itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 400/] });

    test("delete a unit used by a product shows the Arabic in-use message", async ({ page, request }) => {
      const unit = await createUnitByApi(request, `وحدة مستخدمة ${tag}`);
      const category = await createByApi(request, token, "/categories", { name: `تصنيف ${tag}` });
      await createProductByApi(request, token, {
        name: `صنف ${tag}`,
        categoryId: category.id,
        primaryItemUnitId: unit.id,
      });
      await page.goto("/units");

      await page.getByRole("button", { name: `حذف ${unit.name}` }).click();
      const dialog = page.getByRole("dialog", { name: "حذف الوحدة" });
      await dialog.getByRole("button", { name: "حذف الوحدة" }).click();

      await expect(dialog).toBeHidden();
      await expect(page.getByRole("alert").filter({ hasText: IN_USE_MESSAGE })).toBeVisible();
      await expect(page.getByText("تم حذف الوحدة بنجاح")).toHaveCount(0);
      await expect(rowWith(page, unit.name)).toHaveCount(1);
    });

    test("delete a unit used only as a product unit (carton = 12) shows the same in-use message", async ({
      page,
      request,
    }) => {
      const piece = await createUnitByApi(request, `قطعة ${tag}`);
      const carton = await createUnitByApi(request, `كرتونة ${tag}`);
      const category = await createByApi(request, token, "/categories", { name: `تصنيف ${tag}` });
      const product = await createProductByApi(request, token, {
        name: `صنف ${tag}`,
        categoryId: category.id,
        primaryItemUnitId: piece.id,
      });
      await createByApi(request, token, `/products/${product.id}/units`, { itemUnitId: carton.id, factor: 12 });
      await page.goto("/units");

      const responsePromise = page.waitForResponse((res) => res.request().method() === "DELETE");
      await page.getByRole("button", { name: `حذف ${carton.name}` }).click();
      await page.getByRole("dialog", { name: "حذف الوحدة" }).getByRole("button", { name: "حذف الوحدة" }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(400);
      expect((await response.json()).code).toBe("BAD_REQUEST");

      await expect(page.getByRole("alert").filter({ hasText: IN_USE_MESSAGE })).toBeVisible();
      await expect(rowWith(page, carton.name)).toHaveCount(1);
    });
  });

  test("unsaved changes: closing a changed form asks first", async ({ page }) => {
    await page.goto("/units");
    await page.getByRole("button", { name: "إضافة وحدة" }).first().click();
    const form = page.getByRole("dialog", { name: "إضافة وحدة" });
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    await form.getByLabel("الاسم").fill(`وحدة لن تحفظ ${tag}`);

    // Escape → ask → "إلغاء" goes back to the form with the typed data kept.
    await page.keyboard.press("Escape");
    await expect(discard).toBeVisible();
    await expect(discard).toContainText("لديك تغييرات غير محفوظة. هل تريد إغلاق النموذج بدون حفظ؟");
    await discard.getByRole("button", { name: "إلغاء" }).click();
    await expect(discard).toBeHidden();
    await expect(form.getByLabel("الاسم")).toHaveValue(`وحدة لن تحفظ ${tag}`);

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
    const unit = await createUnitByApi(request, `وحدة بدون تغيير ${tag}`);
    await page.goto("/units");
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    // Add form: "إلغاء"
    await page.getByRole("button", { name: "إضافة وحدة" }).first().click();
    const addForm = page.getByRole("dialog", { name: "إضافة وحدة" });
    await addForm.getByRole("button", { name: "إلغاء" }).click();
    await expect(addForm).toBeHidden();

    // Edit form: Escape
    await page.getByRole("button", { name: `تعديل ${unit.name}` }).click();
    const editForm = page.getByRole("dialog", { name: "تعديل الوحدة" });
    await expect(editForm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editForm).toBeHidden();

    await expect(discard).toHaveCount(0);
  });
});

test.describe("mocked API", () => {
  // Only the API URL (the app page can have the same path on port 5173).
  const isApiList = (url) => url.href === `${API_URL}/item-unit`;

  const FAKE_UNIT = {
    id: "u1",
    name: "وحدة وهمية",
    code: "unit-000001",
    createdAt: "2026-11-21T10:00:00.000Z",
    updatedAt: "2026-11-21T10:00:00.000Z",
    deletedAt: null,
  };

  // Answers GET /item-unit with the given status + body.
  function mockUnits(page, status, body) {
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
      await mockUnits(page, 500, {
        statusCode: 500,
        message: "Internal server error",
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        field: null,
      });
      await page.goto("/units");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();

      await page.unroute(isApiList);
      await mockUnits(page, 200, {
        message: "All item units returned successfully",
        data: [FAKE_UNIT],
      });
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();

      const row = rowWith(page, "وحدة وهمية");
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("unit-000001");
      await expect(row).toContainText("21 نوفمبر 2026");
    });
  });

  test("empty list shows EmptyState with the add button", async ({ page }) => {
    await setFakeSession(page);
    await mockUnits(page, 200, { message: "All item units returned successfully", data: [] });
    await page.goto("/units");

    const empty = page.getByText("لا توجد وحدات بعد").locator("..");
    await expect(empty).toBeVisible();
    await empty.getByRole("button", { name: "إضافة وحدة" }).click();
    await expect(page.getByRole("dialog", { name: "إضافة وحدة" })).toBeVisible();
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
          return route.fulfill({ status: 201, headers, json: { message: "ok", data: FAKE_UNIT } });
        }
        return route.fulfill({ status: 200, headers, json: { message: "ok", data: [FAKE_UNIT] } });
      },
    );
    await page.goto("/units");

    await page.getByRole("button", { name: "إضافة وحدة" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة وحدة" });
    await dialog.getByLabel("الاسم").fill("  ك  ");
    await dialog.getByRole("button", { name: "حفظ" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تمت إضافة الوحدة بنجاح" })).toBeVisible();
    expect(sentBody).toEqual({ name: "ك" });
  });
});
