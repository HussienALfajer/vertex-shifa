import { expect, type Page, test } from '@playwright/test';
import { facility, mockApi, tenant } from './mock-api.js';
import { screenshot } from './screenshot.js';
import { settled } from './settle.js';

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
    // "Vertex Shifa" is always on screen: in the sidebar beside the page, or in the top bar.
    await expect(
      page.getByText('فيرتكس شفا', { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);
    await expect(page.getByRole('contentinfo')).toHaveText('بدعم من فيرتكس شفا');
    await expect(page.locator('body')).not.toHaveText(/[٠-٩]/);
    await expectFrame(page, testInfo.project.name);
    // The keyboard's first stop skips the navigation to the page, without a history step.
    await page.keyboard.press('Tab');
    const skip = page.getByRole('button', { name: 'انتقل إلى المحتوى' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await expect(page).toHaveURL('/');

    await screenshot(page, testInfo, 'home');
  });

  // From a 320 px phone to a wide screen; 360 px is the desktop window's minimum width
  // (electron/main.ts).
  for (const width of [320, 360, 768, 1024, 1920]) {
    test(`fits a ${width} px window`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/settings/clinic');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectFrame(page, `${width}px`);
      await screenshot(page, testInfo, `settings-clinic-${width}`);
    });
  }

  test('opens the navigation in a sheet on a phone, and closes it on a link', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('[data-slot="app-sidebar"]')).toBeHidden();
    await page.getByRole('button', { name: 'افتح القائمة' }).click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('فيرتكس شفا');
    // The sheet slides in from the inline start: the right in Arabic.
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box && Math.round(box.x + box.width);
      })
      .toBe(390);
    await screenshot(page, testInfo, 'navigation-sheet');

    await sheet.getByRole('link', { name: 'بيانات العيادة' }).click();
    await expect(page).toHaveURL('/settings/clinic');
    await expect(sheet).toBeHidden();
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

/**
 * The frame at the window's size: the sidebar at the inline start (the right) from 768 px, hidden
 * below it; the top bar's theme toggle on the page column's end edge; nothing wider than the window.
 * Measured once the page has `settled`.
 */
async function expectFrame(page: Page, label: string): Promise<void> {
  await settled(page);
  const width = page.viewportSize()?.width ?? 0;
  const sidebar = page.locator('[data-slot="app-sidebar"]');
  if (width >= 768) {
    const box = await sidebar.boundingBox();
    if (!box) throw new Error('sidebar not laid out');
    expect(Math.abs(box.x + box.width - width), label).toBeLessThan(1);
    await expect(page.getByRole('button', { name: 'افتح القائمة' }), label).toBeHidden();
  } else {
    await expect(sidebar, label).toBeHidden();
    await expect(page.getByRole('button', { name: 'افتح القائمة' }), label).toBeVisible();
  }
  const toggle = await page.locator('[data-slot="theme-toggle"]').boundingBox();
  const column = await page.getByRole('main').locator('[data-slot="page-container"]').boundingBox();
  if (!(toggle && column)) throw new Error('shell not laid out');
  // The column's padding is 16 px on phones, 32 px from 768 px.
  const gutter = width >= 768 ? 32 : 16;
  expect(Math.abs(toggle.x - (column.x + gutter)), label).toBeLessThan(1);
}
