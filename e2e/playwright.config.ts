import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-cleanup.ts",
  globalTeardown: "./global-cleanup.ts",
  timeout: 180_000,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "../documentation/evidencias/reporte-e2e", open: "never" }]],
  outputDir: "./test-results",
  use: {
    baseURL: "http://localhost:3000",
    locale: "es-MX",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
});
