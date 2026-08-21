import { defineConfig } from "../../frontend/node_modules/playwright/test.mjs";

export default defineConfig({
  testDir: "../../frontend/tests/e2e",
  outputDir: "../../frontend/test-results/group-editor-fidelity",
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: "http://127.0.0.1:4174",
    browserName: "chromium",
    locale: "ko-KR",
    reducedMotion: "reduce",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure"
  }
});
