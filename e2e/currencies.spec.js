// Currencies page (العملات). Docs: ../backend/doc/week2/currency.txt
//
// "with backend" tests use the real local API (Docker) and are skipped when it is down.
// Every test creates its own currencies with a unique random tag in the NAME, and afterEach deletes
// them through the API (also when the test failed).
//
// ⚠ The company's default currency is the Egyptian pound (EGP). Tests NEVER edit, rename or delete it.
// beforeEach makes sure EGP exists and is the default (creates it only when it is missing), and
// afterEach makes EGP the default again — before deleting the test currencies (the default
// can't be deleted), and also when a test failed in the middle.
//
// Test codes: a deleted currency keeps its code forever (409 BELONGS_TO_DELETED), so every code a
// test uses must be new. randomCode() never makes a real ISO code (EGP, USD, EUR, SAR, AED, GBP...),
// and the helpers below try another code when one is already taken.
//
// "mocked API" tests fake the /currency endpoints with page.route (no backend needed).
import {
  test,
  expect,
  setSession,
  setFakeSession,
  isApiUp,
  apiLogin,
  randomTag,
  API_URL,
  API_DOWN_MESSAGE,
} from "./helpers";

const EGP_BODY = { code: "EGP", name: "جنيه مصري", symbol: "ج.م", isDefault: true };

// The table row that contains this text.
function rowWith(page, text) {
  return page.getByRole("row").filter({ hasText: text });
}

// The table row whose code cell is exactly this code.
function rowWithCode(page, code) {
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name: code, exact: true }) });
}

// First letter Q, W, O or Y: each starts only ONE real ISO code (QAR, WST, OMR, YER), so the
// second letter just has to differ from that code's → never a real currency code.
const FIRST_LETTERS = { Q: "A", W: "S", O: "M", Y: "E" };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomLetter(except = "") {
  const letters = LETTERS.replace(except, "");
  return letters[Math.floor(Math.random() * letters.length)];
}

function randomCode() {
  const firsts = Object.keys(FIRST_LETTERS);
  const first = firsts[Math.floor(Math.random() * firsts.length)];
  return `${first}${randomLetter(FIRST_LETTERS[first])}${randomLetter()}`;
}

