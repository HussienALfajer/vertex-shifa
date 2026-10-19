import { expect, test } from '@playwright/test';
import { mockConsoleApi } from './mock-api.js';
import { screenshot } from './screenshot.js';

test.describe('console shell', () => {
  // Every screen but the sign-in needs a session (spec S02 rule 37).
  test.beforeEach(async ({ page }) => {
    await mockConsoleApi(page, { signedIn: 'admin' });
  });

  test('renders in Arabic, right to left, with Vertex Shifa always visible', async ({
    page,
  }, testInfo) => {
    await page.goto('/');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(page).toHaveTitle('فيرتكس شفا');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('لوحة إدارة المنصة');
    // "Vertex Shifa" is always on screen: in the sidebar beside the page, or in the top bar.
    await expect(
      page.getByText('فيرتكس شفا', { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);
    await expect(
      page.getByText('لوحة المنصة', { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);
    await expect(page.getByRole('contentinfo')).toHaveText('بدعم من فيرتكس شفا');
    // Right to left: the sidebar at the right from 768 px, the menu button below it.
    const width = page.viewportSize()?.width ?? 0;
    const sidebar = page.locator('[data-slot="app-sidebar"]');
    if (width >= 768) {
      const box = await sidebar.boundingBox();
      if (!box) throw new Error('sidebar not laid out');
      expect(Math.abs(box.x + box.width - width)).toBeLessThan(1);
    } else {
      await expect(sidebar).toBeHidden();
      await expect(page.getByRole('button', { name: 'افتح القائمة' })).toBeVisible();
    }
    await expect(page.locator('body')).not.toHaveText(/[٠-٩]/);

    await screenshot(page, testInfo, 'home');
  });

  test('switches between light and dark with one button and keeps the choice', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const html = page.locator('html');
    const systemDark = testInfo.project.use.colorScheme === 'dark';
    await expect(html).toHaveClass(systemDark ? /dark/ : /^(?!.*dark)/);
    const toDark = page.getByRole('button', { name: 'فعّل الوضع الداكن' });
    const toLight = page.getByRole('button', { name: 'فعّل الوضع الفاتح' });
    for (const [button, dark] of [
      [toDark, true],
      [toLight, false],
    ] as const) {
      if (await button.isVisible()) await button.click();
      await expect(html).toHaveClass(dark ? /dark/ : /^(?!.*dark)/);
      // Applied by theme-init.js before the first paint, and shown by the button.
      await page.reload();
      await expect(html).toHaveClass(dark ? /dark/ : /^(?!.*dark)/);
      await expect(dark ? toLight : toDark).toBeVisible();
      await screenshot(page, testInfo, `theme-${dark ? 'dark' : 'light'}`);
    }
  });

  test('shows the not-found state for an unknown route', async ({ page }, testInfo) => {
    await page.goto('/no-such-screen');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الصفحة غير موجودة');
    await page.getByRole('link', { name: 'العودة إلى الرئيسية' }).click();
    await expect(page).toHaveURL('/');

    await page.goto('/no-such-screen');
    await screenshot(page, testInfo, 'not-found');
  });
});
