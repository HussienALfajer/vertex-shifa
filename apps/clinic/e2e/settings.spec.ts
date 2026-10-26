import { expect, test } from '@playwright/test';
import { areas, facility, mockApi, tenant } from './mock-api.js';
import { closeNav, mainNav } from './nav.js';
import { screenshot } from './screenshot.js';

// Clinic settings, branch settings and the branch list (S01 screens 3–6) against the mocked API.

test.describe('clinic settings', () => {
  test('saves the profile, and reloads it when another owner saved first', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, { tenant: tenant({ status: 'active' }), logo: true });
    await page.goto('/settings/clinic');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('بيانات العيادة');
    await expect(page.getByRole('img', { name: 'شعار العيادة' })).toBeVisible();
    await expect(
      page.getByText('ليس بعد. لا تظهر عيادتك في تطبيق فيرتكس شفا حتى الآن.'),
    ).toBeVisible();
    await expect(page.getByText('يدير فريق فيرتكس هذا الإعداد.')).toBeVisible();

    // Saving waits for a change.
    await expect(page.getByRole('button', { name: 'حفظ' })).toBeDisabled();
    await page.getByLabel('اسم العيادة بالأحرف اللاتينية (اختياري)').fill('Test Clinic');
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('حُفظت التغييرات.')).toBeVisible();
    expect(api.tenant.nameLatin).toBe('Test Clinic');
    await expect(page.getByRole('button', { name: 'حفظ' })).toBeDisabled();
    await screenshot(page, testInfo, 'settings-clinic');

    // Another owner renames the clinic meanwhile: this save is refused and the form reloads.
    api.editBehind((state) => {
      state.tenant = {
        ...state.tenant,
        nameAr: 'عيادة الاختبار الجديدة',
        updatedAt: '2026-10-18T12:00:00.000Z',
      };
    });
    await page.getByLabel('اسم العيادة بالعربية').fill('اسم آخر');
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByRole('alert')).toContainText('غيّر شخص آخر هذه البيانات أثناء تعديلك');
    await expect(page.getByLabel('اسم العيادة بالعربية')).toHaveValue('عيادة الاختبار الجديدة');
    await screenshot(page, testInfo, 'settings-clinic-conflict');
  });

  test('says a logo failed to load, never that there is none, and retries', async ({
    page,
  }, testInfo) => {
    await mockApi(page, { tenant: tenant({ status: 'active' }), logo: true });
    let failing = true;
    await page.route('**/api/tenant/logo', (route) =>
      failing && route.request().method() === 'GET' ? route.abort('failed') : route.fallback(),
    );
    await page.goto('/settings/clinic');
    const failed = page.getByRole('alert').filter({ hasText: 'تعذّر تحميل الشعار.' });
    // A network error is transient: the query tries twice more, 1 s and then 2 s later
    // (src/lib/query-client.ts), before the screen may say the read failed.
    await expect(failed).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('لا يوجد شعار.', { exact: false })).toBeHidden();
    await screenshot(page, testInfo, 'settings-clinic-logo-failed');

    failing = false;
    await failed.getByRole('button', { name: 'إعادة المحاولة' }).click();
    await expect(page.getByRole('img', { name: 'شعار العيادة' })).toBeVisible();
    await expect(failed).toBeHidden();
  });

  test('refuses to save while the pasted location is refused', async ({ page }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    await page.goto('/settings/location');
    await page.getByLabel('تفاصيل العنوان').fill('الشارع الرئيسي، بناء جديد');
    const paste = page.getByLabel('الصق رابط خرائط Google أو الإحداثيات');
    await paste.fill('not coordinates');
    await paste.blur();
    await expect(page.getByText('لم نتعرف على موقع في هذا النص.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('لم يُعتمد الموقع الملصق بعد', { exact: false })).toBeVisible();
    await expect(paste).toBeFocused();
    expect(api.writes).toEqual([]);
    await screenshot(page, testInfo, 'settings-location-unsettled');

    // Discarding takes the refused text with the changes: the saved point shows again.
    await page.getByRole('button', { name: 'تجاهل التغييرات' }).click();
    await expect(paste).toHaveValue(/^36\.5866/);
    await page.getByLabel('تفاصيل العنوان').fill('الشارع الرئيسي، بناء جديد');
    await paste.fill('not coordinates');
    await paste.blur();
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('لم يُعتمد الموقع الملصق بعد', { exact: false })).toBeVisible();
    expect(api.writes).toEqual([]);

    await paste.fill('36.5866, 37.0469');
    await paste.press('Enter');
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('حُفظت التغييرات.')).toBeVisible();
  });

  test('shows the location of a single-branch clinic without the word "branch"', async ({
    page,
  }, testInfo) => {
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities: [facility()] });
    await page.goto('/settings/location');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الموقع والإعدادات');
    await expect(page.getByRole('combobox', { name: 'المدينة' })).toHaveText('أعزاز');
    await expect(page.getByLabel('رقم التواصل 1')).toHaveValue('+963900000001');
    await expect(page.getByRole('button', { name: 'ليرة تركية (TRY)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Only "Add a branch" names a branch (rule 9).
    const main = page.getByRole('main');
    await expect(main.getByText(/فرع/)).toHaveText(['إضافة فرع']);
    await expect(await mainNav(page)).not.toContainText('الفروع');
    await closeNav(page);
    await screenshot(page, testInfo, 'settings-location');
  });

  test('keeps showing an archived city a branch references', async ({ page }, testInfo) => {
    const branch = facility({ name: 'فرع الشمال', areaId: areas.tallRifaat });
    await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility(), branch],
    });
    await page.goto(`/settings/branches/${branch.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('فرع الشمال');
    await expect(page.getByRole('combobox', { name: 'المدينة' })).toHaveText(
      'تل رفعت (لم تعد في القائمة)',
    );
    await screenshot(page, testInfo, 'settings-branch');
  });
});

test.describe('branches', () => {
  test('appear with a second branch, and the last one in use cannot be archived', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    await page.goto('/settings/location');
    await page.getByRole('link', { name: 'إضافة فرع' }).click();
    await expect(page).toHaveURL('/settings/branches/new');

    await page.getByLabel('اسم الفرع').fill('فرع السوق');
    await page.getByRole('combobox', { name: 'المحافظة' }).click();
    await page.getByRole('option', { name: 'حلب' }).click();
    await page.getByRole('combobox', { name: 'المدينة' }).click();
    await page.getByRole('option', { name: 'مارع' }).click();
    await page.getByLabel('تفاصيل العنوان').fill('شارع السوق، بناء 7');
    const paste = page.getByLabel('الصق رابط خرائط Google أو الإحداثيات');
    await paste.fill('36.4931, 37.0858');
    await paste.press('Enter');
    await page.getByLabel('رقم التواصل 1').fill('0900 000 002');
    await page.getByRole('button', { name: 'دولار أمريكي (USD)' }).click();
    await page.getByRole('button', { name: 'إضافة الفرع' }).click();

    // Two branches in use: the list replaces the location screen.
    await expect(page).toHaveURL('/settings/branches');
    await expect(await mainNav(page)).toContainText('الفروع');
    await closeNav(page);
    const rows = page.getByRole('row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2)).toContainText('فرع السوق');
    await expect(rows.nth(2)).toContainText('مارع');
    await screenshot(page, testInfo, 'branches-two');

    await rows.nth(2).getByRole('button', { name: 'أرشفة' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'أرشفة' }).click();
    await expect(rows).toHaveCount(2);
    expect(api.facilities[1]?.archivedAt).not.toBeNull();

    await rows.nth(1).getByRole('button', { name: 'أرشفة' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'أرشفة' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'لا يمكن أرشفة آخر فرع مستخدم. أضف فرعًا آخر أولًا.',
    );
    await screenshot(page, testInfo, 'branches-last-active');

    await page.getByRole('button', { name: 'المؤرشفة' }).click();
    await expect(page).toHaveURL('/settings/branches?archived=true');
    await expect(rows.nth(1)).toContainText('مؤرشف');
    await rows.nth(1).getByRole('button', { name: 'استعادة' }).click();
    await expect(page.getByText('لا توجد فروع مؤرشفة')).toBeVisible();
    expect(api.facilities.every((branch) => branch.archivedAt === null)).toBe(true);
  });

  test('say when the clinic has more branches than the list shows', async ({ page }) => {
    const facilities = Array.from({ length: 101 }, (_, index) =>
      facility({ name: `فرع ${index + 1}` }),
    );
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities });
    await page.goto('/settings/branches');
    await expect(page.getByRole('row')).toHaveCount(101);
    await expect(page.getByRole('status').filter({ hasText: 'أول 100 من أصل 101' })).toBeVisible();
  });
});

test.describe('adding a branch', () => {
  test('shows the branch whose first answer was lost, and saves on top of it', async ({ page }) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility({ name: 'فرع السوق' })],
    });
    // Opened directly: the list of branches is not cached yet.
    await page.goto('/settings/branches/new');
    await page.getByLabel('اسم الفرع').fill('فرع السوق');
    await page.getByRole('combobox', { name: 'المحافظة' }).click();
    await page.getByRole('option', { name: 'حلب' }).click();
    await page.getByRole('combobox', { name: 'المدينة' }).click();
    await page.getByRole('option', { name: 'مارع' }).click();
    await page.getByLabel('تفاصيل العنوان').fill('شارع السوق');
    const paste = page.getByLabel('الصق رابط خرائط Google أو الإحداثيات');
    await paste.fill('36.4931, 37.0858');
    await paste.press('Enter');
    await page.getByLabel('رقم التواصل 1').fill('0900 000 002');
    await page.getByRole('button', { name: 'دولار أمريكي (USD)' }).click();

    api.loseNextCreateAnswer = true;
    await page.getByRole('button', { name: 'إضافة الفرع' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'تعذّر الوصول إلى الخادم. تحقّق من الاتصال ثم أعد المحاولة.',
    );
    await page.getByLabel('تفاصيل العنوان').fill('شارع السوق، بناء 7');
    await page.getByRole('button', { name: 'إضافة الفرع' }).click();

    // Not overwritten blindly: the saved values show, and the owner saves again.
    await expect(page.getByRole('alert')).toContainText('لم يصل ردّ الحفظ السابق');
    await expect(page.getByLabel('تفاصيل العنوان')).toHaveValue('شارع السوق');
    expect(api.writes.filter((write) => write.startsWith('PATCH /api/facilities'))).toEqual([]);
    await page.getByLabel('تفاصيل العنوان').fill('شارع السوق، بناء 7');
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('حُفظت التغييرات.')).toBeVisible();

    expect(api.facilities).toHaveLength(2);
    expect(api.facilities[1]?.addressDetails).toBe('شارع السوق، بناء 7');
    // The existing branch with the same name was left alone.
    expect(api.facilities[0]?.addressDetails).toBe('الحي الشمالي، شارع المدرسة، بناء 3');
  });
});

test.describe('offline', () => {
  test('disables saving and shows the offline state', async ({ page, context }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    await page.goto('/settings/clinic');
    await page.getByLabel('اسم العيادة بالأحرف اللاتينية (اختياري)').fill('Test Clinic');
    await expect(page.getByRole('button', { name: 'حفظ' })).toBeEnabled();

    // The preview server stands in for the app's local files: load the next screen's code first,
    // as the built app always has it.
    const preloaded = page.waitForResponse(/\/assets\/location-[^/]+\.js$/);
    await (await mainNav(page)).getByRole('link', { name: 'الموقع والإعدادات' }).hover();
    await preloaded;
    await page.waitForLoadState('networkidle');
    await closeNav(page);
    await context.setOffline(true);
    await expect(
      page.getByRole('status').filter({ hasText: 'لا يمكن الحفظ دون اتصال' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'حفظ' })).toBeDisabled();
    await expect(
      page
        .getByRole('button', { name: 'تغيير الشعار' })
        .or(page.getByRole('button', { name: 'رفع شعار' })),
    ).toBeDisabled();
    await screenshot(page, testInfo, 'offline-settings');

    // A screen whose data is not loaded yet waits for the connection: nothing is queued. The
    // change typed above is left on purpose.
    await (await mainNav(page)).getByRole('link', { name: 'الموقع والإعدادات' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'المغادرة دون حفظ' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('لا يوجد اتصال بالإنترنت');
    await screenshot(page, testInfo, 'offline-state');

    await context.setOffline(false);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الموقع والإعدادات');
    expect(api.writes).toEqual([]);
  });
});

test.describe('read-only clinic', () => {
  test('shows the banner with the reason category and disables editing', async ({
    page,
  }, testInfo) => {
    await mockApi(page, {
      tenant: tenant({ status: 'suspended', statusReason: 'non_payment' }),
      facilities: [facility()],
    });
    await page.goto('/settings/location');
    const banner = page.getByRole('status').filter({ hasText: 'حساب عيادتك للقراءة فقط' });
    await expect(banner).toContainText('الحساب موقوف.');
    await expect(banner).toContainText('السبب: عدم سداد الاشتراك.');
    await expect(banner).toContainText('للمساعدة تواصل مع فريق فيرتكس شفا.');
    await expect(page.getByRole('button', { name: 'حفظ' })).toBeDisabled();
    await expect(page.getByLabel('تفاصيل العنوان')).toBeDisabled();
    await expect(page.getByRole('link', { name: 'إضافة فرع' })).toHaveCount(0);
    await screenshot(page, testInfo, 'read-only-banner');

    await (await mainNav(page)).getByRole('link', { name: 'الرئيسية' }).click();
    await expect(banner).toBeVisible();
  });

  test('turns read-only when the clinic is suspended during the wizard', async ({ page }) => {
    const api = await mockApi(page, { tenant: tenant() });
    await page.goto('/setup');
    await expect(page.getByText('الخطوة 1 من 5')).toBeVisible();
    api.editBehind((state) => {
      state.tenant = { ...state.tenant, status: 'suspended', statusReason: 'other' };
    });
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('status').filter({ hasText: 'حساب عيادتك للقراءة فقط' }),
    ).toContainText('السبب: قرار من فريق فيرتكس.');
  });
});
