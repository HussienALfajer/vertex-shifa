import { expect, test } from '@playwright/test';
import { codeField, typeCode } from './code-field.js';
import {
  adminPassword,
  adminPhone,
  mockConsoleApi,
  supportPhone,
  totpCode,
  totpSecret,
} from './mock-api.js';
import { screenshot } from './screenshot.js';

// Console sign-in (spec S02 screen 12, rules 36–39) against the mocked API. Synthetic data only.

test.describe('console sign-in', () => {
  test('signs in with the password and the authenticator code', async ({ page }, testInfo) => {
    const api = await mockConsoleApi(page);
    await page.goto('/');
    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الدخول إلى لوحة المنصة');
    await screenshot(page, testInfo, 'sign-in');

    await page.getByLabel('رقم الهاتف').fill(adminPhone);
    await page.getByLabel('كلمة المرور', { exact: true }).fill('wrong-password-1');
    await page.getByRole('button', { name: 'متابعة' }).click();
    await expect(page.getByRole('alert')).toContainText('رقم الهاتف أو كلمة المرور غير صحيحة.');

    await page.getByLabel('كلمة المرور', { exact: true }).fill(adminPassword);
    await page.getByRole('button', { name: 'متابعة' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('رمز التحقق');
    // The browser solved the proof of work before the sign-in (rule 14).
    expect(api.requests).toContain('POST /api/auth/pow');

    await typeCode(page, 'رمز تطبيق المصادقة', '000000');
    await expect(page.getByText('رمز التحقق غير صحيح.')).toBeVisible();
    await expect(codeField(page, 'رمز تطبيق المصادقة').first()).toHaveValue('');
    await screenshot(page, testInfo, 'sign-in-totp');
    await typeCode(page, 'رمز تطبيق المصادقة', totpCode);

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('لوحة إدارة المنصة');
    const nav = page.getByRole('navigation', { name: 'أقسام لوحة المنصة' });
    await expect(nav.getByRole('link', { name: 'مستخدمو المنصة' })).toBeVisible();
    await expect(page.getByRole('banner')).toContainText('مدير تجريبي');
    await expect(page.locator('body')).not.toHaveText(/[٠-٩]/);
    await screenshot(page, testInfo, 'signed-in');
  });

  test('signs in with a recovery code, used once', async ({ page }) => {
    const api = await mockConsoleApi(page);
    const recovery = api.users[1]?.recoveryCodes[0]?.code as string;
    await page.goto('/sign-in');
    await page.getByLabel('رقم الهاتف').fill(supportPhone);
    await page.getByLabel('كلمة المرور', { exact: true }).fill('synthetic-support-pass');
    await page.getByRole('button', { name: 'متابعة' }).click();
    await page.getByRole('button', { name: 'لا يصلني هاتفي؟ استعمل رمز استرداد' }).click();
    await page.getByLabel('رمز الاسترداد').fill(recovery.toLowerCase());
    await page.getByRole('button', { name: 'تحقق' }).click();

    await expect(page).toHaveURL('/');
    // Support holds no platform users (cosmetic; the API refuses too).
    const nav = page.getByRole('navigation', { name: 'أقسام لوحة المنصة' });
    await expect(nav.getByRole('link', { name: 'مستخدمو المنصة' })).toHaveCount(0);
    await nav.getByRole('link', { name: 'حسابي' }).click();
    await expect(page.getByText('بقي 9 من 10 رموز.')).toBeVisible();
  });

  test('sets up a new user: password, authenticator, recovery codes once', async ({
    page,
  }, testInfo) => {
    const api = await mockConsoleApi(page);
    const pending = api.addPendingUser({
      phone: '+963900000203',
      name: 'مستخدم جديد',
      role: 'support',
    });
    await page.goto('/sign-in');
    await page
      .getByRole('button', { name: 'أول مرة أو أعاد المدير ضبط حسابك؟ ادخل برمز الإعداد' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الدخول لأول مرة');
    await page.getByLabel('رقم الهاتف').fill('0900000203');
    await page.getByLabel('رمز الإعداد').fill('ABCD');
    await page.getByRole('button', { name: 'متابعة' }).click();
    await expect(page.getByText('اكتب رمز الإعداد كما سلّمك إياه المدير.')).toBeVisible();
    await page.getByLabel('رمز الإعداد').fill(pending.setupCode as string);
    await page.getByRole('button', { name: 'متابعة' }).click();

    // Stage 1: the password, with the rules as hints.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('إعداد حسابك');
    await page.getByLabel('كلمة المرور الجديدة').fill('password123');
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.getByText('كلمة المرور لا تستوفي الشروط.')).toBeVisible();
    await screenshot(page, testInfo, 'setup-password');
    await page.getByLabel('كلمة المرور الجديدة').fill('synthetic-new-user-pass');
    await page.getByRole('button', { name: 'التالي' }).click();

    // Stage 2: the QR code and the key, confirmed with a code.
    await expect(
      page.getByRole('img', { name: 'رمز QR لإضافة حساب لوحة المنصة إلى تطبيق المصادقة' }),
    ).toBeVisible();
    await expect(page.getByText(totpSecret.match(/.{4}/g)?.join(' ') as string)).toBeVisible();
    await screenshot(page, testInfo, 'setup-authenticator');
    await typeCode(page, 'الرمز الذي يعرضه التطبيق الآن', '111111');
    await expect(page.getByText('رمز التحقق غير صحيح.')).toBeVisible();
    await typeCode(page, 'الرمز الذي يعرضه التطبيق الآن', totpCode);

    // Stage 3: the ten recovery codes, shown this once.
    const codes = page.getByRole('list', { name: 'رموز الاسترداد العشرة' });
    await expect(codes.getByRole('listitem')).toHaveCount(10);
    const shown = await codes.getByRole('listitem').allTextContents();
    expect(shown).toEqual(api.users.at(-1)?.recoveryCodes.map((item) => item.code));
    const enter = page.getByRole('button', { name: 'الدخول إلى اللوحة' });
    await expect(enter).toBeDisabled();
    await screenshot(page, testInfo, 'setup-recovery-codes');
    await page.getByRole('checkbox').click();
    await enter.click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('banner')).toContainText('مستخدم جديد');
    expect(api.users.at(-1)?.status).toBe('active');
  });

  test('a step left too long starts the sign-in again', async ({ page }) => {
    const api = await mockConsoleApi(page);
    await page.goto('/sign-in');
    await page.getByLabel('رقم الهاتف').fill(adminPhone);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(adminPassword);
    await page.getByRole('button', { name: 'متابعة' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('رمز التحقق');
    // The ticket expires on the server (10 minutes).
    await page.route('**/api/console/auth/totp', (route) =>
      route.fulfill({ status: 401, json: { code: 'TICKET_INVALID', message: 'x' } }),
    );
    await typeCode(page, 'رمز تطبيق المصادقة', totpCode);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الدخول إلى لوحة المنصة');
    await expect(
      page.getByRole('status').filter({ hasText: 'انتهت مهلة هذه الخطوة' }),
    ).toBeVisible();
    expect(api.session).toBeNull();
  });

  test('an ended session opens the sign-in and forgets the data', async ({ page }, testInfo) => {
    const api = await mockConsoleApi(page, { signedIn: 'admin' });
    await page.goto('/');
    await expect(page.getByRole('banner')).toContainText('مدير تجريبي');

    api.endSession();
    await page.getByRole('link', { name: 'مستخدمو المنصة' }).click();
    await expect(page).toHaveURL('/sign-in?ended=true');
    await expect(page.getByRole('status').filter({ hasText: 'انتهت جلستك' })).toBeVisible();
    await expect(page.getByRole('banner')).not.toContainText('مدير تجريبي');
    await screenshot(page, testInfo, 'session-ended');

    // Without a session every screen sends to the sign-in.
    await page.goto('/me');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('signs out', async ({ page }) => {
    const api = await mockConsoleApi(page, { signedIn: 'admin' });
    await page.goto('/');
    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByText('سجّلت الخروج.')).toBeVisible();
    expect(api.session).toBeNull();
    // The cookie is gone with the session: the console's screens send to the sign-in again.
    await page.goto('/');
    await expect(page).toHaveURL('/sign-in');
  });
});
