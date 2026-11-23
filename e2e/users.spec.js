// Users page (المستخدمين).
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// Every test uses its own random tag in every username / email / employee / branch name it creates.
// afterEach deletes the tagged users FIRST, then employees, then branches (also when the test failed).
// Soft delete keeps usernames, emails and national IDs reserved, so they are random every run.
// The admin account is NEVER changed: its edit form is only opened and cancelled.
//
// "mocked API" tests fake /users, /employees and /branch with page.route (no backend needed).
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
  FAKE_USER,
  API_URL,
  API_DOWN_MESSAGE,
} from "./helpers";

// The table row that contains this text.
function rowWith(page, text) {
  return page.getByRole("row").filter({ hasText: text });
}

// A form control by its "name" attribute (password labels change between add and edit).
function field(dialog, name) {
  return dialog.locator(`[name="${name}"]`);
}

// Random 14-digit national ID (first digit 2 or 3, like real Egyptian IDs).
function randomNationalId() {
  let digits = String(2 + Math.floor(Math.random() * 2));
  while (digits.length < 14) digits += Math.floor(Math.random() * 10);
  return digits;
}

// Collects every non-GET request sent to /users... (to check that nothing was sent).
function trackUserWrites(page) {
  const sent = [];
  page.on("request", (req) => {
    if (req.url().startsWith(`${API_URL}/users`) && req.method() !== "GET") {
      sent.push(`${req.method()} ${req.url()}`);
    }
  });
  return sent;
}

// POST /auth/login through the API (not the browser) → the HTTP status.
async function loginStatus(request, username, password) {
  const response = await request.post(`${API_URL}/auth/login`, { data: { username, password } });
  return response.status();
}

