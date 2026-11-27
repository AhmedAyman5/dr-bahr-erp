// Shared helpers for the browser tests.
//
// Usage in a spec file:
//   import { test, expect, setFakeSession, getStoredToken } from "./helpers";
//
// Every test that imports `test` from here FAILS if the app logs a console error or
// throws a page error. Only errors coming from browser extensions are ignored.
// If a test expects a specific error (e.g. the browser's "401" network log on a wrong
// login), it must list it explicitly:
//   test.use({ allowedConsoleErrors: [/status of 401/] });
import { test as base, expect } from "@playwright/test";

// Same key names as src/services/session.js (not imported on purpose: tests stay separate).
const TOKEN_KEY = "drbahr_token";
const USER_KEY = "drbahr_user";

export const FAKE_USER = { id: "e2e-user", username: "e2e-admin", role: "SUPERADMIN" };
const FAKE_TOKEN = "e2e-fake-token";

function isFromExtension(text = "") {
  return /(chrome|moz|safari-web)-extension:\/\//.test(text);
}

// Console errors a test allowed ONCE while it ran (allowConsoleErrorOnce), per page.
const allowedOnceByPage = new WeakMap();

// The console / page errors that make a test fail: every error not matched by `allowedPatterns`
// (test.use({ allowedConsoleErrors })), minus ONE error per pattern in `allowedOncePatterns`
// (each pattern removes exactly one matching error, never more).
export function filterConsoleErrors(errors, allowedPatterns = [], allowedOncePatterns = []) {
  const left = errors.filter((error) => !allowedPatterns.some((pattern) => pattern.test(error)));
  for (const pattern of allowedOncePatterns) {
    const index = left.findIndex((error) => pattern.test(error));
    if (index !== -1) left.splice(index, 1);
  }
  return left;
}

// While a test runs: allow ONE console error matching `pattern` (e.g. the browser's log of one expected 409).
export function allowConsoleErrorOnce(page, pattern) {
  allowedOnceByPage.get(page)?.push(pattern);
}

