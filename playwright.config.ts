import { defineConfig, devices } from "@playwright/test";

const startCommand = process.platform === "win32"
  ? 'cmd /c "set VITE_VISUAL_TESTS=true&& npm run dev -- --host 127.0.0.1"'
  : "VITE_VISUAL_TESTS=true npm run dev -- --host 127.0.0.1";

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: startCommand,
    url: "http://127.0.0.1:3000/__visual/costeo",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1100 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 393, height: 1000 },
      },
    },
  ],
});
