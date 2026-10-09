import { expect, type Page, type TestInfo, test } from '@playwright/test';

/** An RTL screenshot per color scheme, kept in test-results/ (uploaded by CI) and in the report. */
async function screenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}-${testInfo.project.name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.describe('patient shell', () => {
  test('renders in Arabic, right to left, with Vertex Shifa always visible', async ({
    page,
  }, testInfo) => {
    await page.goto('/');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(page).toHaveTitle('فيرتكس شفا');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('أهلًا بك في فيرتكس شفا');
    await expect(page.getByRole('banner')).toHaveText('فيرتكس شفا');
    // The device's color scheme applies (the web export is rendered ahead in light): the surface
    // token is white in light and green-900 in dark (packages/tokens).
    const surface = testInfo.project.name === 'dark' ? 'rgb(11, 45, 40)' : 'rgb(255, 255, 255)';
    await expect(page.getByRole('banner')).toHaveCSS('background-color', surface);

    // Right to left: the product name starts at the right edge of the header.
    const header = await page.getByRole('banner').boundingBox();
    const product = await page.getByRole('banner').getByText('فيرتكس شفا').boundingBox();
    expect(header && product).toBeTruthy();
    if (header && product) {
      expect(header.x + header.width - (product.x + product.width)).toBeLessThan(40);
    }
    await expect(page.locator('body')).not.toHaveText(/[٠-٩]/);

    await screenshot(page, testInfo, 'home');
  });

  test('shows the not-found state for an unknown route', async ({ page }, testInfo) => {
    const response = await page.goto('/no-such-screen');
    expect(response?.status()).toBe(404);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الصفحة غير موجودة');
    await page.getByRole('link', { name: 'العودة إلى الرئيسية' }).click();
    await expect(page).toHaveURL('/');

    await page.goto('/no-such-screen');
    await screenshot(page, testInfo, 'not-found');
  });
});