test.describe("with backend", () => {
  let token;
  let admin; // the logged-in admin user { id, username, role } — never changed
  let tag; // unique per test, part of every username / email / name this test creates
  let branch; // a test branch created before every test

  const headers = () => ({ Authorization: `Bearer ${token}` });

  function createBranch(request, name) {
    return createByApi(request, token, "/branch", { name, address: "عنوان فرع اختبار" });
  }

  function createEmployee(request, branchId, fullName) {
    return createByApi(request, token, `/employees/branch/${branchId}`, {
      fullName,
      nationalId: randomNationalId(),
    });
  }

  // body: { username, password, role, ... } — the username must contain the tag.
  function createUser(request, body) {
    return createByApi(request, token, "/users", body);
  }

  async function getUserById(request, id) {
    const response = await request.get(`${API_URL}/users/${id}`, { headers: headers() });
    return response;
  }

  // Cleanup: users whose username contains the tag. The admin is skipped explicitly.
  async function deleteUsersByTag(request) {
    const response = await request.get(`${API_URL}/users`, { headers: headers() });
    const users = (await response.json()).data || [];
    for (const user of users) {
      if (user.id === admin.id || user.username === "admin" || !user.username.includes(tag)) continue;
      await request.delete(`${API_URL}/users/${user.id}`, { headers: headers() });
    }
  }

  async function deleteEmployeesByTag(request) {
    const response = await request.get(`${API_URL}/employees`, { headers: headers() });
    const employees = (await response.json()).data || [];
    for (const employee of employees.filter((e) => e.fullName.includes(tag))) {
      await request.delete(`${API_URL}/employees/${employee.id}`, { headers: headers() });
    }
  }

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);

    tag = randomTag();
    const session = await apiLogin(request);
    token = session.access_token;
    admin = session.user;
    branch = await createBranch(request, `فرع مستخدمين ${tag}`);
    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;
    // Users first, then employees, then branches.
    await deleteUsersByTag(request);
    await deleteEmployeesByTag(request);
    await deleteByTag(request, token, "/branch", tag);
    tag = undefined;
  });

  test('opens from the Sidebar link (after "الموظفين") with no console errors', async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation");
    await expect(nav.getByText("الموظفين والمستخدمين")).toBeVisible();
    await expect(nav.getByRole("link")).toContainText(["الموظفين", "المستخدمين"]);
    await nav.getByRole("link", { name: "المستخدمين" }).click();

    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole("heading", { name: "المستخدمين" })).toBeVisible();
    await expect(page.getByText("حسابات الدخول على النظام وصلاحياتها")).toBeVisible();
    await expect(page.getByText("جارٍ تحميل المستخدمين...")).toBeHidden();
    await expect(rowWith(page, admin.username).first()).toBeVisible();
  });

  test("self-protection: the admin row shows (أنت), cannot be deleted, and its role is read-only", async ({
    page,
  }) => {
    const sent = trackUserWrites(page);
    await page.goto("/users");

    const adminRow = page.getByRole("row").filter({ has: page.getByText("(أنت)") });
    await expect(adminRow).toHaveCount(1);
    await expect(adminRow.getByRole("cell").nth(0)).toHaveText(`${admin.username}(أنت)`);
    await expect(adminRow.getByRole("cell").nth(1)).toHaveText("مدير النظام");

    const deleteButton = adminRow.getByRole("button", { name: `حذف ${admin.username}` });
    await expect(deleteButton).toBeDisabled();
    await expect(deleteButton).toHaveAttribute("title", "لا يمكنك حذف حسابك");

    // Edit form: role read-only with the note. Open + cancel only — the admin is never saved.
    await adminRow.getByRole("button", { name: `تعديل ${admin.username}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل المستخدم" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("الصلاحية")).toBeDisabled();
    await expect(dialog.getByLabel("الصلاحية")).toHaveValue("SUPERADMIN");
    await expect(dialog.getByText("لا يمكنك تغيير صلاحية حسابك")).toBeVisible();
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    expect(sent).toEqual([]);
  });

  test("add: only the documented fields are sent, the row shows, and the new user can log in", async ({
    page,
    request,
  }) => {
    const username = `e2e.${tag}.add`;
    const email = `${tag}.add@example.com`;
    const password = "secret123";
    await page.goto("/users");

    await page.getByRole("button", { name: "إضافة مستخدم" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة مستخدم" });
    await expect(dialog).toBeVisible();
    await expect(field(dialog, "username")).toBeFocused();
    await expect(field(dialog, "username")).toHaveAttribute("dir", "ltr");
    await expect(field(dialog, "email")).toHaveAttribute("dir", "ltr");
    // The browser must not fill in the admin's saved password.
    await expect(field(dialog, "password")).toHaveAttribute("autocomplete", "new-password");
    await expect(dialog.getByText("اتركها فارغة للإبقاء على كلمة المرور الحالية")).toHaveCount(0);

    await dialog.getByLabel("اسم المستخدم").fill(`  ${username}  `);
    await field(dialog, "password").fill(password);
    await field(dialog, "confirmPassword").fill(password);
    await dialog.getByLabel("الصلاحية").selectOption({ label: "مبيعات" });
    await dialog.getByLabel("البريد الإلكتروني").fill(email);
    await dialog.getByLabel("الفرع").selectOption({ label: branch.name });

    // Show / hide the password.
    const passwordInput = field(dialog, "password");
    await expect(passwordInput).toHaveAttribute("type", "password");
    await dialog.getByRole("button", { name: "إظهار كلمة المرور", exact: true }).click();
    await expect(passwordInput).toHaveAttribute("type", "text");
    const hide = dialog.getByRole("button", { name: "إخفاء كلمة المرور", exact: true });
    await expect(hide).toHaveAttribute("title", "إخفاء");
    await hide.click();
    await expect(passwordInput).toHaveAttribute("type", "password");
    await expect(field(dialog, "confirmPassword")).toHaveAttribute("type", "password");

    const requestPromise = page.waitForRequest((req) => req.method() === "POST" && req.url() === `${API_URL}/users`);
    // Enter in a field submits the form.
    await dialog.getByLabel("البريد الإلكتروني").press("Enter");
    // Trimmed username; no confirm-password field; no employeeId key (empty).
    expect((await requestPromise).postDataJSON()).toEqual({
      username,
      password,
      role: "SALES",
      email,
      branchId: branch.id,
    });

    await expect(dialog).toBeHidden();
    const success = page.getByRole("alert").filter({ hasText: "تمت إضافة المستخدم بنجاح" });
    await expect(success).toBeVisible();

    const cells = rowWith(page, username).getByRole("cell");
    await expect(cells.nth(0)).toHaveText(username);
    await expect(cells.nth(0).locator("[dir=ltr]")).toHaveText(username);
    await expect(cells.nth(1)).toHaveText("مبيعات");
    await expect(cells.nth(2)).toHaveText("-");
    await expect(cells.nth(3)).toHaveText(branch.name);
    await expect(cells.nth(4)).toHaveText(email);
    await expect(cells.nth(4).locator("[dir=ltr]")).toHaveCount(1);
    await expect(cells.nth(5)).toHaveText("لم يسجل الدخول بعد");
    // Another user's delete button is enabled.
    await expect(page.getByRole("button", { name: `حذف ${username}` })).toBeEnabled();

    // The new account works, and its last login shows after a reload.
    expect(await loginStatus(request, username, password)).toBe(201);
    await page.reload();
    await expect(rowWith(page, username).getByRole("cell").nth(5)).not.toHaveText("لم يسجل الدخول بعد");
    await expect(rowWith(page, username).getByRole("cell").nth(5)).toHaveText(/\d{4}/);
  });

  test("add with only the required fields: no empty email / employeeId / branchId keys", async ({ page }) => {
    const username = `e2e.${tag}.min`;
    await page.goto("/users");
    await page.getByRole("button", { name: "إضافة مستخدم" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة مستخدم" });
    await dialog.getByLabel("اسم المستخدم").fill(username);
    await field(dialog, "password").fill("abc123");
    await field(dialog, "confirmPassword").fill("abc123");
    await dialog.getByLabel("الصلاحية").selectOption("USER");
    await dialog.getByLabel("البريد الإلكتروني").fill("   ");

    const requestPromise = page.waitForRequest((req) => req.method() === "POST");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    expect((await requestPromise).postDataJSON()).toEqual({ username, password: "abc123", role: "USER" });

    await expect(dialog).toBeHidden();
    const cells = rowWith(page, username).getByRole("cell");
    await expect(cells.nth(1)).toHaveText("مستخدم");
    await expect(cells.nth(2)).toHaveText("-");
    await expect(cells.nth(3)).toHaveText("-");
    await expect(cells.nth(4)).toHaveText("-");
  });

  test("validation: Arabic errors for every rule and no request is sent", async ({ page }) => {
    const sent = trackUserWrites(page);
    await page.goto("/users");
    await page.getByRole("button", { name: "إضافة مستخدم" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة مستخدم" });
    const save = dialog.getByRole("button", { name: "حفظ" });

    // Everything empty.
    await save.click();
    await expect(dialog.getByText("اسم المستخدم مطلوب")).toBeVisible();
    await expect(dialog.getByText("كلمة المرور مطلوبة")).toBeVisible();
    await expect(dialog.getByText("الصلاحية مطلوبة")).toBeVisible();

    // Username: only spaces, then a space inside.
    await dialog.getByLabel("اسم المستخدم").fill("   ");
    await save.click();
    await expect(dialog.getByText("اسم المستخدم مطلوب")).toBeVisible();
    await dialog.getByLabel("اسم المستخدم").fill(`e2e ${tag}`);
    await save.click();
    await expect(dialog.getByText("اسم المستخدم لا يجب أن يحتوي على مسافات")).toBeVisible();
    // Typing clears the error.
    await dialog.getByLabel("اسم المستخدم").fill(`e2e.${tag}.val`);
    await expect(dialog.getByText("اسم المستخدم لا يجب أن يحتوي على مسافات")).toBeHidden();

    await dialog.getByLabel("الصلاحية").selectOption("ADMIN");

    // Password shorter than 6.
    await field(dialog, "password").fill("12345");
    await field(dialog, "confirmPassword").fill("12345");
    await save.click();
    await expect(dialog.getByText("كلمة المرور يجب ألا تقل عن 6 أحرف")).toBeVisible();

    // Mismatch (also when the confirmation is empty).
    await field(dialog, "password").fill("123456");
    await field(dialog, "confirmPassword").fill("1234567");
    await save.click();
    await expect(dialog.getByText("كلمتا المرور غير متطابقتين")).toBeVisible();
    await field(dialog, "confirmPassword").fill("");
    await save.click();
    await expect(dialog.getByText("كلمتا المرور غير متطابقتين")).toBeVisible();
    await field(dialog, "confirmPassword").fill("123456");

    // Invalid emails.
    for (const email of ["not-an-email", "a@b", "a b@example.com"]) {
      await dialog.getByLabel("البريد الإلكتروني").fill(email);
      await save.click();
      await expect(dialog.getByText("البريد الإلكتروني غير صحيح")).toBeVisible();
    }

    await expect(dialog).toBeVisible();
    expect(sent).toEqual([]);
  });

  test.describe("server conflicts", () => {
    // The browser logs the failed request itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 409/] });

    test('duplicate username → Arabic "already used" error, typed data is kept', async ({ page, request }) => {
      const username = `e2e.${tag}.dup`;
      await createUser(request, { username, password: "secret123", role: "USER" });
      await page.goto("/users");

      await page.getByRole("button", { name: "إضافة مستخدم" }).first().click();
      const dialog = page.getByRole("dialog", { name: "إضافة مستخدم" });
      await dialog.getByLabel("اسم المستخدم").fill(username);
      await field(dialog, "password").fill("other123");
      await field(dialog, "confirmPassword").fill("other123");
      await dialog.getByLabel("الصلاحية").selectOption("SALES");
      await dialog.getByRole("button", { name: "حفظ" }).click();

      await expect(dialog.getByRole("alert")).toHaveText("اسم المستخدم مستخدم بالفعل، اختر قيمة أخرى");
      await expect(dialog.getByLabel("اسم المستخدم")).toHaveValue(username);
      await expect(dialog.getByLabel("الصلاحية")).toHaveValue("SALES");
      await expect(dialog.getByRole("button", { name: "حفظ" })).toBeEnabled();
    });
  });

  test("employee link: choosing an employee sets + locks the branch; employees with a user are hidden", async ({
    page,
    request,
  }) => {
    const otherBranch = await createBranch(request, `فرع آخر ${tag}`);
    const freeEmployee = await createEmployee(request, branch.id, `موظف متاح ${tag}`);
    const takenEmployee = await createEmployee(request, otherBranch.id, `موظف له حساب ${tag}`);
    await createUser(request, {
      username: `e2e.${tag}.taken`,
      password: "secret123",
      role: "USER",
      employeeId: takenEmployee.id,
      branchId: otherBranch.id,
    });
    const username = `e2e.${tag}.emp`;
    await page.goto("/users");

    await page.getByRole("button", { name: "إضافة مستخدم" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة مستخدم" });
    const employeeSelect = dialog.getByLabel("الموظف");
    const branchSelect = dialog.getByLabel("الفرع");
    const note = dialog.getByText("الفرع يتحدد من فرع الموظف");

    // Only the free employee, shown as "<name> (<code>)".
    const freeLabel = `${freeEmployee.fullName} (${freeEmployee.code})`;
    await expect(employeeSelect.locator("option", { hasText: freeLabel })).toHaveCount(1);
    await expect(employeeSelect.locator("option", { hasText: takenEmployee.fullName })).toHaveCount(0);
    await expect(employeeSelect).toHaveValue(""); // "بدون موظف"
    await expect(branchSelect).toBeEnabled();

    // A branch chosen first is replaced by the employee's branch, which is then locked.
    await branchSelect.selectOption({ label: otherBranch.name });
    await employeeSelect.selectOption({ label: freeLabel });
    await expect(branchSelect).toHaveValue(branch.id);
    await expect(branchSelect).toBeDisabled();
    await expect(note).toBeVisible();

    // "بدون موظف" → the branch is editable again and keeps its value.
    await employeeSelect.selectOption({ label: "بدون موظف" });
    await expect(branchSelect).toBeEnabled();
    await expect(branchSelect).toHaveValue(branch.id);
    await expect(note).toBeHidden();

    await employeeSelect.selectOption({ label: freeLabel });
    await dialog.getByLabel("اسم المستخدم").fill(username);
    await field(dialog, "password").fill("secret123");
    await field(dialog, "confirmPassword").fill("secret123");
    await dialog.getByLabel("الصلاحية").selectOption("ACCOUNTANT");

    const requestPromise = page.waitForRequest((req) => req.method() === "POST");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    expect((await requestPromise).postDataJSON()).toEqual({
      username,
      password: "secret123",
      role: "ACCOUNTANT",
      employeeId: freeEmployee.id,
      branchId: branch.id,
    });

    await expect(dialog).toBeHidden();
    const cells = rowWith(page, username).getByRole("cell");
    await expect(cells.nth(1)).toHaveText("محاسب");
    await expect(cells.nth(2)).toHaveText(freeEmployee.fullName);
    await expect(cells.nth(3)).toHaveText(branch.name);

    // Now the free employee has a user too: a new add form lists neither of them.
    await page.getByRole("button", { name: "إضافة مستخدم" }).first().click();
    await expect(employeeSelect.locator("option", { hasText: tag })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("edit without a password: no password key; with a new password: the user logs in with it", async ({
    page,
    request,
  }) => {
    const user = await createUser(request, {
      username: `e2e.${tag}.old`,
      password: "oldpass1",
      role: "USER",
      email: `${tag}.old@example.com`,
      branchId: branch.id,
    });
    const newUsername = `e2e.${tag}.new`;
    await page.goto("/users");

    // 1) Change username + role, no password.
    await page.getByRole("button", { name: `تعديل ${user.username}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل المستخدم" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("اسم المستخدم")).toHaveValue(user.username);
    await expect(dialog.getByLabel("الصلاحية")).toHaveValue("USER");
    await expect(dialog.getByLabel("الصلاحية")).toBeEnabled();
    await expect(dialog.getByLabel("البريد الإلكتروني")).toHaveValue(user.email);
    await expect(dialog.getByLabel("الفرع")).toHaveValue(branch.id);
    await expect(field(dialog, "password")).toHaveValue("");
    await expect(dialog.getByText("كلمة مرور جديدة")).toBeVisible();
    await expect(dialog.getByText("تأكيد كلمة المرور الجديدة")).toBeVisible();
    await expect(dialog.getByText("اتركها فارغة للإبقاء على كلمة المرور الحالية")).toBeVisible();

    await dialog.getByLabel("اسم المستخدم").fill(newUsername);
    await dialog.getByLabel("الصلاحية").selectOption("ADMIN");
    let requestPromise = page.waitForRequest((req) => req.method() === "PATCH");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    let patch = await requestPromise;
    expect(patch.url()).toBe(`${API_URL}/users/${user.id}`);
    expect(patch.postDataJSON()).toEqual({
      username: newUsername,
      role: "ADMIN",
      email: user.email,
      employeeId: null,
      branchId: branch.id,
    });

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل المستخدم بنجاح" })).toBeVisible();
    await expect(rowWith(page, newUsername).getByRole("cell").nth(1)).toHaveText("مدير");
    await expect(rowWith(page, user.username)).toHaveCount(0);
    // The old password still works.
    expect(await loginStatus(request, newUsername, "oldpass1")).toBe(201);

    // 2) A new password: short / mismatch are blocked, then it is saved.
    await page.getByRole("button", { name: `تعديل ${newUsername}` }).click();
    await field(dialog, "password").fill("new12");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    await expect(dialog.getByText("كلمة المرور يجب ألا تقل عن 6 أحرف")).toBeVisible();
    await field(dialog, "password").fill("newpass9");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    await expect(dialog.getByText("كلمتا المرور غير متطابقتين")).toBeVisible();
    await field(dialog, "confirmPassword").fill("newpass9");

    requestPromise = page.waitForRequest((req) => req.method() === "PATCH");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    patch = await requestPromise;
    expect(patch.postDataJSON().password).toBe("newpass9");
    expect(patch.postDataJSON()).not.toHaveProperty("confirmPassword");
    await expect(dialog).toBeHidden();

    expect(await loginStatus(request, newUsername, "newpass9")).toBe(201);
    expect(await loginStatus(request, newUsername, "oldpass1")).toBe(401);
  });

  test("edit: clearing email, employee and branch sends null", async ({ page, request }) => {
    const employee = await createEmployee(request, branch.id, `موظف مرتبط ${tag}`);
    const user = await createUser(request, {
      username: `e2e.${tag}.clr`,
      password: "secret123",
      role: "SALES",
      email: `${tag}.clr@example.com`,
      employeeId: employee.id,
      branchId: branch.id,
    });
    await page.goto("/users");
    const cells = rowWith(page, user.username).getByRole("cell");
    await expect(cells.nth(2)).toHaveText(employee.fullName);

    await page.getByRole("button", { name: `تعديل ${user.username}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل المستخدم" });
    // The user's own employee is listed and selected; the branch is locked.
    await expect(dialog.getByLabel("الموظف")).toHaveValue(employee.id);
    await expect(dialog.getByLabel("الفرع")).toBeDisabled();
    await expect(dialog.getByText("الفرع يتحدد من فرع الموظف")).toBeVisible();

    await dialog.getByLabel("البريد الإلكتروني").fill("");
    await dialog.getByLabel("الموظف").selectOption({ label: "بدون موظف" });
    await dialog.getByLabel("الفرع").selectOption({ label: "بدون فرع" });

    const requestPromise = page.waitForRequest((req) => req.method() === "PATCH");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    expect((await requestPromise).postDataJSON()).toEqual({
      username: user.username,
      role: "SALES",
      email: null,
      employeeId: null,
      branchId: null,
    });

    await expect(dialog).toBeHidden();
    await expect(cells.nth(2)).toHaveText("-");
    await expect(cells.nth(3)).toHaveText("-");
    await expect(cells.nth(4)).toHaveText("-");

    // The API agrees.
    const saved = (await (await getUserById(request, user.id)).json()).data;
    expect(saved).toMatchObject({ email: null, employeeId: null, branchId: null });
  });

  test("role filter, branch filter and search work together", async ({ page, request }) => {
    const otherBranch = await createBranch(request, `فرع بعيد ${tag}`);
    const employee = await createEmployee(request, branch.id, `موظف بحث ${tag}`);
    const sales = await createUser(request, {
      username: `e2e.${tag}.sales`,
      password: "secret123",
      role: "SALES",
      email: `${tag}.sales@example.com`,
      employeeId: employee.id,
      branchId: branch.id,
    });
    const accountant = await createUser(request, {
      username: `e2e.${tag}.acc`,
      password: "secret123",
      role: "ACCOUNTANT",
      branchId: branch.id,
    });
    const farSales = await createUser(request, {
      username: `e2e.${tag}.far`,
      password: "secret123",
      role: "SALES",
      branchId: otherBranch.id,
    });
    await page.goto("/users");

    const roleFilter = page.getByLabel("تصفية حسب الصلاحية");
    const branchFilter = page.getByLabel("تصفية حسب الفرع");
    const search = page.getByPlaceholder("ابحث باسم المستخدم أو البريد أو اسم الموظف");

    await search.fill(tag);
    await expect(rowWith(page, tag)).toHaveCount(3);
    await expect(page.getByText("عدد المستخدمين: 3")).toBeVisible();

    // Role only.
    await roleFilter.selectOption({ label: "مبيعات" });
    await expect(rowWith(page, sales.username)).toHaveCount(1);
    await expect(rowWith(page, farSales.username)).toHaveCount(1);
    await expect(rowWith(page, accountant.username)).toHaveCount(0);
    await expect(page.getByText("عدد المستخدمين: 2")).toBeVisible();

    // Role + branch.
    await branchFilter.selectOption({ label: branch.name });
    await expect(rowWith(page, sales.username)).toHaveCount(1);
    await expect(page.getByText("عدد المستخدمين: 1")).toBeVisible();

    // All roles + branch.
    await roleFilter.selectOption({ label: "كل الصلاحيات" });
    await expect(page.getByText("عدد المستخدمين: 2")).toBeVisible();

    // Search by employee name, by email and by username (case-insensitive), all filters off.
    await branchFilter.selectOption({ label: "كل الفروع" });
    await search.fill(`  ${employee.fullName}  `);
    await expect(rowWith(page, sales.username)).toHaveCount(1);
    await expect(page.getByText("عدد المستخدمين: 1")).toBeVisible();
    await search.fill(sales.email.toUpperCase());
    await expect(rowWith(page, sales.username)).toHaveCount(1);
    await expect(page.getByText("عدد المستخدمين: 1")).toBeVisible();
    await search.fill(farSales.username.toUpperCase());
    await expect(rowWith(page, farSales.username)).toHaveCount(1);
    await expect(page.getByText("عدد المستخدمين: 1")).toBeVisible();

    // Nothing matches.
    await roleFilter.selectOption({ label: "محاسب" });
    await expect(page.getByText("لا توجد نتائج مطابقة")).toBeVisible();
    await expect(page.getByText("عدد المستخدمين: 0")).toBeVisible();
  });

  test('delete: "إلغاء" keeps the user, "حذف المستخدم" removes it and it can no longer log in', async ({
    page,
    request,
  }) => {
    const user = await createUser(request, { username: `e2e.${tag}.del`, password: "secret123", role: "USER" });
    await page.goto("/users");
    await expect(rowWith(page, user.username)).toHaveCount(1);

    // Cancel
    await page.getByRole("button", { name: `حذف ${user.username}` }).click();
    const dialog = page.getByRole("dialog", { name: "حذف المستخدم" });
    await expect(dialog).toContainText(
      `هل أنت متأكد من حذف المستخدم "${user.username}"؟ لن يتمكن من الدخول على النظام بعد الحذف.`,
    );
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    await expect(rowWith(page, user.username)).toHaveCount(1);

    // Confirm
    await page.getByRole("button", { name: `حذف ${user.username}` }).click();
    await dialog.getByRole("button", { name: "حذف المستخدم" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم حذف المستخدم بنجاح" })).toBeVisible();
    await expect(rowWith(page, user.username)).toHaveCount(0);

    // The API agrees: gone, and the login is refused.
    expect((await getUserById(request, user.id)).status()).toBe(404);
    expect(await loginStatus(request, user.username, "secret123")).toBe(401);
  });

  test("unsaved changes: a changed form asks first, an untouched one closes directly", async ({
    page,
    request,
  }) => {
    const user = await createUser(request, { username: `e2e.${tag}.keep`, password: "secret123", role: "USER" });
    await page.goto("/users");
    const discard = page.getByRole("dialog", { name: "تجاهل التغييرات" });

    // Untouched edit form: Escape closes directly.
    await page.getByRole("button", { name: `تعديل ${user.username}` }).click();
    const editForm = page.getByRole("dialog", { name: "تعديل المستخدم" });
    await expect(editForm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editForm).toBeHidden();
    await expect(discard).toHaveCount(0);

    // Add form: only a typed password counts as a change.
    await page.getByRole("button", { name: "إضافة مستخدم" }).first().click();
    const addForm = page.getByRole("dialog", { name: "إضافة مستخدم" });
    await field(addForm, "password").fill("abc123");
    await addForm.getByRole("button", { name: "إلغاء" }).click();
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "إلغاء" }).click();
    await expect(field(addForm, "password")).toHaveValue("abc123");

    await page.keyboard.press("Escape");
    await discard.getByRole("button", { name: "تجاهل التغييرات" }).click();
    await expect(discard).toBeHidden();
    await expect(addForm).toBeHidden();
  });
});

test.describe("mocked API", () => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };

  const BRANCH = { id: "b1", name: "فرع وهمي", code: "branch-000001", address: null };
  const EMPLOYEE = { id: "e1", code: "EMP-000001", fullName: "موظف وهمي", branchId: "b1", nationalId: null };

  function user(id, username, extra = {}) {
    return {
      id,
      username,
      email: null,
      role: "USER",
      employeeId: null,
      branchId: null,
      lastLoginDate: null,
      createdAt: "2026-11-21T10:00:00.000Z",
      updatedAt: "2026-11-21T10:00:00.000Z",
      ...extra,
    };
  }

  // Only API calls: the page itself is also at "/users" (on the dev server).
  const isUsersApi = (url) => url.origin === API_URL && url.pathname.startsWith("/users");

  function mockUsers(page, status, body) {
    return page.route(isUsersApi, (route) => route.fulfill({ status, json: body, headers: CORS }));
  }
  function mockLists(page, { branches = [BRANCH], employees = [EMPLOYEE] } = {}) {
    return Promise.all([
      page.route(
        (url) => url.origin === API_URL && url.pathname === "/branch",
        (route) => route.fulfill({ status: 200, json: { message: "ok", data: branches }, headers: CORS }),
      ),
      page.route(
        (url) => url.origin === API_URL && url.pathname === "/employees",
        (route) => route.fulfill({ status: 200, json: { message: "ok", data: employees }, headers: CORS }),
      ),
    ]);
  }

  test.describe("API error", () => {
    // The browser logs the failed request itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("shows ErrorState and the retry button loads the list", async ({ page }) => {
      await setFakeSession(page);
      await mockLists(page);
      await mockUsers(page, 500, {
        statusCode: 500,
        message: "Internal server error",
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        field: null,
      });
      await page.goto("/users");

      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();

      await page.unroute(isUsersApi);
      await mockUsers(page, 200, {
        message: "Users retrieved successfully",
        data: [user("u1", "mock.user", { role: "SALES", employeeId: "e1", branchId: "b1" })],
      });
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();

      const cells = rowWith(page, "mock.user").getByRole("cell");
      await expect(cells.nth(1)).toHaveText("مبيعات");
      await expect(cells.nth(2)).toHaveText("موظف وهمي");
      await expect(cells.nth(3)).toHaveText("فرع وهمي");
    });
  });

  test("empty list shows EmptyState with the add button", async ({ page }) => {
    await setFakeSession(page);
    await mockLists(page);
    await mockUsers(page, 200, { message: "Users retrieved successfully", data: [] });
    await page.goto("/users");

    const empty = page.getByText("لا يوجد مستخدمين بعد").locator("..");
    await expect(empty).toBeVisible();
    await empty.getByRole("button", { name: "إضافة مستخدم" }).click();
    await expect(page.getByRole("dialog", { name: "إضافة مستخدم" })).toBeVisible();
  });

  test.describe("Cairo time zone", () => {
    test.use({ timezoneId: "Africa/Cairo" });

    test('last login: date + time, or "لم يسجل الدخول بعد"; deleted employee / branch are named', async ({
      page,
    }) => {
      await setFakeSession(page);
      await mockLists(page);
      await mockUsers(page, 200, {
        message: "Users retrieved successfully",
        data: [
          user("u1", "never.logged"),
          user("u2", "logged.in", { lastLoginDate: "2026-11-21T13:05:00.000Z", email: "a@example.com" }),
          user("u3", "orphan.user", { employeeId: "deleted-employee", branchId: "deleted-branch" }),
        ],
      });
      await page.goto("/users");

      await expect(rowWith(page, "never.logged").getByRole("cell").nth(5)).toHaveText("لم يسجل الدخول بعد");
      await expect(rowWith(page, "logged.in").getByRole("cell").nth(5)).toHaveText("21 نوفمبر 2026 في 3:05 م");
      await expect(rowWith(page, "logged.in").getByRole("cell").nth(4)).toHaveText("a@example.com");

      const orphan = rowWith(page, "orphan.user").getByRole("cell");
      await expect(orphan.nth(2)).toHaveText("موظف محذوف");
      await expect(orphan.nth(2).getByText("موظف محذوف")).toHaveClass(/text-slate-400/);
      await expect(orphan.nth(3)).toHaveText("فرع محذوف");

      // The edit form shows them too (instead of an empty Select), and the branch is not locked.
      await page.getByRole("button", { name: "تعديل orphan.user" }).click();
      const dialog = page.getByRole("dialog", { name: "تعديل المستخدم" });
      await expect(dialog.getByLabel("الموظف").locator("option:checked")).toHaveText("موظف محذوف");
      await expect(dialog.getByLabel("الفرع").locator("option:checked")).toHaveText("فرع محذوف");
      await expect(dialog.getByLabel("الفرع")).toBeEnabled();
    });
  });

  test("editing your own username updates the Header right away (no real admin change)", async ({ page }) => {
    await setFakeSession(page); // FAKE_USER = { id: "e2e-user", username: "e2e-admin", role: "SUPERADMIN" }
    await mockLists(page);
    let me = user(FAKE_USER.id, FAKE_USER.username, { role: "SUPERADMIN" });
    let patchBody;
    await page.route(isUsersApi, async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      if (req.method() === "PATCH") {
        patchBody = req.postDataJSON();
        me = { ...me, username: patchBody.username };
        return route.fulfill({ status: 200, json: { message: "User updated successfully", data: me }, headers: CORS });
      }
      return route.fulfill({ status: 200, json: { message: "ok", data: [me] }, headers: CORS });
    });
    await page.goto("/users");

    const banner = page.getByRole("banner");
    await expect(banner).toContainText(FAKE_USER.username);
    await expect(rowWith(page, "(أنت)")).toHaveCount(1);

    await page.getByRole("button", { name: `تعديل ${FAKE_USER.username}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل المستخدم" });
    await expect(dialog.getByLabel("الصلاحية")).toBeDisabled();
    await dialog.getByLabel("اسم المستخدم").fill("e2e-renamed");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    await expect(dialog).toBeHidden();

    // Role unchanged, no password key.
    expect(patchBody).toEqual({
      username: "e2e-renamed",
      role: "SUPERADMIN",
      email: null,
      employeeId: null,
      branchId: null,
    });
    await expect(banner).toContainText("e2e-renamed");
    await expect(banner).not.toContainText(FAKE_USER.username);
    await expect(rowWith(page, "e2e-renamed").getByText("(أنت)")).toBeVisible();

    // Stored too: still there after a full reload.
    await page.reload();
    await expect(page.getByRole("banner")).toContainText("e2e-renamed");
  });
});
