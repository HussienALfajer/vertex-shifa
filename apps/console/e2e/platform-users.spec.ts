import { expect, type Page, test } from '@playwright/test';
import { typeCode } from './code-field.js';
import { mockConsoleApi, totpCode } from './mock-api.js';
import { screenshot } from './screenshot.js';

// Platform users (spec S02 screen 14, rules 36, 38 and 40) and the re-authentication dialog
// (screen 13) against the mocked API. Synthetic data only.

function row(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name });
}

const reauth = (page: Page) => page.getByRole('dialog', { name: 'تأكيد هويتك' });

test.describe('platform users', () => {
  test('an admin adds a user after the TOTP and sees the setup code once', async ({
    page,
  }, testInfo) => {
    const api = await mockConsoleApi(page, { signedIn: 'admin' });
    await page.goto('/platform-users');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('مستخدمو المنصة');
    await expect(row(page, 'مدير تجريبي')).toContainText('أنت');
    // Rule 40: no action on oneself.
    await expect(row(page, 'مدير تجريبي').getByRole('button')).toHaveCount(0);
    await expect(row(page, 'دعم تجريبي')).toContainText('فعّال');
    await screenshot(page, testInfo, 'platform-users');

    await page.getByRole('button', { name: 'إضافة مستخدم' }).click();
    const dialog = page.getByRole('dialog', { name: 'إضافة مستخدم إلى لوحة المنصة' });
    await dialog.getByRole('button', { name: 'إضافة' }).click();
    await expect(dialog.getByText('اكتب الاسم (حرفان على الأقل).')).toBeVisible();
    await dialog.getByLabel('الاسم').fill('موظف دعم جديد');
    await dialog.getByLabel('رقم الهاتف').fill('0900000204');
    await dialog.getByRole('button', { name: 'دعم' }).click();
    await screenshot(page, testInfo, 'platform-users-create');
    await dialog.getByRole('button', { name: 'إضافة' }).click();

    // Rule 38: no TOTP in the last 5 minutes, so the dialog asks first.
    await expect(reauth(page)).toBeVisible();
    await typeCode(page, 'رمز تطبيق المصادقة', '000000');
    await expect(reauth(page).getByText('رمز التحقق غير صحيح.')).toBeVisible();
    await screenshot(page, testInfo, 'reauth');
    await typeCode(page, 'رمز تطبيق المصادقة', totpCode);

    const setup = page.getByRole('dialog', { name: 'رمز الإعداد لـ موظف دعم جديد' });
    await expect(setup).toBeVisible();
    const created = api.users.at(-1);
    await expect(setup).toContainText(created?.setupCode as string);
    await screenshot(page, testInfo, 'platform-users-setup-code');
    await setup.getByRole('button', { name: 'سلّمت الرمز' }).click();
    await expect(setup).toBeHidden();
    await expect(row(page, 'موظف دعم جديد')).toContainText('بانتظار الإعداد');
    await expect(row(page, 'موظف دعم جديد')).toContainText('رمز الإعداد صالح حتى');
    // The code is never shown again.
    await expect(page.getByText(created?.setupCode as string)).toHaveCount(0);
  });

  test('changes a role, then asks again when the window closed on the way', {
    tag: '@flow',
  }, async ({ page }) => {
    const api = await mockConsoleApi(page, { signedIn: 'admin' });
    await page.goto('/platform-users');
    await row(page, 'دعم تجريبي').getByRole('button', { name: 'تغيير الدور' }).click();
    const dialog = page.getByRole('dialog', { name: 'تغيير دور دعم تجريبي' });
    await dialog.getByRole('button', { name: 'مدير' }).click();
    await dialog.getByRole('button', { name: 'حفظ الدور' }).click();
    await typeCode(page, 'رمز تطبيق المصادقة', totpCode);
    await expect(page.getByText('تغيّر الدور.')).toBeVisible();
    await expect(row(page, 'دعم تجريبي')).toContainText('مدير');
    expect(api.users[1]?.role).toBe('admin');

    // The page still believes the window open; the API says otherwise (`REAUTH_REQUIRED`).
    api.closeReauthWindow();
    await row(page, 'دعم تجريبي').getByRole('button', { name: 'إيقاف' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'إيقاف المستخدم' }).click();
    await expect(reauth(page)).toBeVisible();
    await typeCode(page, 'رمز تطبيق المصادقة', totpCode);
    await expect(page.getByText('أُوقف المستخدم.')).toBeVisible();
    await expect(row(page, 'دعم تجريبي')).toContainText('موقوف');
    expect(api.requests.filter((item) => item.startsWith('PATCH'))).toHaveLength(3);

    // A disabled user can be enabled again, not reset (enable first).
    await expect(
      row(page, 'دعم تجريبي').getByRole('button', { name: 'إعادة ضبط الدخول' }),
    ).toHaveCount(0);
    await row(page, 'دعم تجريبي').getByRole('button', { name: 'تفعيل' }).click();
    await expect(page.getByText('فُعّل المستخدم.')).toBeVisible();
    await expect(row(page, 'دعم تجريبي')).toContainText('فعّال');
  });

  test('resets a user: a new setup code, shown once', { tag: '@flow' }, async ({ page }) => {
    const api = await mockConsoleApi(page, { signedIn: 'admin' });
    await page.goto('/platform-users');
    await row(page, 'دعم تجريبي').getByRole('button', { name: 'إعادة ضبط الدخول' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'إعادة الضبط' }).click();
    await typeCode(page, 'رمز تطبيق المصادقة', totpCode);
    const setup = page.getByRole('dialog', { name: 'رمز الإعداد لـ دعم تجريبي' });
    await expect(setup).toBeVisible();
    await expect(setup).toContainText(api.users[1]?.setupCode as string);
    await setup.getByRole('button', { name: 'سلّمت الرمز' }).click();
    await expect(row(page, 'دعم تجريبي')).toContainText('بانتظار الإعداد');
  });

  test('cancelling the TOTP leaves the change undone', { tag: '@flow' }, async ({ page }) => {
    const api = await mockConsoleApi(page, { signedIn: 'admin' });
    await page.goto('/platform-users');
    await row(page, 'دعم تجريبي').getByRole('button', { name: 'تغيير الدور' }).click();
    const dialog = page.getByRole('dialog', { name: 'تغيير دور دعم تجريبي' });
    await dialog.getByRole('button', { name: 'مدير' }).click();
    await dialog.getByRole('button', { name: 'حفظ الدور' }).click();
    await reauth(page).getByRole('button', { name: 'تراجع' }).click();
    await expect(reauth(page)).toBeHidden();
    await expect(dialog.getByRole('alert')).toContainText(
      'أدخل رمز التحقق من تطبيق المصادقة لإتمام هذه العملية.',
    );
    expect(api.requests.some((item) => item.startsWith('PATCH'))).toBe(false);
    expect(api.users[1]?.role).toBe('support');
  });

  test('support staff have no platform users screen', async ({ page }, testInfo) => {
    await mockConsoleApi(page, { signedIn: 'support' });
    await page.goto('/platform-users');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('هذه الصفحة للمديرين');
    await screenshot(page, testInfo, 'platform-users-no-access');
  });
});
