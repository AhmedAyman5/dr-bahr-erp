// Branches page (الفروع) — the reference CRUD page.
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// Every test creates its own branches with a unique random tag in the name, and afterEach
// deletes every branch with that tag through the API (also when the test failed).
//
// "mocked API" tests fake the /branch endpoint with page.route (no backend needed).
import {
  test,
  expect,
  setSession,
  setFakeSession,
  isApiUp,
  apiLogin,
  createByApi,
  randomTag,
  API_URL,
  API_DOWN_MESSAGE,
  saveWithCodeRetry,
} from "./helpers";

// The table row that contains this text.
function rowWith(page, text) {
  return page.getByRole("row").filter({ hasText: text });
}

test.describe("with backend", () => {
  let token;
  let tag; // unique per test, part of every branch name this test creates

  // Creates a branch through the API and returns it (a random-code collision is retried once: see helpers).
  function createBranchByApi(request, body) {
    return createByApi(request, token, "/branch", body);
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

    const headers = { Authorization: `Bearer ${token}` };
    const response = await request.get(`${API_URL}/branch`, { headers });
    const branches = (await response.json()).data || [];
    for (const branch of branches.filter((b) => b.name.includes(tag))) {
      await request.delete(`${API_URL}/branch/${branch.id}`, { headers });
    }
    tag = undefined;
  });

  test("opens from the Sidebar link with no console errors", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "الفروع" }).click();

    await expect(page).toHaveURL(/\/branches$/);
    await expect(page.getByRole("heading", { name: "الفروع" })).toBeVisible();
    await expect(page.getByText("إدارة فروع الشركة")).toBeVisible();
    await expect(page.getByText("جارٍ تحميل الفروع...")).toBeHidden();
  });

  test("add a branch → success message → it appears in the table with a code", async ({ page }) => {
    const name = `فرع اختبار ${tag}`;
    await page.goto("/branches");

    await page.getByRole("button", { name: "إضافة فرع" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة فرع" });
    await expect(dialog).toBeVisible();
    // The first field gets focus.
    await expect(dialog.getByLabel("الاسم")).toBeFocused();

    await dialog.getByLabel("الاسم").fill(name);
    await dialog.getByLabel("العنوان").fill("القاهرة، وسط البلد");
    // Enter in a field submits the form (a random-code collision: حفظ once more, like a user).
    await saveWithCodeRetry(page, dialog.getByRole("button", { name: "حفظ" }), () =>
      dialog.getByLabel("العنوان").press("Enter"),
    );

    await expect(dialog).toBeHidden();
    const success = page.getByRole("alert").filter({ hasText: "تمت إضافة الفرع بنجاح" });
    await expect(success).toBeVisible();

    const row = rowWith(page, name);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").first()).toHaveText(/^branch-\d+$/);
    await expect(row).toContainText("القاهرة، وسط البلد");

    // The success message hides by itself after ~4 seconds.
    await expect(success).toBeHidden({ timeout: 7000 });
  });

  test("search finds a branch by name and by code (case-insensitive)", async ({ page, request }) => {
    const branch = await createBranchByApi(request, { name: `فرع بحث ${tag}`, address: "الإسكندرية" });
    await page.goto("/branches");
    await expect(rowWith(page, branch.name)).toHaveCount(1);

    const search = page.getByPlaceholder("ابحث بالاسم أو الكود أو العنوان");

    await search.fill(`  ${branch.name}  `);
    await expect(rowWith(page, branch.name)).toHaveCount(1);
    await expect(page.getByText("عدد الفروع: 1")).toBeVisible();

    await search.fill(branch.code.toUpperCase());
    await expect(rowWith(page, branch.name)).toHaveCount(1);
    await expect(page.getByText("عدد الفروع: 1")).toBeVisible();

    await search.fill(`لا يوجد ${tag} xyz`);
    await expect(page.getByText("لا توجد نتائج مطابقة للبحث")).toBeVisible();
    await expect(page.getByText("عدد الفروع: 0")).toBeVisible();
  });

  test("edit name + address → updated in the table", async ({ page, request }) => {
    const branch = await createBranchByApi(request, { name: `فرع قديم ${tag}`, address: "عنوان قديم" });
    const newName = `فرع معدل ${tag}`;
    await page.goto("/branches");

    await page.getByRole("button", { name: `تعديل ${branch.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل الفرع" });
    await expect(dialog).toBeVisible();

    // Code is shown read-only, fields are filled with the current values.
    const code = dialog.getByLabel("الكود");
    await expect(code).toHaveValue(branch.code);
    await expect(code).toHaveAttribute("readonly", "");
    await expect(dialog.getByLabel("الاسم")).toHaveValue(branch.name);

    await dialog.getByLabel("الاسم").fill(newName);
    await dialog.getByLabel("العنوان").fill("عنوان جديد");
    await dialog.getByRole("button", { name: "حفظ" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل الفرع بنجاح" })).toBeVisible();
    const row = rowWith(page, newName);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(branch.code);
    await expect(row).toContainText("عنوان جديد");
    await expect(rowWith(page, branch.name)).toHaveCount(0);
  });

  test("after saving an edit the list refreshes silently: no LoadingState, the table stays visible", async ({
    page,
    request,
  }) => {
    const branch = await createBranchByApi(request, { name: `فرع تحديث ${tag}`, address: "عنوان" });
    const newName = `فرع بعد التحديث ${tag}`;
    await page.goto("/branches");
    await expect(rowWith(page, branch.name)).toHaveCount(1);

    // From now on: remember if the loading text ever shows, and slow the list request down
    // so a LoadingState would have time to appear.
    await page.evaluate(() => {
      window.sawLoadingState = false;
      new MutationObserver(() => {
        if (document.body.textContent.includes("جارٍ تحميل الفروع...")) window.sawLoadingState = true;
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await page.route(
      (url) => url.pathname === "/branch",
      async (route) => {
        if (route.request().method() === "GET") await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      },
    );

    await page.getByRole("button", { name: `تعديل ${branch.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل الفرع" });
    await dialog.getByLabel("الاسم").fill(newName);
    const refreshRequest = page.waitForRequest((req) => req.url() === `${API_URL}/branch` && req.method() === "GET");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    await refreshRequest;

    // While the slow refresh runs: the table is still on screen with the old row.
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل الفرع بنجاح" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(rowWith(page, branch.name)).toHaveCount(1);

    // When it is done: the new name is shown, and LoadingState never appeared.
    await expect(rowWith(page, newName)).toHaveCount(1);
    await expect(rowWith(page, branch.name)).toHaveCount(0);
    expect(await page.evaluate(() => window.sawLoadingState)).toBe(false);
  });

  test('clearing the address on edit sends null and shows "-" in the table', async ({ page, request }) => {
    const branch = await createBranchByApi(request, { name: `فرع عنوان ${tag}`, address: "عنوان سيتم مسحه" });
    await page.goto("/branches");
    await expect(rowWith(page, branch.name)).toContainText("عنوان سيتم مسحه");

    await page.getByRole("button", { name: `تعديل ${branch.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل الفرع" });
    await dialog.getByLabel("العنوان").fill("   ");
    const requestPromise = page.waitForRequest((req) => req.method() === "PATCH");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    expect((await requestPromise).postDataJSON()).toEqual({ name: branch.name, address: null });

    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل الفرع بنجاح" })).toBeVisible();
    const row = rowWith(page, branch.name);
    await expect(row.getByRole("cell").nth(2)).toHaveText("-");

    // The API agrees: the address is really cleared.
    const response = await request.get(`${API_URL}/branch/${branch.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await response.json()).data.address).toBeNull();
  });

  test("add without an address: the empty address is left out of the body", async ({ page }) => {
    const name = `فرع بدون عنوان ${tag}`;
    await page.goto("/branches");
    await page.getByRole("button", { name: "إضافة فرع" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة فرع" });
    await dialog.getByLabel("الاسم").fill(name);

    const requestPromise = page.waitForRequest((req) => req.method() === "POST");
    await saveWithCodeRetry(page, dialog.getByRole("button", { name: "حفظ" }));
    expect((await requestPromise).postDataJSON()).toEqual({ name });

    await expect(rowWith(page, name).getByRole("cell").nth(2)).toHaveText("-");
  });

  test("validation: empty and 1-letter names show Arabic errors and send no request", async ({ page }) => {
    const sentRequests = [];
    page.on("request", (req) => {
      if (req.url().startsWith(`${API_URL}/branch`) && req.method() !== "GET") {
        sentRequests.push(`${req.method()} ${req.url()}`);
      }
    });

    await page.goto("/branches");
    await page.getByRole("button", { name: "إضافة فرع" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة فرع" });
    const save = dialog.getByRole("button", { name: "حفظ" });

    await save.click();
    await expect(dialog.getByText("الاسم مطلوب")).toBeVisible();

    // Only spaces counts as empty.
    await dialog.getByLabel("الاسم").fill("   ");
    await save.click();
    await expect(dialog.getByText("الاسم مطلوب")).toBeVisible();

    await dialog.getByLabel("الاسم").fill("ف");
    await save.click();
    await expect(dialog.getByText("الاسم يجب أن يكون حرفين على الأقل")).toBeVisible();

    await expect(dialog).toBeVisible();
    expect(sentRequests).toEqual([]);
  });

  test('delete: "إلغاء" keeps the branch, "حذف الفرع" removes it', async ({ page, request }) => {
    const branch = await createBranchByApi(request, { name: `فرع حذف ${tag}` });
    await page.goto("/branches");
    await expect(rowWith(page, branch.name)).toHaveCount(1);

    // Cancel
    await page.getByRole("button", { name: `حذف ${branch.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "حذف الفرع" });
    await expect(dialog).toContainText(`هل أنت متأكد من حذف الفرع "${branch.name}"؟`);
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    await expect(rowWith(page, branch.name)).toHaveCount(1);

    // Confirm
    await page.getByRole("button", { name: `حذف ${branch.name}` }).click();
    await dialog.getByRole("button", { name: "حذف الفرع" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم حذف الفرع بنجاح" })).toBeVisible();
    await expect(rowWith(page, branch.name)).toHaveCount(0);

    // The API agrees: the branch is gone.
    const response = await request.get(`${API_URL}/branch/${branch.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(404);
  });

  test("unsaved changes: closing a changed form asks first", async ({ page }) => {
    await page.goto("/branches");
    await page.getByRole("button", { name: "إضافة فرع" }).first().click();
    const form = page.getByRole("dialog", { name: "إضافة فرع" });
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    await form.getByLabel("الاسم").fill(`فرع لن يحفظ ${tag}`);

    // Escape → ask → "إلغاء" goes back to the form with the typed data kept.
    await page.keyboard.press("Escape");
    await expect(discard).toBeVisible();
    await expect(discard).toContainText("لديك تغييرات غير محفوظة. هل تريد إغلاق النموذج بدون حفظ؟");
    await discard.getByRole("button", { name: "إلغاء" }).click();
    await expect(discard).toBeHidden();
    await expect(form.getByLabel("الاسم")).toHaveValue(`فرع لن يحفظ ${tag}`);

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
    const branch = await createBranchByApi(request, { name: `فرع بدون تغيير ${tag}` });
    await page.goto("/branches");
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    // Add form: "إلغاء"
    await page.getByRole("button", { name: "إضافة فرع" }).first().click();
    const addForm = page.getByRole("dialog", { name: "إضافة فرع" });
    await addForm.getByRole("button", { name: "إلغاء" }).click();
    await expect(addForm).toBeHidden();

    // Edit form: Escape
    await page.getByRole("button", { name: `تعديل ${branch.name}` }).click();
    const editForm = page.getByRole("dialog", { name: "تعديل الفرع" });
    await expect(editForm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editForm).toBeHidden();

    await expect(discard).toHaveCount(0);
  });
});

test.describe("mocked API", () => {
  // Answers GET /branch with the given status + body.
  function mockBranches(page, status, body) {
    return page.route(
      (url) => url.pathname === "/branch",
      (route) =>
        route.fulfill({ status, json: body, headers: { "Access-Control-Allow-Origin": "*" } }),
    );
  }

  test.describe("API error", () => {
    // The browser logs the failed request itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("shows ErrorState and the retry button loads the list", async ({ page }) => {
      await setFakeSession(page);
      await mockBranches(page, 500, {
        statusCode: 500,
        message: "Internal server error",
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        field: null,
      });
      await page.goto("/branches");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();

      await page.unroute((url) => url.pathname === "/branch");
      await mockBranches(page, 200, {
        message: "All branches returned successfully",
        data: [
          {
            id: "b1",
            name: "فرع وهمي",
            code: "branch-000001",
            address: null,
            createdAt: "2026-11-21T10:00:00.000Z",
            updatedAt: "2026-11-21T10:00:00.000Z",
            deletedAt: null,
          },
        ],
      });
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();

      const row = rowWith(page, "فرع وهمي");
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("branch-000001");
      await expect(row.getByRole("cell").nth(2)).toHaveText("-");
      await expect(row).toContainText("21 نوفمبر 2026");
    });
  });

  test("empty list shows EmptyState with the add button", async ({ page }) => {
    await setFakeSession(page);
    await mockBranches(page, 200, { message: "All branches returned successfully", data: [] });
    await page.goto("/branches");

    const empty = page.getByText("لا توجد فروع بعد").locator("..");
    await expect(empty).toBeVisible();
    await empty.getByRole("button", { name: "إضافة فرع" }).click();
    await expect(page.getByRole("dialog", { name: "إضافة فرع" })).toBeVisible();
  });

  test.describe("random code collision", () => {
    // The browser logs the failed POST itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 409/] });

    // The backend picks a random code without checking it is free (issue sent to Mazen): the create can
    // answer 409 ALREADY_EXISTS on "code". Same message on every page whose code comes from the server
    // (utils/errors.js), so one page is enough here.
    test('409 ALREADY_EXISTS on "code" → "تعذر إنشاء كود تلقائي" and the form stays open; saving again works', async ({
      page,
    }) => {
      const headers = { "Access-Control-Allow-Origin": "*" };
      const branches = [];
      const sentBodies = [];
      await setFakeSession(page);
      await page.route(
        (url) => url.pathname === "/branch",
        (route) => {
          if (route.request().method() !== "POST") {
            return route.fulfill({ status: 200, headers, json: { message: "ok", data: branches } });
          }
          sentBodies.push(route.request().postDataJSON());
          // 1st save: the random code is taken. 2nd save: a new code → created.
          if (sentBodies.length === 1) {
            return route.fulfill({
              status: 409,
              headers,
              json: { statusCode: 409, message: "code already exists", error: "Conflict", code: "ALREADY_EXISTS", field: "code" },
            });
          }
          const created = {
            id: "b1",
            name: "فرع الكود",
            code: "branch-482913",
            address: "طنطا",
            createdAt: "2026-11-26T10:00:00.000Z",
            updatedAt: "2026-11-26T10:00:00.000Z",
            deletedAt: null,
          };
          branches.push(created);
          return route.fulfill({ status: 201, headers, json: { message: "ok", data: created } });
        },
      );
      await page.goto("/branches");

      await page.getByRole("button", { name: "إضافة فرع" }).first().click();
      const dialog = page.getByRole("dialog", { name: "إضافة فرع" });
      await dialog.getByLabel("الاسم").fill("فرع الكود");
      await dialog.getByLabel("العنوان").fill("طنطا");
      await dialog.getByRole("button", { name: "حفظ" }).click();

      // The clear Arabic message, never "الكود مستخدم بالفعل" (the user never typed a code).
      await expect(dialog.getByRole("alert")).toHaveText("تعذر إنشاء كود تلقائي، اضغط حفظ مرة أخرى");
      await expect(dialog.getByText("الكود مستخدم بالفعل")).toHaveCount(0);
      // The form stays open with the user's input.
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("الاسم")).toHaveValue("فرع الكود");
      await expect(dialog.getByLabel("العنوان")).toHaveValue("طنطا");

      // Saving again sends the same body and works.
      await dialog.getByRole("button", { name: "حفظ" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("alert").filter({ hasText: "تمت إضافة الفرع بنجاح" })).toBeVisible();
      await expect(rowWith(page, "فرع الكود")).toContainText("branch-482913");
      expect(sentBodies).toEqual([
        { name: "فرع الكود", address: "طنطا" },
        { name: "فرع الكود", address: "طنطا" },
      ]);
    });
  });

  // e2e/helpers.js saveWithCodeRetry: what the real-backend "add" tests use. No test.use here: the helper itself
  // allows exactly the ONE 409 log of the collision (any other console error still fails the test).
  test("saveWithCodeRetry: 409 on code → the message, حفظ once more → saved (exactly 2 POSTs)", async ({ page }) => {
    const headers = { "Access-Control-Allow-Origin": "*" };
    const branches = [];
    let posts = 0;
    await setFakeSession(page);
    await page.route(
      (url) => url.pathname === "/branch",
      (route) => {
        if (route.request().method() !== "POST") {
          return route.fulfill({ status: 200, headers, json: { message: "ok", data: branches } });
        }
        // Counted by POST (StrictMode loads the list twice in dev, but never saves twice).
        posts += 1;
        if (posts === 1) {
          return route.fulfill({
            status: 409,
            headers,
            json: { statusCode: 409, message: "code already exists", error: "Conflict", code: "ALREADY_EXISTS", field: "code" },
          });
        }
        const created = { id: "b2", name: "فرع المساعد", code: "branch-111222", address: null };
        branches.push(created);
        return route.fulfill({ status: 201, headers, json: { message: "ok", data: created } });
      },
    );
    await page.goto("/branches");
    await page.getByRole("button", { name: "إضافة فرع" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة فرع" });
    await dialog.getByLabel("الاسم").fill("فرع المساعد");

    const response = await saveWithCodeRetry(page, dialog.getByRole("button", { name: "حفظ" }));
    expect(response.status()).toBe(201);
    await expect(dialog).toBeHidden();
    await expect(rowWith(page, "فرع المساعد")).toContainText("branch-111222");
    expect(posts).toBe(2);
  });
});
