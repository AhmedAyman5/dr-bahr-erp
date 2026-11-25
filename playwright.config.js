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
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: true,
  },
});
