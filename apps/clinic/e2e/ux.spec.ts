import { expect, type Page, test } from '@playwright/test';
import { facility, mockApi, tenant } from './mock-api.js';
import { mainNav } from './nav.js';
import { screenshot } from './screenshot.js';
import { settled } from './settle.js';

// The behaviours every screen shares (the owner's decisions of 2026-10-18): the theme toggle,
// Enter in forms, Save and unsaved changes, feedback that never moves the page, back navigation,
// the wizard's stepper and the fonts.

// Page code as strings: the E2E is typed for Node, without the DOM's globals.
const background = (page: Page) =>
  page.evaluate<string>('getComputedStyle(document.body).backgroundColor');

test.describe('theme', () => {
  test('follows the system until pressed, then keeps the choice from the first paint', async ({
    page,
  }, testInfo) => {
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities: [facility()] });
    await page.goto('/');
    const systemDark = testInfo.project.use.colorScheme === 'dark';
    const html = page.locator('html');
    await expect(html).toHaveClass(systemDark ? /dark/ : /^(?!.*dark)/);
    await screenshot(page, testInfo, 'theme-system');

    // One button, named by what it switches to: the other theme than the system's.
    const toDark = page.getByRole('button', { name: 'فعّل الوضع الداكن' });
    const toLight = page.getByRole('button', { name: 'فعّل الوضع الفاتح' });
    const systemBackground = await background(page);
    await (systemDark ? toLight : toDark).click();
    await expect(systemDark ? toDark : toLight).toBeVisible();
    await expect(html).toHaveClass(systemDark ? /^(?!.*dark)/ : /dark/);
    const chosenBackground = await background(page);
    expect(chosenBackground).not.toBe(systemBackground);
    await screenshot(page, testInfo, systemDark ? 'theme-light' : 'theme-dark');

    // After a reload the choice is on <html> before any of the app's code runs.
    await page.route(/\/assets\/index-[^/]+\.js$/, (route) => route.abort());
    await page.reload();
    expect(await background(page)).toBe(chosenBackground);
    await page.unroute(/\/assets\/index-[^/]+\.js$/);

    await page.reload();
    await (systemDark ? toDark : toLight).click();
    expect(await background(page)).toBe(systemBackground);
  });
});

test.describe('forms', () => {
  test('move with Enter, go back with Shift+Enter, and save from the last field', async ({
    page,
  }) => {
    const api = await mockApi(page, { tenant: tenant({ status: 'active' }), logo: true });
    await page.goto('/settings/clinic');
    const arabic = page.getByLabel('اسم العيادة بالعربية');
    const latin = page.getByLabel('اسم العيادة بالأحرف اللاتينية (اختياري)');
    await arabic.focus();
    await arabic.press('Enter');
    await expect(latin).toBeFocused();
    await latin.press('Shift+Enter');
    await expect(arabic).toBeFocused();

    // Nothing changed: Enter on the last field saves nothing.
    await latin.press('Enter');
    expect(api.writes).toEqual([]);

    await latin.fill('Test Clinic');
    await latin.press('Enter');
    await expect(page.getByText('حُفظت التغييرات.')).toBeVisible();
    expect(api.tenant.nameLatin).toBe('Test Clinic');
  });

  test('save without moving the page, and discard back to the saved values', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    await page.goto('/settings/location');
    const save = page.getByRole('button', { name: 'حفظ' });
    const address = page.getByLabel('تفاصيل العنوان');
    await expect(save).toBeDisabled();
    await expect(page.getByRole('button', { name: 'تجاهل التغييرات' })).toHaveCount(0);

    await address.fill('شارع السوق، بناء 7');
    await expect(save).toBeEnabled();
    await page.getByRole('button', { name: 'تجاهل التغييرات' }).click();
    await expect(address).toHaveValue('الحي الشمالي، شارع المدرسة، بناء 3');
    await expect(save).toBeDisabled();

    await address.fill('شارع السوق، بناء 7');
    const firstCard = page.locator('[data-slot="card"]').first();
    const layout = async () => [await firstCard.boundingBox(), await save.boundingBox()];
    // Measured where the user clicks: the button in view.
    await save.scrollIntoViewIfNeeded();
    const before = await layout();
    api.writeDelayMs = 500;
    await save.click();
    await expect(save).toHaveAttribute('aria-busy', 'true');
    // Locked with the fields: the values being saved stay the values shown.
    await expect(page.getByRole('button', { name: 'تجاهل التغييرات' })).toBeDisabled();
    expect(await layout()).toEqual(before);
    await expect(page.getByText('حُفظت التغييرات.')).toBeVisible();
    expect(await layout()).toEqual(before);
    await expect(save).toBeDisabled();
    expect(api.facilities[0]?.addressDetails).toBe('شارع السوق، بناء 7');
    await screenshot(page, testInfo, 'settings-saved-toast');
  });

  test('ask before leaving with unsaved changes', async ({ page }, testInfo) => {
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities: [facility()] });
    // From home, so the history keys have a step back inside the app.
    await page.goto('/');
    await (await mainNav(page)).getByRole('link', { name: 'بيانات العيادة' }).click();
    const latin = page.getByLabel('اسم العيادة بالأحرف اللاتينية (اختياري)');
    await latin.fill('Test Clinic');

    await (await mainNav(page)).getByRole('link', { name: 'الرئيسية' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('لم تُحفظ تغييراتك');
    await expect(dialog.getByRole('button', { name: 'البقاء' })).toBeFocused();
    await screenshot(page, testInfo, 'unsaved-changes');
    await dialog.getByRole('button', { name: 'البقاء' }).click();
    await expect(page).toHaveURL('/settings/clinic');
    await expect(latin).toHaveValue('Test Clinic');
    await expect(dialog).toBeHidden();

    // The history keys ask too.
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL('/settings/clinic');

    // Reloading or closing the window: the browser's own question (`beforeunload`).
    const asked = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const unload = await asked;
    expect(unload.type()).toBe('beforeunload');
    await unload.accept();
  });

  test('leave without asking once saved, and when the user chose to leave', async ({ page }) => {
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities: [facility()] });
    await page.goto('/settings/clinic');
    await page.getByLabel('اسم العيادة بالأحرف اللاتينية (اختياري)').fill('Test Clinic');
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('حُفظت التغييرات.')).toBeVisible();
    await (await mainNav(page)).getByRole('link', { name: 'الرئيسية' }).click();
    await expect(page).toHaveURL('/');

    await (await mainNav(page)).getByRole('link', { name: 'بيانات العيادة' }).click();
    await page.getByLabel('اسم العيادة بالأحرف اللاتينية (اختياري)').fill('Other');
    await (await mainNav(page)).getByRole('link', { name: 'الرئيسية' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'المغادرة دون حفظ' }).click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('redirects', () => {
  test('are not held by a screen with unsaved changes that gave way to them', async ({ page }) => {
    await page.clock.install();
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    await page.goto('/settings/location');
    await page.getByLabel('تفاصيل العنوان').fill('شارع السوق');

    // Another owner adds a second branch; the next refetch replaces this screen with the list.
    api.editBehind((state) => {
      state.facilities.push(facility({ name: 'فرع السوق' }));
    });
    await page.clock.fastForward(31_000);
    await page.evaluate("window.dispatchEvent(new Event('visibilitychange'))");
    await expect(page).toHaveURL('/settings/branches');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الفروع');
  });
});

