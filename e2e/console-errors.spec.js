// Unit checks of filterConsoleErrors (e2e/helpers.js): which console errors make a test fail.
// Plain function: runs in Node, without a browser page (`test` comes straight from Playwright).
// The browser side (saveWithCodeRetry allowing ONE 409) is proven in branches.spec.js (mocked API).
import { test, expect } from "@playwright/test";
import { filterConsoleErrors } from "./helpers.js";

const LOG_409 = "console error: Failed to load resource: the server responded with a status of 409 (Conflict)";
const LOG_500 = "console error: Failed to load resource: the server responded with a status of 500 (Internal Server Error)";

test("no allowance: every error is kept", () => {
  expect(filterConsoleErrors([LOG_409, LOG_500])).toEqual([LOG_409, LOG_500]);
});

test("a test.use pattern removes every matching error", () => {
  expect(filterConsoleErrors([LOG_409, LOG_409, LOG_500], [/status of 409/])).toEqual([LOG_500]);
});

test("an allow-once pattern removes exactly ONE matching error", () => {
  expect(filterConsoleErrors([LOG_409, LOG_409], [], [/status of 409/])).toEqual([LOG_409]);
  expect(filterConsoleErrors([LOG_409, LOG_409], [], [/status of 409/, /status of 409/])).toEqual([]);
  // A pattern that matches nothing removes nothing else.
  expect(filterConsoleErrors([LOG_500], [], [/status of 409/])).toEqual([LOG_500]);
});
