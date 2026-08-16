import { defineConfig } from "@playwright/test";

const NEXT_PORT = process.env.E2E_NEXT_PORT ?? "3000";
const PARTY_PORT = process.env.E2E_PARTY_PORT ?? "1999";
const PARTY_HOST = `localhost:${PARTY_PORT}`;
const BASE_URL = `http://localhost:${NEXT_PORT}`;

// NEXT_PUBLIC_PARTY_HOST is pinned below so a developer's .env cannot point the
// browser at the deployed PartyKit while the local one is the server under test.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: BASE_URL,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    permissions: ["microphone"],
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium", channel: "chromium" } }],
  webServer: [
    {
      command: `npx partykit dev --port ${PARTY_PORT}`,
      url: `http://${PARTY_HOST}/parties/main/e2e-health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `npx next dev --turbo --port ${NEXT_PORT}`,
      url: BASE_URL,
      env: { NEXT_PUBLIC_PARTY_HOST: PARTY_HOST },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
