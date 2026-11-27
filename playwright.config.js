// Browser tests (Playwright). Run with: npm run test:e2e
// Starts `npm run dev` automatically, or reuses a dev server that is already running.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  reporter: "list",
  // 4, not the default (8 on this machine): 8 parallel browsers overload it (ERR_INSUFFICIENT_RESOURCES).
  workers: 4,
  // Snapshot of the database before the run, compared after it (no leftovers, demo data untouched).
  globalSetup: "./e2e/global-setup.js",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    // The currency tests make a test currency the company's DEFAULT for a few seconds (and EGP again after).
    // Documents use the default currency, and a posted purchase invoice locks its currency for ever: a document
    // test running in that moment would get the wrong currency (or leave a test currency that can't be deleted).
    // So the currency tests run FIRST, alone; every other test waits for them.
    {
      name: "currencies",
      testMatch: /currencies\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: /currencies\.spec\.js/,
      dependencies: ["currencies"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: true,
  },
});
