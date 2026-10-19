import { type AddressInfo, createServer } from 'node:net';
import { defineConfig, devices } from '@playwright/test';

/**
 * The port of this run's server. On CI, 4176. Locally, several worktrees run their E2E at once:
 * each run serves its own export on a free port and never reuses a running server, which could be
 * another worktree's. The workers load this file again and read the port the run chose from
 * `PATIENT_E2E_PORT`, which e2e/web-server.ts listens on.
 */
async function serverPort(): Promise<number> {
  if (process.env.CI) return 4176;
  process.env.PATIENT_E2E_PORT ??= String(
    await new Promise<number>((resolve, reject) => {
      const probe = createServer().once('error', reject);
      probe.listen(0, () => {
        const { port } = probe.address() as AddressInfo;
        probe.close(() => resolve(port));
      });
    }),
  );
  return Number(process.env.PATIENT_E2E_PORT);
}

const port = await serverPort();

// The web export (`pnpm build`), served by e2e/web-server.ts, in Chromium at a phone's size, once per
// color scheme, and at a tablet's. The web export exists only for these screenshots: the app ships to the stores
// (ADR 0003). Screenshots are attached to each test's results (test-results/), which CI uploads.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'ar',
    timezoneId: 'Asia/Damascus',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'light', use: { ...devices['Pixel 7'], colorScheme: 'light' } },
    { name: 'dark', use: { ...devices['Pixel 7'], colorScheme: 'dark' } },
    // An Android tablet in portrait (AGENTS.md "Responsive").
    { name: 'tablet', use: { ...devices['Galaxy Tab S4'], colorScheme: 'light' } },
  ],
  webServer: {
    command: `node e2e/web-server.ts ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