test.describe("with backend", () => {
  let token;
  let tag; // unique per test, part of every currency NAME this test creates
  let egp; // the EGP currency (never changed by the tests, except being made default again)

  function authHeaders() {
    return { Authorization: `Bearer ${token}` };
  }

  async function getCurrenciesByApi(request) {
    const response = await request.get(`${API_URL}/currency`, { headers: authHeaders() });
    expect(response.ok(), "GET /currency failed").toBeTruthy();
    return (await response.json()).data;
  }

  // EGP must exist and be the default. Creates it only when it is missing.
  async function ensureEgpIsDefault(request) {
    const found = (await getCurrenciesByApi(request)).find((currency) => currency.code === "EGP");
    if (!found) {
      const response = await request.post(`${API_URL}/currency`, { headers: authHeaders(), data: EGP_BODY });
      expect(response.ok(), "creating EGP failed").toBeTruthy();
      return (await response.json()).data;
    }
    if (!found.isDefault) {
      const response = await request.patch(`${API_URL}/currency/${found.id}`, {
        headers: authHeaders(),
        data: { isDefault: true },
      });
      expect(response.ok(), "making EGP the default again failed").toBeTruthy();
      return (await response.json()).data;
    }
    return found;
  }

  // Creates a test currency with a new random code (another code when one is already taken).
  async function createCurrencyByApi(request, body) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await request.post(`${API_URL}/currency`, {
        headers: authHeaders(),
        data: { code: randomCode(), ...body },
      });
      if (response.status() === 409) continue;
      expect(response.ok(), "creating a test currency failed").toBeTruthy();
      return (await response.json()).data;
    }
    throw new Error("no free test currency code found after 30 tries");
  }

  // A code that NO currency uses, not even a deleted one, for a test that types it in the form.
  // How: a "spare" test currency gets a new random code; its old code is then free again.
  async function getFreeCode(request) {
    const spare = await createCurrencyByApi(request, { name: `عملة مؤقتة ${tag}` });
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await request.patch(`${API_URL}/currency/${spare.id}`, {
        headers: authHeaders(),
        data: { code: randomCode() },
      });
      if (response.status() === 409) continue;
      expect(response.ok(), "moving the spare currency to a new code failed").toBeTruthy();
      return spare.code;
    }
    throw new Error("no free test currency code found after 30 tries");
  }

  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await isApiUp(request)), API_DOWN_MESSAGE);

    tag = randomTag();
    const session = await apiLogin(request);
    token = session.access_token;
    egp = await ensureEgpIsDefault(request);
    await setSession(page, session.access_token, session.user);
  });

  test.afterEach(async ({ request }) => {
    if (!token || !tag) return;

    // First EGP back as the default (a default currency can't be deleted), then the test currencies.
    await ensureEgpIsDefault(request);
    const currencies = await getCurrenciesByApi(request);
    for (const currency of currencies.filter((c) => c.name.includes(tag))) {
      await request.delete(`${API_URL}/currency/${currency.id}`, { headers: authHeaders() });
    }
    tag = undefined;
  });

  test("opens from the Sidebar link: EGP is the default (badge, no delete, no make-default)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "العملات" }).click();

    await expect(page).toHaveURL(/\/currencies$/);
    await expect(page.getByRole("heading", { name: "العملات" })).toBeVisible();
    await expect(page.getByText("عملات الشراء والعملة الأساسية لتقييم المخزون")).toBeVisible();
    await expect(page.getByText("جارٍ تحميل العملات...")).toBeHidden();
    await expect(page.getByText(/^عدد العملات: \d+$/)).toBeVisible();

    const row = rowWithCode(page, "EGP");
    await expect(row).toHaveCount(1);
    await expect(row.getByText("أساسية", { exact: true })).toBeVisible();
    // The code cell is left-to-right.
    await expect(row.getByRole("cell").first().locator("span[dir=ltr]")).toHaveText("EGP");
    await expect(row.getByRole("button", { name: `تعديل ${egp.name}` })).toBeVisible();
    await expect(row.getByRole("button", { name: `حذف ${egp.name}` })).toHaveCount(0);
    await expect(row.getByRole("button", { name: `اجعلها أساسية ${egp.name}` })).toHaveCount(0);
    // There is a default → no "no default yet" hint.
    await expect(page.getByText("لم يتم تحديد عملة أساسية بعد")).toHaveCount(0);
  });

  test("edit form of the default: checkbox checked + disabled with a note; closing sends nothing", async ({
    page,
  }) => {
    const patches = [];
    page.on("request", (req) => {
      if (req.method() !== "GET" && req.url().startsWith(`${API_URL}/currency`)) patches.push(req.url());
    });
    await page.goto("/currencies");

    await page.getByRole("button", { name: `تعديل ${egp.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل العملة" });
    await expect(dialog.getByLabel("كود العملة")).toHaveValue("EGP");
    const checkbox = dialog.getByLabel("عملة أساسية");
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeDisabled();
    await expect(dialog.getByText("لتغيير العملة الأساسية اجعل عملة أخرى أساسية")).toBeVisible();

    // Untouched → closes without asking, nothing is sent (EGP is never changed by tests).
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    expect(patches).toEqual([]);
  });

  test("add: lowercase code becomes uppercase, body has no isDefault, row has no badge", async ({
    page,
    request,
  }) => {
    const code = await getFreeCode(request);
    const name = `دولار اختبار ${tag}`;
    await page.goto("/currencies");

    await page.getByRole("button", { name: "إضافة عملة" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة عملة" });
    await expect(dialog.getByLabel("كود العملة")).toBeFocused();
    await expect(dialog.getByLabel("كود العملة")).toHaveAttribute("placeholder", "EGP");
    await expect(dialog.getByLabel("كود العملة")).toHaveAttribute("dir", "ltr");
    // Currencies already exist → the new one is not the default unless the user ticks it.
    await expect(dialog.getByLabel("عملة أساسية")).not.toBeChecked();

    await dialog.getByLabel("كود العملة").pressSequentially(code.toLowerCase());
    await expect(dialog.getByLabel("كود العملة")).toHaveValue(code);
    await dialog.getByLabel("اسم العملة").fill(`  ${name}  `);
    await dialog.getByLabel("الرمز").fill("$");

    const requestPromise = page.waitForRequest((req) => req.method() === "POST");
    await dialog.getByLabel("الرمز").press("Enter");
    expect((await requestPromise).postDataJSON()).toEqual({ code, name, symbol: "$" });

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تمت إضافة العملة بنجاح" })).toBeVisible();
    const row = rowWithCode(page, code);
    await expect(row).toContainText(name);
    await expect(row.getByRole("cell").nth(2)).toHaveText("$");
    await expect(row.getByText("أساسية", { exact: true })).toHaveCount(0);
    // EGP is still the default.
    await expect(rowWithCode(page, "EGP").getByText("أساسية", { exact: true })).toBeVisible();
  });

  test("add without a symbol: the symbol is left out and the table shows -", async ({ page, request }) => {
    const code = await getFreeCode(request);
    const name = `عملة بدون رمز ${tag}`;
    await page.goto("/currencies");
    await page.getByRole("button", { name: "إضافة عملة" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة عملة" });
    await dialog.getByLabel("كود العملة").fill(code);
    await dialog.getByLabel("اسم العملة").fill(name);

    const requestPromise = page.waitForRequest((req) => req.method() === "POST");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    expect((await requestPromise).postDataJSON()).toEqual({ code, name });

    await expect(rowWithCode(page, code).getByRole("cell").nth(2)).toHaveText("-");
  });

  test("validation: 2 letters, digits, empty name show Arabic errors and send no request", async ({ page }) => {
    const sentRequests = [];
    page.on("request", (req) => {
      if (req.url().startsWith(`${API_URL}/currency`) && req.method() !== "GET") {
        sentRequests.push(`${req.method()} ${req.url()}`);
      }
    });

    await page.goto("/currencies");
    await page.getByRole("button", { name: "إضافة عملة" }).first().click();
    const dialog = page.getByRole("dialog", { name: "إضافة عملة" });
    const code = dialog.getByLabel("كود العملة");
    const save = dialog.getByRole("button", { name: "حفظ" });
    const codeError = dialog.getByText("كود العملة 3 حروف إنجليزية كبيرة (مثل EGP)");

    // Empty form
    await save.click();
    await expect(codeError).toBeVisible();
    await expect(dialog.getByText("اسم العملة مطلوب")).toBeVisible();

    // 2 letters
    await code.fill("QB");
    await dialog.getByLabel("اسم العملة").fill(`عملة ${tag}`);
    await save.click();
    await expect(codeError).toBeVisible();

    // Digits
    await code.fill("Q1B");
    await save.click();
    await expect(codeError).toBeVisible();

    // Lowercase typed → shown in capitals; max 3 characters.
    await code.fill("");
    await code.pressSequentially("qbcd");
    await expect(code).toHaveValue("QBC");

    // Name with only spaces counts as empty.
    await dialog.getByLabel("اسم العملة").fill("   ");
    await save.click();
    await expect(dialog.getByText("اسم العملة مطلوب")).toBeVisible();

    await expect(dialog).toBeVisible();
    expect(sentRequests).toEqual([]);
  });

  test.describe("code conflicts", () => {
    // The browser logs the two expected 409 answers itself.
    test.use({ allowedConsoleErrors: [/status of 409/] });

    test("duplicate code → 'كود العملة مستخدم بالفعل'; code of a deleted currency → its own message", async ({
      page,
      request,
    }) => {
      const existing = await createCurrencyByApi(request, { name: `عملة موجودة ${tag}` });
      const deleted = await createCurrencyByApi(request, { name: `عملة محذوفة ${tag}` });
      await request.delete(`${API_URL}/currency/${deleted.id}`, { headers: authHeaders() });

      await page.goto("/currencies");
      await page.getByRole("button", { name: "إضافة عملة" }).first().click();
      const dialog = page.getByRole("dialog", { name: "إضافة عملة" });
      await dialog.getByLabel("كود العملة").fill(existing.code);
      await dialog.getByLabel("اسم العملة").fill(`عملة مكررة ${tag}`);
      await dialog.getByRole("button", { name: "حفظ" }).click();

      // Shown at the top and under the code field; the form stays open with the typed data.
      await expect(dialog.getByRole("alert")).toHaveText("كود العملة مستخدم بالفعل");
      await expect(dialog.getByText("كود العملة مستخدم بالفعل")).toHaveCount(2);
      await expect(dialog.getByLabel("اسم العملة")).toHaveValue(`عملة مكررة ${tag}`);

      await dialog.getByLabel("كود العملة").fill(deleted.code);
      await dialog.getByRole("button", { name: "حفظ" }).click();
      await expect(dialog.getByRole("alert")).toHaveText("كود العملة مرتبط بعملة محذوفة");
    });
  });

  test("edit name + clear the symbol → symbol sent as null, table shows -", async ({ page, request }) => {
    const currency = await createCurrencyByApi(request, { name: `عملة قديمة ${tag}`, symbol: "€x" });
    const newName = `عملة معدلة ${tag}`;
    await page.goto("/currencies");
    await expect(rowWithCode(page, currency.code).getByRole("cell").nth(2)).toHaveText("€x");

    await page.getByRole("button", { name: `تعديل ${currency.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "تعديل العملة" });
    await expect(dialog.getByLabel("كود العملة")).toHaveValue(currency.code);
    await expect(dialog.getByLabel("الرمز")).toHaveValue("€x");
    // Not the default → the checkbox can be ticked, but it starts unchecked.
    await expect(dialog.getByLabel("عملة أساسية")).not.toBeChecked();
    await expect(dialog.getByLabel("عملة أساسية")).toBeEnabled();

    await dialog.getByLabel("اسم العملة").fill(newName);
    await dialog.getByLabel("الرمز").fill("   ");
    const requestPromise = page.waitForRequest((req) => req.method() === "PATCH");
    await dialog.getByRole("button", { name: "حفظ" }).click();
    expect((await requestPromise).postDataJSON()).toEqual({ code: currency.code, name: newName, symbol: null });

    await expect(page.getByRole("alert").filter({ hasText: "تم تعديل العملة بنجاح" })).toBeVisible();
    const row = rowWithCode(page, currency.code);
    await expect(row).toContainText(newName);
    await expect(row.getByRole("cell").nth(2)).toHaveText("-");

    // The API agrees: the symbol is really cleared.
    const response = await request.get(`${API_URL}/currency/${currency.id}`, { headers: authHeaders() });
    expect((await response.json()).data.symbol).toBeNull();
  });

  test("make another currency the default → EGP loses its badge; the new default has no delete", async ({
    page,
    request,
  }) => {
    const currency = await createCurrencyByApi(request, { name: `عملة أساسية مؤقتة ${tag}` });
    try {
      await page.goto("/currencies");
      const row = rowWithCode(page, currency.code);
      await expect(row.getByText("أساسية", { exact: true })).toHaveCount(0);

      // "إلغاء" keeps everything as it was.
      await row.getByRole("button", { name: `اجعلها أساسية ${currency.name}` }).click();
      const confirm = page.getByRole("dialog", { name: "جعل العملة أساسية" });
      await expect(confirm).toContainText(
        `سيتم جعل "${currency.name}" العملة الأساسية بدلًا من "${egp.name}". تقييم المخزون يكون دائمًا بالعملة الأساسية.`,
      );
      // Not destructive → blue (primary), not red.
      const confirmButton = confirm.getByRole("button", { name: "اجعلها أساسية" });
      await expect(confirmButton).toHaveClass(/(^|\s)bg-primary(\s|$)/);
      await expect(confirmButton).not.toHaveClass(/red/);
      await confirm.getByRole("button", { name: "إلغاء" }).click();
      await expect(confirm).toBeHidden();

      // Confirm → only { isDefault: true } is sent.
      await row.getByRole("button", { name: `اجعلها أساسية ${currency.name}` }).click();
      const requestPromise = page.waitForRequest((req) => req.method() === "PATCH");
      await confirmButton.click();
      expect((await requestPromise).postDataJSON()).toEqual({ isDefault: true });

      await expect(confirm).toBeHidden();
      await expect(page.getByRole("alert").filter({ hasText: "تم تغيير العملة الأساسية بنجاح" })).toBeVisible();

      // After the silent refresh: the badge moved, and the buttons follow it.
      await expect(row.getByText("أساسية", { exact: true })).toBeVisible();
      const egpRow = rowWithCode(page, "EGP");
      await expect(egpRow.getByText("أساسية", { exact: true })).toHaveCount(0);
      await expect(row.getByRole("button", { name: `حذف ${currency.name}` })).toHaveCount(0);
      await expect(row.getByRole("button", { name: `اجعلها أساسية ${currency.name}` })).toHaveCount(0);
      await expect(egpRow.getByRole("button", { name: `حذف ${egp.name}` })).toBeVisible();
      // The default currency is listed first.
      await expect(page.getByRole("row").nth(1)).toContainText(currency.code);

      // Its edit form: checkbox checked + disabled.
      await row.getByRole("button", { name: `تعديل ${currency.name}` }).click();
      const dialog = page.getByRole("dialog", { name: "تعديل العملة" });
      await expect(dialog.getByLabel("عملة أساسية")).toBeChecked();
      await expect(dialog.getByLabel("عملة أساسية")).toBeDisabled();
      await dialog.getByRole("button", { name: "إلغاء" }).click();

      // Make EGP the default again through the page (afterEach does it too if this test failed).
      await egpRow.getByRole("button", { name: `اجعلها أساسية ${egp.name}` }).click();
      await confirmButton.click();
      await expect(egpRow.getByText("أساسية", { exact: true })).toBeVisible();
    } finally {
      await ensureEgpIsDefault(request);
    }
  });

  test('delete a non-default currency: "إلغاء" keeps it, "حذف العملة" removes it', async ({ page, request }) => {
    const currency = await createCurrencyByApi(request, { name: `عملة حذف ${tag}` });
    await page.goto("/currencies");
    const row = rowWithCode(page, currency.code);
    await expect(row).toHaveCount(1);

    await row.getByRole("button", { name: `حذف ${currency.name}` }).click();
    const dialog = page.getByRole("dialog", { name: "حذف العملة" });
    await expect(dialog).toContainText(`هل أنت متأكد من حذف العملة "${currency.name}"؟`);
    await dialog.getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toHaveCount(1);

    await row.getByRole("button", { name: `حذف ${currency.name}` }).click();
    await dialog.getByRole("button", { name: "حذف العملة" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("alert").filter({ hasText: "تم حذف العملة بنجاح" })).toBeVisible();
    await expect(row).toHaveCount(0);

    const response = await request.get(`${API_URL}/currency/${currency.id}`, { headers: authHeaders() });
    expect(response.status()).toBe(404);
  });

  test("search by code (case-insensitive) and by name", async ({ page, request }) => {
    const currency = await createCurrencyByApi(request, { name: `عملة بحث ${tag}` });
    await page.goto("/currencies");
    const search = page.getByPlaceholder("ابحث بالكود أو الاسم");

    await search.fill(currency.code.toLowerCase());
    await expect(rowWithCode(page, currency.code)).toHaveCount(1);
    await expect(page.getByText("عدد العملات: 1")).toBeVisible();

    await search.fill(currency.name);
    await expect(rowWithCode(page, currency.code)).toHaveCount(1);
    await expect(page.getByText("عدد العملات: 1")).toBeVisible();

    await search.fill(`لا يوجد ${tag}`);
    await expect(page.getByText("لا توجد نتائج مطابقة للبحث")).toBeVisible();
    await expect(rowWith(page, tag)).toHaveCount(0);
  });
});

