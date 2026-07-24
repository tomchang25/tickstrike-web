import { defineConfig, devices } from "@playwright/test";

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const port = process.env.PLAYWRIGHT_PORT ?? "1420";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  // Every spec's first assertion waits for the app to boot (window.__TICKSTRIKE__). Under local
  // full-suite parallelism, several heavy PixiJS/GSAP instances load against one shared Vite dev
  // server at once, and boot can genuinely take longer than Playwright's 5s default — not a hang,
  // just slower under contention. Give it more room rather than let load-dependent boot time flip
  // otherwise-passing assertions.
  expect: { timeout: 15_000 },
  // Playwright's default worker count tracks CPU count (8 on this project's 16-core dev machines).
  // That many concurrent heavy PixiJS/GSAP instances against one shared local dev server reliably
  // starves a handful of boots past even the raised expect timeout above; 4 stayed clean across
  // repeated full-suite runs. CI keeps its own auto-detected worker count untouched.
  workers: process.env.CI ? undefined : 4,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: chromiumExecutable
      ? {
          executablePath: chromiumExecutable,
          args: ["--no-sandbox", "--no-proxy-server", "--disable-dev-shm-usage"],
        }
      : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 0.0.0.0 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
