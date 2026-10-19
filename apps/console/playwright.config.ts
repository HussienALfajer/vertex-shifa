import { defineConfig, devices } from '@playwright/test';

// The app as built (`pnpm build`), served by `vite preview`, in Chromium, at desktop, tablet and phone sizes.
// Screenshots are attached to each test's results (test-results/), which CI uploads.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4174',
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
    command: 'pnpm exec vite preview',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
  },
});
