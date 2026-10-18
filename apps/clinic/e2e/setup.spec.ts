import { expect, test } from '@playwright/test';
import { areas, facility, logoPng, mockApi, shortLink, tenant } from './mock-api.js';
import { screenshot } from './screenshot.js';

// The onboarding wizard (S01 screen 1) against the mocked API, without map tiles: the location is
// set through the paste field (S01 acceptance).

test.describe('onboarding wizard', () => {
  test('takes the owner from a new clinic to an active one, saving every step', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, { tenant: tenant() });
    await page.goto('/');
    await expect(page).toHaveURL('/setup');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('إعداد العيادة');
    await expect(page.getByText('الخطوة 1 من 5')).toBeVisible();

    // Step 1: the clinic. The Arabic name comes from creation; the logo uploads at once.
    await expect(page.getByLabel('اسم العيادة بالعربية')).toHaveValue('عيادة الاختبار');
    await page.getByLabel('اسم العيادة بالعربية').fill('عيادة النور التجريبية');
    await page.getByLabel('اسم العيادة بالأحرف اللاتينية (اختياري)').fill('Test Clinic');
    await page.getByLabel('رفع شعار').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: logoPng,
    });
    await expect(page.getByRole('img', { name: 'شعار العيادة' })).toBeVisible();
    await screenshot(page, testInfo, 'setup-1-clinic');
    await page.getByRole('button', { name: 'التالي' }).click();

    // Step 2: the address. The word "branch" never appears to a single-branch clinic (rule 9).
    await expect(page.getByText('الخطوة 2 من 5')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('فرع');
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByText('اختر المدينة.')).toBeVisible();
    await expect(page.getByText('حدّد موقع العيادة.')).toBeVisible();
    await screenshot(page, testInfo, 'setup-2-location-errors');

    await page.getByRole('combobox', { name: 'المحافظة' }).click();
    await page.getByRole('option', { name: 'حلب' }).click();
    await page.getByRole('combobox', { name: 'المدينة' }).click();
    await expect(page.getByRole('option', { name: 'تل رفعت' })).toHaveCount(0);
    await page.getByRole('option', { name: 'أعزاز' }).click();
    await page.getByLabel('تفاصيل العنوان').fill('الحي الشمالي، شارع المدرسة، بناء 3');
    const paste = page.getByLabel('الصق رابط خرائط Google أو الإحداثيات');
    await paste.fill(shortLink);
    await paste.press('Enter');
    await expect(paste).toHaveValue('36.587, 37.045');
    await page.getByLabel('رقم التواصل 1').fill('0900 000 001');
    await page.getByRole('switch', { name: 'عليه واتساب' }).click();
    await page.getByRole('button', { name: 'إضافة رقم' }).click();
    await page.getByLabel('رقم التواصل 2').fill('021 000 0001');
    // A landline gets no WhatsApp toggle.
    await expect(page.getByRole('switch', { name: 'عليه واتساب' })).toHaveCount(1);
    await screenshot(page, testInfo, 'setup-2-location');
    await page.getByRole('button', { name: 'التالي' }).click();

    // Step 3: the week starts on Saturday; the currency is an explicit choice.
    await expect(page.getByText('الخطوة 3 من 5')).toBeVisible();
    const days = page.getByRole('group', { name: 'أيام العمل' }).getByRole('button');
    await expect(days.first()).toHaveText('السبت');
    await expect(page.getByRole('button', { name: 'الجمعة' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByText('اختر العملة.')).toBeVisible();
    await page.getByRole('button', { name: 'الخميس' }).click();
    await page.getByRole('button', { name: 'ليرة تركية (TRY)' }).click();
    await screenshot(page, testInfo, 'setup-3-week');
    await page.getByRole('button', { name: 'التالي' }).click();

    // Step 4: the waiting-room display.
    await expect(page.getByText('الخطوة 4 من 5')).toBeVisible();
    await expect(page.getByText('مثال: 12', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'الاسم الأول وأول حرف من اسم الأب' }).click();
    await expect(page.getByText('مثال: 12 · محمد أ.')).toBeVisible();
    await screenshot(page, testInfo, 'setup-4-display');

    // While a step is being saved its fields are locked without moving: the button shows the
    // progress, the fields are inert, the way back is disabled.
    api.writeDelayMs = 800;
    const nextButton = page.getByRole('button', { name: 'التالي' });
    const before = await nextButton.boundingBox();
    await nextButton.click();
    await expect(nextButton).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('[data-slot="form-fields"]')).toHaveAttribute('inert', '');
    await expect(page.getByRole('button', { name: 'السابق' })).toBeDisabled();
    expect(await nextButton.boundingBox()).toEqual(before);
    api.writeDelayMs = 0;

    // Step 5: the review, then finish.
    await expect(page.getByText('الخطوة 5 من 5')).toBeVisible();
    const review = page.getByRole('main');
    await expect(review).toContainText('عيادة النور التجريبية');
    await expect(review).toContainText('Test Clinic');
    await expect(review).toContainText('أعزاز، حلب');
    await expect(review).toContainText('السبت، الأحد، الاثنين، الثلاثاء، الأربعاء');
    await expect(review).not.toContainText('الخميس');
    await expect(review).toContainText('ليرة تركية (TRY)');
    await expect(review).toContainText('الاسم الأول وأول حرف من اسم الأب');
    await screenshot(page, testInfo, 'setup-5-review');
    await page.getByRole('button', { name: 'إنهاء الإعداد' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('navigation')).toContainText('الموقع والإعدادات');
    expect(api.tenant.status).toBe('active');
    expect(api.writes).toEqual([
      'PUT /api/tenant/logo',
      'PATCH /api/tenant/profile',
      'POST /api/maps/resolve-link',
      'POST /api/facilities',
      `PATCH /api/facilities/${api.facilities[0]?.id}`,
      `PATCH /api/facilities/${api.facilities[0]?.id}`,
      'POST /api/tenant/onboarding/complete',
    ]);
    const [branch] = api.facilities;
    expect(branch).toMatchObject({
      name: 'عيادة النور التجريبية',
      areaId: areas.azaz,
      coordinates: { latitudeE7: 365_870_000, longitudeE7: 370_450_000 },
      contactPhones: [
        { phone: '+963900000001', whatsapp: true },
        { phone: '+963210000001', whatsapp: false },
      ],
      defaultCurrency: 'TRY',
      workingDays: 0b0011111,
      displayNameFormat: 'first_name_father_initial',
    });
  });

  test('resumes at the week step, asks for the currency again, and checks the whole branch', async ({
    page,
  }) => {
    // The saved currency may be the stand-in the location step sent.
    const api = await mockApi(page, {
      tenant: tenant(),
      facilities: [facility({ defaultCurrency: 'USD' })],
    });
    await page.goto('/setup');
    await expect(page.getByText('الخطوة 3 من 5')).toBeVisible();
    await expect(page.getByRole('button', { name: 'دولار أمريكي (USD)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // Every working day removed, then back to the location step: its "Next" saves the whole
    // branch, so it leads back to the week step's error instead of a failed save.
    for (const day of ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس']) {
      await page.getByRole('button', { name: day }).click();
    }
    await page.getByRole('button', { name: 'السابق' }).click();
    await expect(page.getByText('الخطوة 2 من 5')).toBeVisible();
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByText('الخطوة 3 من 5')).toBeVisible();
    await expect(page.getByText('اختر يومًا واحدًا على الأقل.')).toBeVisible();
    expect(api.writes).toEqual([]);
  });

  test('shows the branch whose create answer was lost, never creating or overwriting', async ({
    page,
  }) => {
    const api = await mockApi(page, { tenant: tenant() });
    await page.goto('/setup');
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByText('الخطوة 2 من 5')).toBeVisible();
    await page.getByRole('combobox', { name: 'المحافظة' }).click();
    await page.getByRole('option', { name: 'حلب' }).click();
    await page.getByRole('combobox', { name: 'المدينة' }).click();
    await page.getByRole('option', { name: 'أعزاز' }).click();
    await page.getByLabel('تفاصيل العنوان').fill('شارع المدرسة، بناء 3');
    const paste = page.getByLabel('الصق رابط خرائط Google أو الإحداثيات');
    await paste.fill('36.5866, 37.0469');
    await paste.press('Enter');
    await page.getByLabel('رقم التواصل 1').fill('0900 000 001');

    api.loseNextCreateAnswer = true;
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'تعذّر الوصول إلى الخادم. تحقّق من الاتصال ثم أعد المحاولة.',
    );
    await page.getByLabel('تفاصيل العنوان').fill('شارع المدرسة، بناء 5');
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByRole('alert')).toContainText('لم يصل ردّ الحفظ السابق');
    await expect(page.getByText('الخطوة 2 من 5')).toBeVisible();
    // The saved values replace the edit; nothing was written over the branch.
    await expect(page.getByLabel('تفاصيل العنوان')).toHaveValue('شارع المدرسة، بناء 3');
    expect(api.writes.filter((write) => write.startsWith('PATCH /api/facilities'))).toEqual([]);

    await page.getByLabel('تفاصيل العنوان').fill('شارع المدرسة، بناء 5');
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByText('الخطوة 3 من 5')).toBeVisible();
    expect(api.facilities).toHaveLength(1);
    expect(api.facilities[0]?.addressDetails).toBe('شارع المدرسة، بناء 5');
    expect(api.writes.filter((write) => write.startsWith('POST /api/facilities'))).toHaveLength(1);
  });

  test('shows a failed area list with a retry, keeping the step', async ({ page }) => {
    const api = await mockApi(page, { tenant: tenant() });
    api.failAreas = true;
    await page.goto('/setup');
    await page.getByRole('button', { name: 'التالي' }).click();
    await page.getByLabel('تفاصيل العنوان').fill('شارع المدرسة');
    const failed = page.getByRole('alert').filter({ hasText: 'تعذّر تحميل القائمة.' });
    await expect(failed).toContainText('حدث خطأ في الخادم.');
    api.failAreas = false;
    await failed.getByRole('button', { name: 'إعادة المحاولة' }).click();
    await page.getByRole('combobox', { name: 'المحافظة' }).click();
    await expect(page.getByRole('option', { name: 'حلب' })).toBeVisible();
    await expect(page.getByLabel('تفاصيل العنوان')).toHaveValue('شارع المدرسة');
  });

  test('jumps to the missing step when the API finds onboarding incomplete', async ({ page }) => {
    const api = await mockApi(page, { tenant: tenant(), facilities: [facility()] });
    api.failCompletion = true;
    await page.goto('/setup');
    await expect(page.getByText('الخطوة 3 من 5')).toBeVisible();
    await page.getByRole('button', { name: 'ليرة تركية (TRY)' }).click();
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByText('الخطوة 4 من 5')).toBeVisible();
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByText('الخطوة 5 من 5')).toBeVisible();
    await page.getByRole('button', { name: 'إنهاء الإعداد' }).click();
    await expect(page.getByText('الخطوة 2 من 5')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('لم تكتمل بيانات العيادة بعد');
  });
});
