import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    browserName: "firefox",
    baseURL: "http://127.0.0.1:3001",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npx next start -p 3001",
    url: "http://127.0.0.1:3001",
    timeout: 300_000,
    reuseExistingServer: true,
  },
});
