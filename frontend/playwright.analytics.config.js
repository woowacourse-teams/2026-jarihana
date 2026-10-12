import { defineConfig } from "playwright/test";
import base from "./playwright.config.js";

export default defineConfig({
  ...base,
  testDir: "./tests/analytics-e2e",
  use: {
    ...base.use,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  },
  webServer: {
    ...base.webServer,
    command: "APP_ANALYTICS_ENABLED=true APP_POSTHOG_PROJECT_TOKEN=phc_e2e APP_POSTHOG_HOST=https://analytics.example.test APP_DEPLOY_ENV=staging " + base.webServer.command
  }
});
