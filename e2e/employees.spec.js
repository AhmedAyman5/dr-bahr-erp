// Employees page (الموظفين).
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// Every test creates its own branch(es) + employees with a unique random tag in the name.
// afterEach deletes the tagged employees FIRST, then the tagged branches (also when the test failed).
// National IDs are random 14-digit values every run: soft-deleted employees keep them reserved.
//
// "mocked API" tests fake /employees and /branch with page.route (no backend needed).
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

// The table row that contains this text.
function rowWith(page, text) {
  return page.getByRole("row").filter({ hasText: text });
}

// Random 14-digit national ID (first digit 2 or 3, like real Egyptian IDs).
function randomNationalId() {
  let digits = String(2 + Math.floor(Math.random() * 2));
  while (digits.length < 14) digits += Math.floor(Math.random() * 10);
  return digits;
}

// Collects every non-GET request sent to /employees... (to check that nothing was sent).
function trackEmployeeWrites(page) {
  const sent = [];
  page.on("request", (req) => {
    if (req.url().startsWith(`${API_URL}/employees`) && req.method() !== "GET") {
      sent.push(`${req.method()} ${req.url()}`);
    }
  });
  return sent;
}

// Cleanup: employees have "fullName" (not "name"), so deleteByTag cannot be used for them.
async function deleteEmployeesByTag(request, token, tag) {
  const headers = { Authorization: `Bearer ${token}` };
  const response = await request.get(`${API_URL}/employees`, { headers });
  const employees = (await response.json()).data || [];
  for (const employee of employees.filter((e) => e.fullName.includes(tag))) {
    await request.delete(`${API_URL}/employees/${employee.id}`, { headers });
  }
}