test.describe('navigation', () => {
  test('goes back from sub-pages, and through history with Alt+Left and Alt+Right', async ({
    page,
  }) => {
    const branch = facility({ name: 'فرع الشمال' });
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities: [facility(), branch] });
    await page.goto('/settings/branches');
    await page.getByRole('row').nth(2).getByRole('link', { name: 'الإعدادات' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('فرع الشمال');

    // The back action names where it goes; its arrow points right, to the inline start.
    const back = page.locator('[data-slot="page-header"]').getByRole('link', { name: 'الفروع' });
    await back.click();
    await expect(page).toHaveURL('/settings/branches');

    await page.keyboard.press('Alt+ArrowLeft');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('فرع الشمال');
    await page.keyboard.press('Alt+ArrowRight');
    await expect(page).toHaveURL('/settings/branches');

    await page.locator('[data-slot="page-header"]').getByRole('link', { name: 'الرئيسية' }).click();
    await expect(page).toHaveURL('/');

    await page.goto('/settings/branches/new');
    await page.locator('[data-slot="page-header"]').getByRole('link', { name: 'الفروع' }).click();
    await expect(page).toHaveURL('/settings/branches');
  });

  test('the wizard stepper goes back to completed steps only', async ({ page }, testInfo) => {
    await mockApi(page, { tenant: tenant(), facilities: [facility()] });
    await page.goto('/setup');
    await expect(page.getByText('الخطوة 3 من 5')).toBeVisible();
    const steps = page.getByRole('navigation', { name: 'خطوات الإعداد' });
    await expect(steps.getByRole('listitem')).toHaveCount(5);
    await expect(steps.getByRole('button')).toHaveText(['1. العيادة', '2. العنوان والتواصل']);
    await expect(steps.getByRole('listitem').nth(2)).toHaveAttribute('aria-current', 'step');

    // Each segment sits over its own label, measured once the page has settled.
    await settled(page);
    const items = await steps.getByRole('listitem').all();
    for (const item of items) {
      const [segment, label] = await Promise.all([
        item.locator('span').first().boundingBox(),
        item.locator('span').last().boundingBox(),
      ]);
      if (!(segment && label)) throw new Error('step not laid out');
      expect(segment.x + segment.width).toBeGreaterThanOrEqual(label.x + label.width - 1);
    }
    await screenshot(page, testInfo, 'setup-stepper');

    await steps.getByRole('button', { name: '1. العيادة' }).click();
    await expect(page.getByText('الخطوة 1 من 5')).toBeVisible();
    await expect(page.getByLabel('اسم العيادة بالعربية')).toBeVisible();
  });
});

test.describe('fonts', () => {
  test('preloads the first screen fonts and draws with them on the first paint', async ({
    page,
  }) => {
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities: [facility()] });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(6);
    const loaded = await page.evaluate<string[]>(`document.fonts.ready.then((fonts) =>
      [...fonts].filter((face) => face.status === 'loaded').map((face) => face.family + ' ' + face.weight),
    )`);
    for (const face of ['Noto Kufi Arabic 400', 'Noto Kufi Arabic 700', 'Montserrat 400']) {
      expect(loaded.map((name) => name.replaceAll(/["']/g, ''))).toContain(face);
    }
    // Every preload was used.
    expect(warnings.filter((text) => text.includes('preload'))).toEqual([]);
  });
});
