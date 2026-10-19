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
    await expect(page.getByRole('banner')).toContainText('فيرتكس شفا');
    await expect(page.getByRole('banner')).toContainText('لوحة المنصة');
    await expect(page.getByRole('contentinfo')).toHaveText('بدعم من فيرتكس شفا');

    // Right to left: the Vertex Shifa mark starts the header on the right, the product name
    // follows it to the left. The header and the page share the same start edge.
    const mark = await page.getByRole('banner').locator('svg').first().boundingBox();
    const product = await page.getByRole('banner').getByText('فيرتكس شفا').boundingBox();
    const card = await page.locator('[data-slot="card"]').first().boundingBox();
    if (!(mark && product && card)) throw new Error('shell not laid out');
    expect(product.x + product.width).toBeLessThanOrEqual(mark.x);
    expect(Math.abs(mark.x + mark.width - (card.x + card.width))).toBeLessThan(1);
    await expect(page.locator('body')).not.toHaveText(/[٠-٩]/);

    await screenshot(page, testInfo, 'home');
  });

  test('switches between light and dark with one button and keeps the choice', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const html = page.locator('html');
    const systemDark = testInfo.project.name === 'dark';
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
