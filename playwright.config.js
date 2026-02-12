/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: "tests",
  testMatch: "**/e2e.spec.js",
  timeout: 15000,
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npx serve . -p 3000",
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
};
