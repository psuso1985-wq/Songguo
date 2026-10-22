import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["real-workspace-v1.spec.ts", "public-workspace-methods.spec.ts"],
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  outputDir: "test-results/workspace-v1",
  use: {
    actionTimeout: 15000,
    navigationTimeout: 20000,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:13001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
    },
  },
});