test.describe("mocked API", () => {
  const CORS = { "Access-Control-Allow-Origin": "*" };

  function currency(fields) {
    return {
      symbol: null,
      isDefault: false,
      createdAt: "2026-11-24T10:00:00.000Z",
      updatedAt: "2026-11-24T10:00:00.000Z",
      deletedAt: null,
      ...fields,
    };
  }

  // Answers GET /currency with the given status + body.
  function mockCurrencies(page, status, body) {
    return page.route(
      (url) => url.pathname === "/currency",
      (route) => {
        if (route.request().method() !== "GET") return route.fallback();
        return route.fulfill({ status, json: body, headers: CORS });
      },
    );
  }

  test.describe("API error", () => {
    // The browser logs the failed request itself; that is expected here.
    test.use({ allowedConsoleErrors: [/status of 500/] });

    test("shows ErrorState and the retry button loads the list", async ({ page }) => {
      await setFakeSession(page);
      await mockCurrencies(page, 500, {
        statusCode: 500,
        message: "Internal server error",
        error: "Internal Server Error",
        code: "INTERNAL_ERROR",
        field: null,
      });
      await page.goto("/currencies");
      await expect(page.getByText("حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً")).toBeVisible();

      await page.unroute((url) => url.pathname === "/currency");
      await mockCurrencies(page, 200, {
        message: "All currencies returned successfully",
        data: [currency({ id: "c1", code: "EGP", name: "جنيه مصري", symbol: "ج.م", isDefault: true })],
      });
      await page.getByRole("button", { name: "إعادة المحاولة" }).click();

      const row = rowWithCode(page, "EGP");
      await expect(row).toContainText("جنيه مصري");
      await expect(row).toContainText("ج.م");
      await expect(row.getByText("أساسية", { exact: true })).toBeVisible();
    });
  });

  test("empty list: EmptyState + add → the first currency's checkbox starts checked (isDefault true sent)", async ({
    page,
  }) => {
    await setFakeSession(page);
    await mockCurrencies(page, 200, { message: "All currencies returned successfully", data: [] });
    let postedBody;
    await page.route(
      (url) => url.pathname === "/currency",
      (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        postedBody = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          json: { message: "Currency created successfully", data: currency({ id: "c1", ...postedBody }) },
          headers: CORS,
        });
      },
    );
    await page.goto("/currencies");

    const empty = page.getByText("لا توجد عملات بعد — أضف العملة الأساسية (مثل الجنيه المصري EGP)").locator("..");
    await expect(empty).toBeVisible();
    await empty.getByRole("button", { name: "إضافة عملة" }).click();

    const dialog = page.getByRole("dialog", { name: "إضافة عملة" });
    await expect(dialog.getByLabel("عملة أساسية")).toBeChecked();
    await expect(dialog.getByLabel("عملة أساسية")).toBeEnabled();

    await dialog.getByLabel("كود العملة").fill("egp");
    await dialog.getByLabel("اسم العملة").fill("جنيه مصري");
    await dialog.getByLabel("الرمز").fill("ج.م");
    await dialog.getByRole("button", { name: "حفظ" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "تمت إضافة العملة بنجاح" })).toBeVisible();
    expect(postedBody).toEqual({ code: "EGP", name: "جنيه مصري", symbol: "ج.م", isDefault: true });
  });

  test("currencies without a default show the amber hint", async ({ page }) => {
    await setFakeSession(page);
    await mockCurrencies(page, 200, {
      message: "All currencies returned successfully",
      data: [currency({ id: "c1", code: "USD", name: "دولار أمريكي", symbol: "$" })],
    });
    await page.goto("/currencies");

    const hint = page.getByRole("alert").filter({ hasText: "لم يتم تحديد عملة أساسية بعد" });
    await expect(hint).toBeVisible();
    await expect(hint).toHaveClass(/amber/);

    // The make-default question without a current default.
    await page.getByRole("button", { name: "اجعلها أساسية دولار أمريكي" }).click();
    await expect(page.getByRole("dialog", { name: "جعل العملة أساسية" })).toContainText(
      'سيتم جعل "دولار أمريكي" العملة الأساسية. تقييم المخزون يكون دائمًا بالعملة الأساسية.',
    );
  });

  test.describe("delete errors", () => {
    test.use({ allowedConsoleErrors: [/status of 400/] });

    async function deleteWithError(page, errorBody) {
      await setFakeSession(page);
      await mockCurrencies(page, 200, {
        message: "All currencies returned successfully",
        data: [
          currency({ id: "c1", code: "EGP", name: "جنيه مصري", isDefault: true }),
          currency({ id: "c2", code: "USD", name: "دولار أمريكي" }),
        ],
      });
      await page.route(
        (url) => url.pathname === "/currency/c2",
        (route) => route.fulfill({ status: 400, json: errorBody, headers: CORS }),
      );
      await page.goto("/currencies");
      await page.getByRole("button", { name: "حذف دولار أمريكي" }).click();
      await page.getByRole("dialog", { name: "حذف العملة" }).getByRole("button", { name: "حذف العملة" }).click();
    }

    test("used by purchase invoices → Arabic message", async ({ page }) => {
      await deleteWithError(page, {
        statusCode: 400,
        message: "Currency is used by 3 purchase invoice(s) and cannot be deleted",
        error: "Bad Request",
        code: "BAD_REQUEST",
        field: null,
      });
      await expect(
        page.getByRole("alert").filter({ hasText: "لا يمكن حذف العملة لأنها مستخدمة في فواتير شراء" }),
      ).toBeVisible();
    });

    test("the default (field isDefault) → make another currency the default first", async ({ page }) => {
      await deleteWithError(page, {
        statusCode: 400,
        message: "The default currency cannot be deleted; make another currency the default first",
        error: "Bad Request",
        code: "BAD_REQUEST",
        field: "isDefault",
      });
      await expect(
        page.getByRole("alert").filter({ hasText: "لا يمكن حذف العملة الأساسية، اجعل عملة أخرى أساسية أولًا" }),
      ).toBeVisible();
    });
  });
});
