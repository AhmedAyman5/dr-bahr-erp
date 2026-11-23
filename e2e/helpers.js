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

export const test = base.extend({
  // Regexes of console errors this test expects. Default: none allowed.
  allowedConsoleErrors: [[], { option: true }],

  // Runs automatically for every test.
  consoleErrors: [
    async ({ page, allowedConsoleErrors }, use) => {
      const errors = [];
      const warnings = [];

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

      const unexpected = errors.filter(
        (error) => !allowedConsoleErrors.some((pattern) => pattern.test(error)),
      );
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

// Creates a record through the API (e.g. path "/categories") and returns its data.
export async function createByApi(request, token, path, body) {
  const response = await request.post(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
  expect(response.ok(), `creating test data with POST ${path} failed`).toBeTruthy();
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

export async function getStoredToken(page) {
  return page.evaluate((tokenKey) => localStorage.getItem(tokenKey), TOKEN_KEY);
}
