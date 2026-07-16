import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the accessibility + page-guard gates (PRD §17.9, §10.2,
 * design.md §7). The a11y suite runs axe-core against the app and fails the
 * build on ANY serious/critical violation. It builds and serves the production
 * app first so the check runs against real output, not dev-mode HTML.
 *
 * The test process is plain Node, so it needs .env.local loaded explicitly (the
 * webServer child gets it from `next` itself). Without it the authenticated
 * office a11y specs would find no credentials and skip.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — the authenticated specs skip; the rest still run.
}
export default defineConfig({
  testDir: "./tests",
  // Playwright runs the e2e/a11y specs; *.test.ts are node:test unit tests.
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3123",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start -- --port 3123",
    url: "http://localhost:3123",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
