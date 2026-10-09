import { expect, type Page, type TestInfo, test } from '@playwright/test';

/** An RTL screenshot per color scheme, kept in test-results/ (uploaded by CI) and in the report. */
async function screenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}-${testInfo.project.name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.describe('console shell', () => {
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

    // Right to left: the Vertex Shifa mark starts at the right edge of the header, the product
    // name follows it to the left.
    const header = await page.getByRole('banner').boundingBox();
    const mark = await page.getByRole('banner').locator('svg').first().boundingBox();
    const product = await page.getByRole('banner').getByText('فيرتكس شفا').boundingBox();
    expect(header && mark && product).toBeTruthy();
    if (header && mark && product) {
      expect(header.x + header.width - (mark.x + mark.width)).toBeLessThan(40);
      expect(product.x + product.width).toBeLessThanOrEqual(mark.x);
    }
    await expect(page.locator('body')).not.toHaveText(/[٠-٩]/);

    await screenshot(page, testInfo, 'home');
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
