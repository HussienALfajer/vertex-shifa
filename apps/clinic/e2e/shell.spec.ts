import { expect, test } from '@playwright/test';
import { facility, mockApi, tenant } from './mock-api.js';
import { screenshot } from './screenshot.js';

test.describe('clinic shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities: [facility()] });
  });

  test('renders in Arabic, right to left, with Vertex Shifa always visible', async ({
    page,
  }, testInfo) => {
    await page.goto('/');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(page).toHaveTitle('فيرتكس شفا');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('مرحبًا بك في فيرتكس شفا');
    await expect(page.getByRole('banner')).toContainText('فيرتكس شفا');
    await expect(page.getByRole('contentinfo')).toHaveText('بدعم من فيرتكس شفا');

    // Right to left: the Vertex Shifa mark starts the header on the right, the product name
    // follows it to the left. The header, the navigation and the page share the same edges.
    const mark = await page.getByRole('banner').locator('svg').first().boundingBox();
    const product = await page.getByRole('banner').getByText('فيرتكس شفا').boundingBox();
    const toggle = await page.locator('[data-slot="theme-toggle"]').boundingBox();
    const nav = await page.getByRole('navigation').boundingBox();
    const card = await page.locator('[data-slot="card"]').first().boundingBox();
    if (!(mark && product && toggle && nav && card)) throw new Error('shell not laid out');
    expect(product.x + product.width).toBeLessThanOrEqual(mark.x);
    const end = (box: { x: number; width: number }) => box.x + box.width;
    expect(Math.abs(end(mark) - end(nav))).toBeLessThan(1);
    expect(Math.abs(end(card) - end(nav))).toBeLessThan(1);
    expect(Math.abs(toggle.x - nav.x)).toBeLessThan(1);
    await expect(page.locator('body')).not.toHaveText(/[٠-٩]/);

    await screenshot(page, testInfo, 'home');
  });

  test('keeps the header whole and its edges with the page from the narrowest window to wide screens', async ({
    page,
  }, testInfo) => {
    // 960 px is the desktop window's minimum width (electron/main.ts).
    for (const width of [960, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${width}px`).toBe(0);
      const mark = await page.getByRole('banner').locator('svg').first().boundingBox();
      const toggle = await page.locator('[data-slot="theme-toggle"]').boundingBox();
      const nav = await page.getByRole('navigation').boundingBox();
      if (!(mark && toggle && nav)) throw new Error('shell not laid out');
      expect(Math.abs(mark.x + mark.width - (nav.x + nav.width)), `${width}px`).toBeLessThan(1);
      expect(Math.abs(toggle.x - nav.x), `${width}px`).toBeLessThan(1);
      expect(toggle.x, `${width}px`).toBeGreaterThanOrEqual(0);
      await screenshot(page, testInfo, `home-${width}`);
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
