import { type AddressInfo, createServer } from 'node:net';
import { defineConfig, devices } from '@playwright/test';

/**
 * The port of this run's server. On CI, 4173. Locally, several worktrees run their E2E at once:
 * each run serves its own build on a free port and never reuses a running server, which could be
 * another worktree's. The workers load this file again and read the port the run chose from
 * `CLINIC_E2E_PORT`.
 */
async function serverPort(): Promise<number> {
  if (process.env.CI) return 4173;
  process.env.CLINIC_E2E_PORT ??= String(
    await new Promise<number>((resolve, reject) => {
      const probe = createServer().once('error', reject);
      probe.listen(0, () => {
        const { port } = probe.address() as AddressInfo;
        probe.close(() => resolve(port));
      });
    }),
  );
  return Number(process.env.CLINIC_E2E_PORT);
}

const port = await serverPort();

// The renderer as built (`pnpm build`), served by `vite preview`, in Chromium (Electron's engine),
// at desktop, tablet and phone sizes. Screenshots are attached to each test's results (test-results/), which
// CI uploads.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Four projects, each signing members in with Argon2id (64 MiB): on a large machine Playwright's
  // default (half the cores) starves the preview server and the tests time out.
  ...(process.env.CI ? {} : { workers: '25%' }),
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'ar',
    timezoneId: 'Asia/Damascus',
    trace: 'retain-on-failure',
  },
  // Every screen at every size (AGENTS.md "Responsive"): a desktop in both color schemes, a tablet
  // in portrait at the sidebar's breakpoint (768 px), and a phone.
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
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