test.describe("with backend", () => {
  let token;
  let tag; // unique per test, part of every branch / employee name this test creates
  let branch; // a test branch created before every test

  function createBranch(request, name) {
    return createByApi(request, token, "/branch", { name, address: "عنوان فرع اختبار" });
  }

  function createEmployee(request, branchId, body) {
    return createByApi(request, token, `/employees/branch/${branchId}`, body);
  }

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);

    tag = randomTag();
    const session = await apiLogin(request);
    token = session.access_token;
    branch = await createBranch(request, `فرع موظفين ${tag}`);
    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;
    // Employees first, then their branches.
    await deleteEmployeesByTag(request, token, tag);
    await deleteByTag(request, token, "/branch", tag);
    tag = undefined;
  });

  test('opens from the Sidebar link (group "الموظفين والمستخدمين") with no console errors', async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav.getByText("الموظفين والمستخدمين")).toBeVisible();
    await expect(nav.getByRole("link")).toContainText(["العملاء", "الموردين", "الموظفين"]);
    await nav.getByRole("link", { name: "الموظفين" }).click();

    await expect(page).toHaveURL(/\/employees$/);
    await expect(page.getByRole("heading", { name: "الموظفين" })).toBeVisible();
    await expect(page.getByText("بيانات الموظفين وتوزيعهم على الفروع")).toBeVisible();
    await expect(page.getByText("جارٍ تحميل الموظفين...")).toBeHidden();
  });

  test("add: branch is required, then POST /employees/branch/<id> with only the documented fields", async ({
    page,
  }) => {
    const sent = trackEmployeeWrites(page);
    const fullName = `موظف اختبار ${tag}`;
    const nationalId = randomNationalId();
    await page.goto("/employees");

    await page.getByRole("button", { name: "إضافة موظف" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة موظف" });
    await expect(dialog).toBeVisible();
    // No branch preselected → the branch Select gets focus.
    await expect(dialog.getByLabel("الفرع")).toBeFocused();
    // Add mode has no code field.
    await expect(dialog.getByLabel("الكود")).toHaveCount(0);

    // Without a branch: Arabic error, no request.
    await dialog.getByLabel("الاسم بالكامل").fill(fullName);
    await dialog.getByLabel("الرقم القومي").fill(nationalId);
    await dialog.getByLabel("الوظيفة").fill("  مندوب مبيعات  ");
    // DateInput: typed as DD/MM/YYYY, sent as "YYYY-MM-DD".
    await dialog.getByLabel("تاريخ التعيين").fill("15/03/2025");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    await expect(dialog.getByText("الفرع مطلوب")).toBeVisible();
    expect(sent).toEqual([]);

    await dialog.getByLabel("الفرع").selectOption({ label: branch.name });
    await expect(dialog.getByText("الفرع مطلوب")).toBeHidden();

    const requestPromise = page.waitForRequest(
      (req) => req.method() === "POST" && req.url().startsWith(`${API_URL}/employees`),
    );
    // Enter in a field submits the form.
    await dialog.getByLabel("الوظيفة").press("Enter");
    const request = await requestPromise;
    expect(request.url()).toBe(`${API_URL}/employees/branch/${branch.id}`);
    // No branchId, no code; text trimmed; date as "YYYY-MM-DD".
    expect(request.postDataJSON()).toEqual({
      fullName,
      nationalId,
      jobTitle: "مندوب مبيعات",
      hireDate: "2025-03-15",
    });

    await expect(dialog).toBeHidden();
    const success = page.getByRole("alert").filter({ hasText: "تمت إضافة الموظف بنجاح" });
    await expect(success).toBeVisible();

    const row = rowWith(page, fullName);
    await expect(row).toHaveCount(1);
    const cells = row.getByRole("cell");
    // Cells: code, name (+ the job title under it), branch, national ID, hire date.
    await expect(cells.nth(0)).toHaveText(/^EMP-/);
    await expectStackedCell(cells.nth(1), fullName, "مندوب مبيعات");
    await expect(cells.nth(2)).toHaveText(branch.name);
    await expect(cells.nth(3)).toHaveText(nationalId);
    await expect(cells.nth(3).locator("[dir=ltr]")).toHaveCount(1);
    await expect(cells.nth(4)).toHaveText("15 مارس 2025");

    // The success message hides by itself after ~4 seconds.
    await expect(success).toBeHidden({ timeout: 7000 });
  });

  test("add with only the name: empty optional fields are left out of the body", async ({ page }) => {
    const fullName = `موظف بدون بيانات ${tag}`;
    await page.goto("/employees");
    await page.getByRole("button", { name: "إضافة موظف" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة موظف" });
    await dialog.getByLabel("الفرع").selectOption({ label: branch.name });
    await dialog.getByLabel("الاسم بالكامل").fill(fullName);
    await dialog.getByLabel("الوظيفة").fill("   ");

    const requestPromise = page.waitForRequest((req) => req.method() === "POST");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    expect((await requestPromise).postDataJSON()).toEqual({ fullName });

    await expect(dialog).toBeHidden();
    const cells = rowWith(page, fullName).getByRole("cell");
    await expectStackedCell(cells.nth(1), fullName, null); // no job title
    await expect(cells.nth(3)).toHaveText("-");
    await expect(cells.nth(4)).toHaveText("-");
  });

  test("validation: name required, national ID must be exactly 14 digits — Arabic errors, no request", async ({
    page,
  }) => {
    const sent = trackEmployeeWrites(page);
    await page.goto("/employees");
    await page.getByRole("button", { name: "إضافة موظف" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة موظف" });
    const save = dialog.getByRole("button", { name: "حفظ" });
    const nationalIdError = dialog.getByText("الرقم القومي يجب أن يكون 14 رقماً");
    await dialog.getByLabel("الفرع").selectOption({ label: branch.name });

    // Name: empty and only spaces.
    await save.click();
    await expect(dialog.getByText("الاسم بالكامل مطلوب")).toBeVisible();
    await dialog.getByLabel("الاسم بالكامل").fill("   ");
    await save.click();
    await expect(dialog.getByText("الاسم بالكامل مطلوب")).toBeVisible();
    await dialog.getByLabel("الاسم بالكامل").fill(`موظف ${tag}`);

    // National ID input is LTR + numeric keyboard.
    const nationalIdInput = dialog.getByLabel("الرقم القومي");
    await expect(nationalIdInput).toHaveAttribute("dir", "ltr");
    await expect(nationalIdInput).toHaveAttribute("inputmode", "numeric");

    // 13 digits
    await nationalIdInput.fill("2990101123456");
    await save.click();
    await expect(nationalIdError).toBeVisible();
    // Typing clears the error.
    await nationalIdInput.fill("299010112345");
    await expect(nationalIdError).toBeHidden();

    // Letters / mixed
    await nationalIdInput.fill("2990101abc4567");
    await save.click();
    await expect(nationalIdError).toBeVisible();

    // 15 digits
    await nationalIdInput.fill("299010112345678");
    await save.click();
    await expect(nationalIdError).toBeVisible();

    await expect(dialog).toBeVisible();
    expect(sent).toEqual([]);
  });

  test.describe("server conflicts", () => {
    // The browser logs the failed request itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 409/] });

    test("duplicate national ID → Arabic \"already used\" error, typed data is kept", async ({ page, request }) => {
      const nationalId = randomNationalId();
      await createEmployee(request, branch.id, { fullName: `موظف أول ${tag}`, nationalId });
      const fullName = `موظف مكرر ${tag}`;
      await page.goto("/employees");

      await page.getByRole("button", { name: "إضافة موظف" }).first().click();
      const dialog = page.getByRole("dialog", { name: "إضافة موظف" });
      await dialog.getByLabel("الفرع").selectOption({ label: branch.name });
      await dialog.getByLabel("الاسم بالكامل").fill(fullName);
      await dialog.getByLabel("الرقم القومي").fill(nationalId);
      await dialog.getByRole("button", { name: "حفظ" }).click();

      await expect(dialog.getByRole("alert")).toHaveText("الرقم القومي مستخدم بالفعل، اختر قيمة أخرى");
      await expect(dialog.getByLabel("الاسم بالكامل")).toHaveValue(fullName);
      await expect(dialog.getByLabel("الرقم القومي")).toHaveValue(nationalId);
      await expect(dialog.getByRole("button", { name: "حفظ" })).toBeEnabled();
    });
  });

  test("edit: branch + code are read-only, the rest is updated", async ({ page, request }) => {
    const employee = await createEmployee(request, branch.id, {
      fullName: `موظف قديم ${tag}`,
      nationalId: randomNationalId(),
      jobTitle: "محاسب",
      hireDate: "2025-01-01",
    });
    const newName = `موظف معدل ${tag}`;
    const newNationalId = randomNationalId();
    await page.goto("/employees");

    await page.getByRole("button", { name: `تعديل ${employee.fullName}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل الموظف" });
    await expect(dialog).toBeVisible();

    // Branch: shown by name, read-only, with the note. No branch Select.
    const branchField = dialog.getByLabel("الفرع");
    await expect(branchField).toHaveValue(branch.name);
    await expect(branchField).toHaveAttribute("readonly", "");
    await expect(dialog.getByText("لا يمكن تغيير فرع الموظف")).toBeVisible();
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    // Code: read-only.
    await expect(dialog.getByLabel("الكود")).toHaveValue(employee.code);
    await expect(dialog.getByLabel("الكود")).toHaveAttribute("readonly", "");
    // Saved values, the hire date without a day shift.
    await expect(dialog.getByLabel("الاسم بالكامل")).toHaveValue(employee.fullName);
    await expect(dialog.getByLabel("الاسم بالكامل")).toBeFocused();
    await expect(dialog.getByLabel("الرقم القومي")).toHaveValue(employee.nationalId);
    await expect(dialog.getByLabel("الوظيفة")).toHaveValue("محاسب");
    await expect(dialog.getByLabel("تاريخ التعيين")).toHaveValue("01/01/2025");

    await dialog.getByLabel("الاسم بالكامل").fill(newName);
    await dialog.getByLabel("الرقم القومي").fill(newNationalId);
    await dialog.getByLabel("الوظيفة").fill("مدير فرع");
    const requestPromise = page.waitForRequest((req) => req.method() === "PATCH");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    const patch = await requestPromise;
    expect(patch.url()).toBe(`${API_URL}/employees/${employee.id}`);
    expect(patch.postDataJSON()).toEqual({
      fullName: newName,
      nationalId: newNationalId,
      jobTitle: "مدير فرع",
      hireDate: "2025-01-01",
    });

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل الموظف بنجاح" })).toBeVisible();
    const cells = rowWith(page, newName).getByRole("cell");
    await expect(cells.nth(0)).toHaveText(employee.code);
    await expectStackedCell(cells.nth(1), newName, "مدير فرع");
    await expect(cells.nth(2)).toHaveText(branch.name);
    await expect(cells.nth(3)).toHaveText(newNationalId);
    await expect(cells.nth(4)).toHaveText("1 يناير 2025");
    await expect(rowWith(page, employee.fullName)).toHaveCount(0);
  });

  test("edit: emptying national ID, job title and hire date sends null; two employees can both have none", async ({
    page,
    request,
  }) => {
    const first = await createEmployee(request, branch.id, {
      fullName: `موظف أ ${tag}`,
      nationalId: randomNationalId(),
      jobTitle: "سائق",
      hireDate: "2024-05-05",
    });
    const second = await createEmployee(request, branch.id, {
      fullName: `موظف ب ${tag}`,
      nationalId: randomNationalId(),
    });
    await page.goto("/employees");

    for (const employee of [first, second]) {
      await page.getByRole("button", { name: `تعديل ${employee.fullName}` }).click();
      const dialog = page.getByRole("dialog", { name: "تعديل الموظف" });
      await dialog.getByLabel("الرقم القومي").fill("");
      await dialog.getByLabel("الوظيفة").fill("");
      await dialog.getByLabel("تاريخ التعيين").fill("");

      const requestPromise = page.waitForRequest((req) => req.method() === "PATCH");
      await dialog.getByRole("button", { name: "حفظ" }).click();
      // Every emptied optional field is sent as null (never ""), even one that was already empty.
      expect((await requestPromise).postDataJSON()).toEqual({
        fullName: employee.fullName,
        nationalId: null,
        jobTitle: null,
        hireDate: null,
      });

      await expect(dialog).toBeHidden();
      await expect(page.getByRole("alert").filter({ hasText: "تم تعديل الموظف بنجاح" })).toBeVisible();
      const cells = rowWith(page, employee.fullName).getByRole("cell");
      await expectStackedCell(cells.nth(1), employee.fullName, null); // the job title was cleared
      await expect(cells.nth(3)).toHaveText("-");
      await expect(cells.nth(4)).toHaveText("-");
    }

    // The API agrees: both have no national ID, job title or hire date.
    for (const employee of [first, second]) {
      const response = await request.get(`${API_URL}/employees/${employee.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect((await response.json()).data).toMatchObject({ nationalId: null, jobTitle: null, hireDate: null });
    }
  });

  test('hire date: changing it saves without a day shift; emptying it clears it (null → "-")', async ({
    page,
    request,
  }) => {
    const employee = await createEmployee(request, branch.id, {
      fullName: `موظف تاريخ ${tag}`,
      hireDate: "2024-12-31",
    });
    await page.goto("/employees");
    await expect(rowWith(page, employee.fullName).getByRole("cell").nth(4)).toHaveText("31 ديسمبر 2024");

    await page.getByRole("button", { name: `تعديل ${employee.fullName}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل الموظف" });
    const hireDate = dialog.getByLabel("تاريخ التعيين");
    await expect(hireDate).toHaveValue("31/12/2024");

    // Changing it saves.
    await hireDate.fill("01/06/2025");
    let requestPromise = page.waitForRequest((req) => req.method() === "PATCH");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    expect((await requestPromise).postDataJSON().hireDate).toBe("2025-06-01");

    await expect(dialog).toBeHidden();
    await expect(rowWith(page, employee.fullName).getByRole("cell").nth(4)).toHaveText("1 يونيو 2025");

    // Opening the form again shows the new date unchanged.
    await page.getByRole("button", { name: `تعديل ${employee.fullName}` }).click();
    await expect(hireDate).toHaveValue("01/06/2025");

    // Emptying it saves (null clears the date, see ../backend/doc/week1/employees.txt) and the table shows "-".
    await hireDate.fill("");
    requestPromise = page.waitForRequest((req) => req.method() === "PATCH");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    expect((await requestPromise).postDataJSON().hireDate).toBeNull();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل الموظف بنجاح" })).toBeVisible();
    await expect(rowWith(page, employee.fullName).getByRole("cell").nth(4)).toHaveText("-");

    // The API agrees, and the form opens with an empty date.
    const response = await request.get(`${API_URL}/employees/${employee.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await response.json()).data.hireDate).toBeNull();
    await page.getByRole("button", { name: `تعديل ${employee.fullName}` }).click();
    await expect(hireDate).toHaveValue("");
  });

  test("branch filter + search work together; the add form preselects the filtered branch", async ({
    page,
    request,
  }) => {
    const otherBranch = await createBranch(request, `فرع آخر ${tag}`);
    const salesA = await createEmployee(request, branch.id, {
      fullName: `موظف مبيعات ${tag}`,
      nationalId: randomNationalId(),
      jobTitle: "مندوب مبيعات",
    });
    const driverA = await createEmployee(request, branch.id, {
      fullName: `موظف نقل ${tag}`,
      nationalId: randomNationalId(),
      jobTitle: "سائق",
    });
    const salesB = await createEmployee(request, otherBranch.id, {
      fullName: `موظف بعيد ${tag}`,
      nationalId: randomNationalId(),
      jobTitle: "مندوب مبيعات",
    });
    await page.goto("/employees");
    await expect(rowWith(page, tag)).toHaveCount(3);

    const filter = page.getByLabel("تصفية حسب الفرع");
    const search = page.getByPlaceholder("ابحث بالاسم أو الكود أو الرقم القومي أو الوظيفة");

    // Filter only: this branch's employees.
    await filter.selectOption({ label: branch.name });
    await expect(rowWith(page, salesA.fullName)).toHaveCount(1);
    await expect(rowWith(page, driverA.fullName)).toHaveCount(1);
    await expect(rowWith(page, salesB.fullName)).toHaveCount(0);
    await expect(page.getByText("عدد الموظفين: 2")).toBeVisible();

    // Filter + search by job title (trimmed).
    await search.fill("  مندوب مبيعات  ");
    await expect(rowWith(page, salesA.fullName)).toHaveCount(1);
    await expect(rowWith(page, driverA.fullName)).toHaveCount(0);
    await expect(page.getByText("عدد الموظفين: 1")).toBeVisible();

    // Search by code (case-insensitive) and by national ID, all branches.
    await filter.selectOption({ label: "كل الفروع" });
    await search.fill(salesB.code.toLowerCase());
    await expect(rowWith(page, salesB.fullName)).toHaveCount(1);
    await expect(page.getByText("عدد الموظفين: 1")).toBeVisible();
    await search.fill(driverA.nationalId);
    await expect(rowWith(page, driverA.fullName)).toHaveCount(1);
    await expect(page.getByText("عدد الموظفين: 1")).toBeVisible();

    // Other branch + a name of the first branch → nothing.
    await filter.selectOption({ label: otherBranch.name });
    await search.fill(driverA.fullName);
    await expect(page.getByText("لا توجد نتائج مطابقة")).toBeVisible();
    await expect(page.getByText("عدد الموظفين: 0")).toBeVisible();

    // The add form starts with the filtered branch selected, and focus on the name.
    await page.getByRole("button", { name: "إضافة موظف" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة موظف" });
    await expect(dialog.getByLabel("الفرع")).toHaveValue(otherBranch.id);
    await expect(dialog.getByLabel("الاسم بالكامل")).toBeFocused();
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();

    // "كل الفروع" + the tag → all three again.
    await filter.selectOption({ label: "كل الفروع" });
    await search.fill(tag);
    await expect(rowWith(page, tag)).toHaveCount(3);
    await expect(page.getByText("عدد الموظفين: 3")).toBeVisible();
  });

  test('delete: "إلغاء" keeps the employee, "حذف الموظف" removes it', async ({ page, request }) => {
    const employee = await createEmployee(request, branch.id, { fullName: `موظف حذف ${tag}` });
    await page.goto("/employees");
    await expect(rowWith(page, employee.fullName)).toHaveCount(1);

    // Cancel
    await page.getByRole("button", { name: `حذف ${employee.fullName}` }).click();
    const dialog = page.getByRole("dialog", { name: "حذف الموظف" });
    await expect(dialog).toContainText(`هل أنت متأكد من حذف الموظف "${employee.fullName}"؟`);
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    await expect(rowWith(page, employee.fullName)).toHaveCount(1);

    // Confirm
    await page.getByRole("button", { name: `حذف ${employee.fullName}` }).click();
    await dialog.getByRole("button", { name: "حذف الموظف" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم حذف الموظف بنجاح" })).toBeVisible();
    await expect(rowWith(page, employee.fullName)).toHaveCount(0);

    // The API agrees: the employee is gone.
    const response = await request.get(`${API_URL}/employees/${employee.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(404);
  });

  test("unsaved changes: a changed form asks first, an untouched one closes directly", async ({
    page,
    request,
  }) => {
    const employee = await createEmployee(request, branch.id, { fullName: `موظف بدون تغيير ${tag}` });
    await page.goto("/employees");
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    // Untouched edit form: Escape closes directly.
    await page.getByRole("button", { name: `تعديل ${employee.fullName}` }).click();
    const editForm = page.getByRole("dialog", { name: "تعديل الموظف" });
    await expect(editForm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editForm).toBeHidden();
    await expect(discard).toHaveCount(0);

    // Add form: only a hire date counts as a change.
    await page.getByRole("button", { name: "إضافة موظف" }).first().click();
    const addForm = page.getByRole("dialog", { name: "إضافة موظف" });
    await addForm.getByLabel("تاريخ التعيين").fill("02/02/2025");
    await addForm.getByRole("button", { name: "إلغاء" }).click();
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "إلغاء" }).click();
    await expect(addForm.getByLabel("تاريخ التعيين")).toHaveValue("02/02/2025");

    await page.keyboard.press("Escape");
    await discard.getByRole("button", { name: "تجاهل التغييرات" }).click();
    await expect(discard).toBeHidden();
    await expect(addForm).toBeHidden();
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

  function employee(id, fullName, branchId, extra = {}) {
    return {
      id,
      code: `EMP-00000${id.slice(1)}`,
      fullName,
      nationalId: "29901011234567",
      branchId,
      jobTitle: "محاسب",
      hireDate: "2025-01-01T00:00:00.000Z",
      createdAt: "2026-11-21T10:00:00.000Z",
      updatedAt: "2026-11-21T10:00:00.000Z",
      deletedAt: null,
      ...extra,
    };
  }

  // Only API calls: the page itself is also at "/employees" (on the dev server).
  const isEmployeesApi = (url) => url.origin === API_URL && url.pathname === "/employees";

  // Answers GET /employees and GET /branch with the given status + body.
  function mockEmployees(page, status, body) {
    return page.route(isEmployeesApi, (route) => route.fulfill({ status, json: body, headers: CORS }));
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
      await mockEmployees(page, 500, {
        statusCode: 500,
        message: "Internal server error",
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        field: null,
      });
      await page.goto("/employees");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();

      await page.unroute(isEmployeesApi);
      await mockEmployees(page, 200, {
        message: "All employees returned successfully",
        data: [employee("e1", "موظف وهمي", "b1")],
      });
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();

      const cells = rowWith(page, "موظف وهمي").getByRole("cell");
      await expect(cells.nth(0)).toHaveText("EMP-000001");
      await expectStackedCell(cells.nth(1), "موظف وهمي", "محاسب");
      await expect(cells.nth(2)).toHaveText("فرع وهمي");
      await expect(cells.nth(3)).toHaveText("29901011234567");
      await expect(cells.nth(4)).toHaveText("1 يناير 2025");
    });
  });

  test.describe("time zone west of UTC", () => {
    // "2025-01-01T00:00:00.000Z" is still 31 Dec in New York: the day must not shift.
    test.use({ timezoneId: "America/New_York" });

    test("hire date shows the saved day in the table and in the edit form", async ({ page }) => {
      await setFakeSession(page);
      await mockBranches(page, [BRANCH]);
      await mockEmployees(page, 200, {
        message: "All employees returned successfully",
        data: [employee("e1", "موظف نيويورك", "b1")],
      });
      await page.goto("/employees");

      await expect(rowWith(page, "موظف نيويورك").getByRole("cell").nth(4)).toHaveText("1 يناير 2025");
      await page.getByRole("button", { name: "تعديل موظف نيويورك" }).click();
      const dialog = page.getByRole("dialog", { name: "تعديل الموظف" });
      await expect(dialog.getByLabel("تاريخ التعيين")).toHaveValue("01/01/2025");
    });
  });

  test("empty list shows EmptyState with the add button", async ({ page }) => {
    await setFakeSession(page);
    await mockBranches(page, [BRANCH]);
    await mockEmployees(page, 200, { message: "All employees returned successfully", data: [] });
    await page.goto("/employees");

    const empty = page.getByText("لا يوجد موظفين بعد").locator("..");
    await expect(empty).toBeVisible();
    await expect(page.getByText("لإضافة موظف يجب إضافة فرع أولاً")).toHaveCount(0);
    await empty.getByRole("button", { name: "إضافة موظف" }).click();
    await expect(page.getByRole("dialog", { name: "إضافة موظف" })).toBeVisible();
  });

  test("no branches: add buttons are disabled and a hint links to /branches", async ({ page }) => {
    await setFakeSession(page);
    await mockBranches(page, []);
    await mockEmployees(page, 200, { message: "All employees returned successfully", data: [] });
    await page.goto("/employees");

    await expect(page.getByText("لا يوجد موظفين بعد")).toBeVisible();
    const addButtons = page.getByRole("button", { name: "إضافة موظف" });
    await expect(addButtons).toHaveCount(2); // header + empty state
    for (const button of await addButtons.all()) {
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute("title", "أضف فرعاً أولاً");
    }

    await expect(page.getByText("لإضافة موظف يجب إضافة فرع أولاً")).toBeVisible();
    await page.getByRole("link", { name: "إضافة فرع" }).click();
    await expect(page).toHaveURL(/\/branches$/);
  });

  test('an employee whose branch is not in the list shows "فرع محذوف" (also in the edit form)', async ({ page }) => {
    await setFakeSession(page);
    await mockBranches(page, [BRANCH]);
    await mockEmployees(page, 200, {
      message: "All employees returned successfully",
      data: [employee("e1", "موظف عادي", "b1"), employee("e2", "موظف يتيم", "deleted-branch", { hireDate: null })],
    });
    await page.goto("/employees");

    await expect(rowWith(page, "موظف عادي").getByRole("cell").nth(2)).toHaveText("فرع وهمي");
    const orphanCell = rowWith(page, "موظف يتيم").getByRole("cell").nth(2);
    await expect(orphanCell).toHaveText("فرع محذوف");
    await expect(orphanCell.getByText("فرع محذوف")).toHaveClass(/text-slate-400/);
    await expect(rowWith(page, "موظف يتيم").getByRole("cell").nth(4)).toHaveText("-");

    await page.getByRole("button", { name: "تعديل موظف يتيم" }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل الموظف" });
    await expect(dialog.getByLabel("الفرع")).toHaveValue("فرع محذوف");
  });
});
