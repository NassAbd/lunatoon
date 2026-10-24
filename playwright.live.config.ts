import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "./tests/live",
  outputDir: "test-results-live/playwright",
  testMatch: "**/*.live.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  use: { ...base.use, trace: "off" },
});
