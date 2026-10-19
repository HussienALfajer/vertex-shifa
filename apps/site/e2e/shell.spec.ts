import { expect, type Page, type TestInfo, test } from '@playwright/test';

/**
 * An RTL screenshot per project (desktop light and dark, tablet, phone), kept in test-results/
 * (uploaded by CI) and in the report. No page is wider than its window (AGENTS.md "Responsive").
 */
async function screenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow, `${name} scrolls sideways on ${testInfo.project.name}`).toBe(0);
  const path = testInfo.outputPath(`${name}-${testInfo.project.name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.describe('site shell', () => {
  test('renders in Arabic, right to left, with Vertex Shifa always visible', async ({
    page,
  }, testInfo) => {
    await page.goto('/');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(page).toHaveTitle('فيرتكس شفا');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('صفحات العيادات');
    await expect(page.getByRole('banner')).toContainText('فيرتكس شفا');
    await expect(page.getByRole('banner')).toContainText('صفحات العيادات');
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

  test('shows the not-found state for an unknown page', async ({ page }, testInfo) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الصفحة غير موجودة');
    await page.getByRole('link', { name: 'العودة إلى الرئيسية' }).click();
    await expect(page).toHaveURL('/');

    await page.goto('/no-such-page');
    await screenshot(page, testInfo, 'not-found');
  });
});
