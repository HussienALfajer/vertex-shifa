import { type AddressInfo, createServer } from 'node:net';
import { defineConfig, devices } from '@playwright/test';

/**
 * The port of this run's server. On CI, 4174. Locally, several worktrees run their E2E at once:
 * each run serves its own build on a free port and never reuses a running server, which could be
 * another worktree's. The workers load this file again and read the port the run chose from
 * `CONSOLE_E2E_PORT`.
 */
async function serverPort(): Promise<number> {
  if (process.env.CI) return 4174;
  process.env.CONSOLE_E2E_PORT ??= String(
    await new Promise<number>((resolve, reject) => {
      const probe = createServer().once('error', reject);
      probe.listen(0, () => {
        const { port } = probe.address() as AddressInfo;
        probe.close(() => resolve(port));
      });
    }),
  );
  return Number(process.env.CONSOLE_E2E_PORT);
}

const port = await serverPort();

// The app as built (`pnpm build`), served by `vite preview`, in Chromium, at desktop, tablet and phone sizes.
// Screenshots are attached to each test's results (test-results/), which CI uploads.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'ar',
    timezoneId: 'Asia/Damascus',
    // Recording a trace for every test slowed the suite and kept the antivirus scanning each trace
    // file (docs/testing.md). CI records the retry of a failed test; locally pass `--trace on`.
    trace: 'on-first-retry',
  },
  // Every screen at every size (AGENTS.md "Responsive"): a desktop in both color schemes, a tablet
  // in portrait at the sidebar's breakpoint (768 px), and phones of 412, 375 and 320 px.
  projects: [
    { name: 'light', use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
    { name: 'dark', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
        colorScheme: 'light',
      },
    },
    { name: 'phone', use: { ...devices['Pixel 7'], colorScheme: 'dark' } },
    // The narrowest phones the apps support (AGENTS.md "Responsive"): 320 px and 375 px wide.
    {
      name: 'phone-320',
      use: { ...devices['Pixel 7'], viewport: { width: 320, height: 640 }, colorScheme: 'light' },
    },
    {
      name: 'phone-375',
      use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 }, colorScheme: 'dark' },
    },
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
