import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/engine-e2e", workers: 1, retries: 0, timeout: 60_000,
  outputDir: "test-results-engine/playwright", use: { baseURL: "http://127.0.0.1:3110", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL || undefined, viewport: { width: 1440, height: 1100 } } }],
  webServer: { command: "node tests/support/engine-test-server.mjs", url: "http://127.0.0.1:3110", reuseExistingServer: false, timeout: 120_000 },
});
