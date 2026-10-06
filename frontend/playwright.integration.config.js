import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./tests/integration",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results/integration",
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4176", locale: "ko-KR", timezoneId: "Asia/Seoul",
    reducedMotion: "reduce", trace: "retain-on-failure", screenshot: "only-on-failure"
  },
  webServer: {
    command: "NODE_ENV=production BABEL_ENV=production DISABLE_REACT_DEVTOOLS=1 APP_ANALYTICS_ENABLED=false npm run build && node scripts/e2e-preview.js",
    env: { WEB_PUSH_TEST_PORT: "4176", WEB_PUSH_TEST_API_ORIGIN: "http://127.0.0.1:8086" },
    url: "http://127.0.0.1:4176/groups", reuseExistingServer: false, timeout: 120_000
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }]
});