export const test = base.extend({
  // Regexes of console errors this test expects. Default: none allowed.
  allowedConsoleErrors: [[], { option: true }],

  // The `request` fixture (direct API calls from tests) with "Connection: close": every call
  // gets a fresh connection. With the default keep-alive, a call made after the test spent
  // ~5 s in the browser could reuse a socket the backend (Node's 5 s keepAliveTimeout) was
  // closing at that moment → random "read ECONNRESET" under load.
  // (Playwright's fixture callback is named `provide` here, not `use`: the React hooks lint rule
  // would read `use(...)` as a hook call.)
  request: async ({ playwright }, provide) => {
    const context = await playwright.request.newContext({ extraHTTPHeaders: { Connection: "close" } });
    await provide(context);
    await context.dispose();
  },

  // Runs automatically for every test.
  consoleErrors: [
    async ({ page, allowedConsoleErrors }, use) => {
      const errors = [];
      const warnings = [];
      const allowedOnce = [];
      allowedOnceByPage.set(page, allowedOnce);

      page.on("console", (message) => {
        if (isFromExtension(message.location().url)) return;
        if (message.type() === "error") errors.push(`console error: ${message.text()}`);
        if (message.type() === "warning") warnings.push(message.text());
      });

      page.on("pageerror", (error) => {
        if (isFromExtension(error.stack)) return;
        errors.push(`page error: ${error.message}`);
      });

      await use(errors);

      for (const warning of warnings) {
        console.log(`[console warning] ${warning}`);
      }

      const unexpected = filterConsoleErrors(errors, allowedConsoleErrors, allowedOnce);
      expect(unexpected, "The app logged console / page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

// Stores a session (token + user) in localStorage, like a real login does.
// After calling it, navigate to the page you want to test.
export async function setSession(page, token, user) {
  await page.goto("/login");
  await page.evaluate(
    ([tokenKey, userKey, tokenValue, userJson]) => {
      localStorage.setItem(tokenKey, tokenValue);
      localStorage.setItem(userKey, userJson);
    },
    [TOKEN_KEY, USER_KEY, token, JSON.stringify(user)],
  );
}

// Creates a logged-in session with a fake token (no backend needed).
export async function setFakeSession(page, user = FAKE_USER) {
  await setSession(page, FAKE_TOKEN, user);
}

// ---- Real backend (local Docker) ----

export const API_URL = "http://localhost:3000";

// Any HTTP answer (even 401) means the API is up.
export async function isApiUp(request) {
  try {
    await request.get(API_URL, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export const API_DOWN_MESSAGE = `Backend not reachable on ${API_URL} — start it with "docker compose up -d" in ../backend`;

// Logs in through the real API → { access_token, user }.
export async function apiLogin(request, username = "admin", password = "admin123") {
  const response = await request.post(`${API_URL}/auth/login`, { data: { username, password } });
  expect(response.ok(), "API login as admin failed").toBeTruthy();
  return (await response.json()).data;
}

// True for 409 ALREADY_EXISTS on field "code": the server picked a random code that is already taken.
// Backend issue (reported to Mazen): generateCode() in ../backend/src/utils/code-generator/code.generator.ts
// picks a random 6-digit code without checking it is free. Sending the same body again picks a new code.
export async function isRandomCodeCollision(response) {
  if (response.status() !== 409) return false;
  const body = await response.json().catch(() => null);
  return body?.code === "ALREADY_EXISTS" && body?.field === "code";
}

// What the app shows after such a collision (utils/errors.js "ALREADY_EXISTS:code").
export const CODE_RETRY_MESSAGE = "تعذر إنشاء كود تلقائي، اضغط حفظ مرة أخرى";

// A UI create (حفظ in an "add" form whose code the SERVER picks: branch, category, unit, customer, supplier,
// employee, product) does what a user does on a random-code collision: when the save answers 409 ALREADY_EXISTS
// on "code", the app shows CODE_RETRY_MESSAGE → that one 409 console log is allowed and حفظ is clicked ONCE more.
// Any other answer is left alone (no blind retries). Returns the final response of the save.
//   await saveWithCodeRetry(page, dialog.getByRole("button", { name: "حفظ" }));
//   await saveWithCodeRetry(page, saveButton, () => nameInput.press("Enter")); // the first save with Enter
export async function saveWithCodeRetry(page, saveButton, submit = () => saveButton.click()) {
  const isSave = (response) => response.request().method() === "POST" && response.url().startsWith(API_URL);
  const firstResponse = page.waitForResponse(isSave);
  await submit();
  const response = await firstResponse;
  if (!(await isRandomCodeCollision(response))) return response;

  await expect(page.getByText(CODE_RETRY_MESSAGE)).toBeVisible();
  allowConsoleErrorOnce(page, /status of 409/);
  const secondResponse = page.waitForResponse(isSave);
  await saveButton.click();
  return secondResponse;
}

// Creates a record through the API (e.g. path "/categories") and returns its data.
// A random-code collision (see isRandomCodeCollision) is retried ONCE; any other error fails right away.
export async function createByApi(request, token, path, body) {
  const post = () =>
    request.post(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: body,
    });
  let response = await post();
  if (await isRandomCodeCollision(response)) response = await post();
  // The status + body are in the message, so a failed setup shows WHY (e.g. 409 on a code).
  const details = response.ok() ? "" : ` (${response.status()} ${await response.text()})`;
  expect(response.ok(), `creating test data with POST ${path} failed${details}`).toBeTruthy();
  return (await response.json()).data;
}

// Creates a product that uses this category + unit. Name must contain the test tag for cleanup.
export async function createProductByApi(request, token, { name, categoryId, primaryItemUnitId }) {
  return createByApi(request, token, "/products", {
    name,
    categoryId,
    primaryItemUnitId,
    retailPrice: 10,
    wholesalePrice: 8,
    bulkWholesalePrice: 7,
  });
}

// Cleanup: deletes every record of this list (e.g. "/categories") whose name contains `tag`.
// Delete products BEFORE their category / unit, or the backend refuses (in use).
export async function deleteByTag(request, token, path, tag) {
  const headers = { Authorization: `Bearer ${token}` };
  const response = await request.get(`${API_URL}${path}`, { headers });
  const records = (await response.json()).data || [];
  for (const record of records.filter((r) => r.name.includes(tag))) {
    await request.delete(`${API_URL}${path}/${record.id}`, { headers });
  }
}

// A short random text, so every test works with its own data.
export function randomTag() {
  return Math.random().toString(36).slice(2, 8);
}

// The date of every test document that can NEVER be deleted (a POSTED / CANCELLED purchase invoice, a CONVERTED
// quotation). They stay in the database for ever: dated 2001 they get their own numbers (PI-2001-…, PQ-2001-…) and
// sort to the END of the lists (newest first) instead of piling up on top of the real 2026 documents.
// Deletable test drafts may keep today. Other dates of such a document are set relative to it (addDays).
export const TEST_DOC_DATE = "2001-01-15";

// addDays("2001-01-15", 30) → "2001-02-14" (plain "YYYY-MM-DD" days, no time zone involved).
export function addDays(day, days) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// "2001-01-15" → "15/01/2001": what a user types in a DateInput.
export function typedDate(day) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

// Opening balance table cell (customers / suppliers): the amount WITHOUT its sign (in dir=ltr),
// then the solid "مدين" (sky-600) / "دائن" (violet-600) badge and the meaning line. Leave label out for a 0 balance
// (then the cell must contain the amount only, no badge).
//   await expectBalanceCell(cell, "500.00", "مدين", "لنا عند المورد");
//   await expectBalanceCell(cell, "0.00");
export async function expectBalanceCell(cell, amount, label, meaning) {
  await expect(cell.locator("span[dir=ltr]")).toHaveText(amount);
  if (!label) {
    await expect(cell).toHaveText(amount);
    return;
  }
  const badge = cell.getByText(label, { exact: true });
  await expect(badge).toBeVisible();
  // Each side has its own color: مدين = sky, دائن = violet. Never red / green (a direction, not good or bad).
  const color = label === "مدين" ? "sky" : "violet";
  const otherColor = label === "مدين" ? "violet" : "sky";
  // Solid and bold so it is clearly visible.
  for (const className of [`bg-${color}-600`, "text-white", "font-bold", "text-sm", "rounded-full"]) {
    await expect(badge).toHaveClass(new RegExp(`(^|\\s)${className}(\\s|$)`));
  }
  await expect(badge).not.toHaveClass(new RegExp(`${otherColor}|slate|red|green|border`));
  // The amount is semibold and a bit bigger than the meaning line (text-xs).
  await expect(cell.locator("span[dir=ltr]")).toHaveClass(/(^|\s)font-semibold(\s|$)/);
  await expect(cell.locator("span[dir=ltr]")).toHaveClass(/(^|\s)text-sm(\s|$)/);
  await expect(cell.getByText(meaning, { exact: true })).toBeVisible();
  await expect(cell).toHaveText(`${amount}${label}${meaning}`);
}

// A StackedCell (src/components/ui/StackedCell.jsx): the main value + a small gray line under it.
//   await expectStackedCell(cells.nth(COL.name), "فرشة", "أدوات العناية"); // both lines
//   await expectStackedCell(cells.nth(COL.code), "PRD-1", null);           // no second line at all
//   await expectStackedCell(cells.nth(COL.code), "PRD-1");                 // second line not checked
// main / sub: exact text or a RegExp.
export async function expectStackedCell(cell, main, sub) {
  const lines = cell.locator(":scope > div > div");
  await expect(lines.first()).toHaveText(main);
  if (sub === null) await expect(lines).toHaveCount(1);
  else if (sub !== undefined) {
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(1)).toHaveText(sub);
    await expect(lines.nth(1)).toHaveClass(/text-xs/);
    await expect(lines.nth(1)).toHaveClass(/text-slate-500/);
  }
}

export async function getStoredToken(page) {
  return page.evaluate((tokenKey) => localStorage.getItem(tokenKey), TOKEN_KEY);
}
