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

// Creates a logged-in session in localStorage (fake token, no backend needed).
// After calling it, navigate to the page you want to test.
export async function setFakeSession(page, user = FAKE_USER) {
  await page.goto("/login");
  await page.evaluate(
    ([tokenKey, userKey, token, userJson]) => {
      localStorage.setItem(tokenKey, token);
      localStorage.setItem(userKey, userJson);
    },
    [TOKEN_KEY, USER_KEY, FAKE_TOKEN, JSON.stringify(user)],
  );
}

export async function getStoredToken(page) {
  return page.evaluate((tokenKey) => localStorage.getItem(tokenKey), TOKEN_KEY);
}
