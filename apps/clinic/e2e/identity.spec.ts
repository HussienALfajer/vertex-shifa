import { expect, type Page, test } from '@playwright/test';
import { facility, mockApi, syntheticId, tenant } from './mock-api.js';
import {
  addMember,
  otpCode,
  ownerPassword,
  receptionistPhone,
  seededPin,
  signInBeforehand,
} from './mock-identity.js';
import { openUserMenu } from './nav.js';
import { screenshot } from './screenshot.js';

// Sign-in, registration, PIN and lock screen (spec S02 screens 1–5 and 11) against the mocked API
// and the main process's identity in the test (`device-bridge.ts`). Synthetic data only.

const DAY = 24 * 60 * 60 * 1000;

/** The six slots of the code field labelled `label`. */
function codeField(page: Page, label: string) {
  return page
    .locator('[data-slot="field"]')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('input');
}

/** Types six digits into an empty code field. */
async function typeCode(page: Page, label: string, digits: string) {
  await codeField(page, label).first().click();
  await page.keyboard.type(digits);
}

async function clearCode(page: Page, label: string) {
  await codeField(page, label).last().focus();
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Backspace');
}

test.describe('signing in on this computer', () => {
  test('an invited owner signs in the first time, registers the computer and chooses a PIN', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, { tenant: tenant(), ownerInvited: true });
    await page.goto('/');
    await expect(page).toHaveURL('/welcome');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('مرحبًا بك في فيرتكس شفا');
    await screenshot(page, testInfo, 'welcome');

    await page.getByRole('button', { name: 'سجّل الدخول برقم هاتفك' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الدخول لأول مرة');
    await page.getByLabel('رقم الهاتف').fill('0900000101');
    await page.getByRole('button', { name: 'إرسال رمز التحقق' }).click();

    // A wrong code, then the right one; the code is submitted when its sixth digit is typed.
    await expect(page.getByText('رمز التحقق', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /إعادة الإرسال بعد \d+ ثانية/ })).toBeDisabled();
    await typeCode(page, 'رمز التحقق', '000000');
    await expect(page.getByText('رمز التحقق غير صحيح.')).toBeVisible();
    await screenshot(page, testInfo, 'sign-in-otp');
    await typeCode(page, 'رمز التحقق', otpCode);

    // First sign-in: the name the owner was invited with, and a password with its rules.
    await expect(page.getByLabel('اسمك')).toHaveValue('مالك تجريبي');
    await page.getByLabel('كلمة المرور الجديدة').fill('123');
    await page.getByRole('button', { name: 'حفظ ومتابعة' }).click();
    await expect(page.getByText('كلمة المرور لا تستوفي الشروط.')).toBeVisible();
    await page.getByLabel('كلمة المرور الجديدة').fill(ownerPassword);
    await screenshot(page, testInfo, 'first-sign-in');
    await page.getByRole('button', { name: 'حفظ ومتابعة' }).click();

    // One clinic, onboarding without a branch: only the computer's name is asked (rule 28).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('تسجيل هذا الحاسوب');
    await expect(page.getByText('العيادة: عيادة الاختبار')).toBeVisible();
    await expect(page.getByText('لم تُضف فروع العيادة بعد.', { exact: false })).toBeVisible();
    await page.getByLabel('اسم الحاسوب').fill('حاسوب الاستقبال');
    await screenshot(page, testInfo, 'register');
    await page.getByRole('button', { name: 'التالي: الرمز السري' }).click();

    // Rule 21: a trivial PIN and a mismatch are refused.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('اختر رمزك السري');
    await typeCode(page, 'الرمز السري', '123456');
    await typeCode(page, 'أعد كتابة الرمز السري', '123456');
    await page.getByRole('button', { name: 'تسجيل الحاسوب' }).click();
    await expect(page.getByText('هذا الرمز سهل التخمين.', { exact: false })).toBeVisible();
    await clearCode(page, 'الرمز السري');
    await typeCode(page, 'الرمز السري', '258147');
    await page.getByRole('button', { name: 'تسجيل الحاسوب' }).click();
    await expect(page.getByText('الرمزان غير متطابقين.')).toBeVisible();
    await clearCode(page, 'أعد كتابة الرمز السري');
    await typeCode(page, 'أعد كتابة الرمز السري', '258147');
    await screenshot(page, testInfo, 'pin-new');
    await page.getByRole('button', { name: 'تسجيل الحاسوب' }).click();

    // Registered and signed in: the onboarding wizard follows (S01).
    await expect(page).toHaveURL('/setup');
    await expect(page.getByRole('banner')).toContainText('مالك تجريبي');
    expect(api.identity.devices).toMatchObject([
      { tenantId: api.tenant.id, facilityId: null, name: 'حاسوب الاستقبال', status: 'active' },
    ]);
    const view = await api.device.installation.calls.view(null);
    expect(view.registrations).toMatchObject([
      { clinicName: 'عيادة الاختبار', members: [{ name: 'مالك تجريبي', roles: ['owner'] }] },
    ]);
  });

  test('an owner registers with password and OTP, choosing the branch', async ({
    page,
  }, testInfo) => {
    const main = facility({ name: 'الفرع الرئيسي' });
    const north = facility({ name: 'فرع الشمال' });
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [main, north],
      signedIn: false,
    });
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'تسجيل هذا الحاسوب' }).click();
    await page.getByLabel('رقم الهاتف').fill('+963 900 000 101');
    await page.getByLabel('كلمة المرور', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page.getByRole('alert')).toHaveText('رقم الهاتف أو كلمة المرور غير صحيحة.');
    await page.getByLabel('كلمة المرور', { exact: true }).fill(ownerPassword);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await typeCode(page, 'رمز التحقق', otpCode);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('تسجيل هذا الحاسوب');
    await page.getByLabel('اسم الحاسوب').fill('حاسوب الطبيب');
    await page.getByRole('button', { name: 'التالي: الرمز السري' }).click();
    await expect(page.getByText('اختر الفرع.')).toBeVisible();
    await page.getByRole('combobox', { name: 'الفرع' }).click();
    await page.getByRole('option', { name: 'فرع الشمال' }).click();
    await screenshot(page, testInfo, 'register-branch');
    await page.getByRole('button', { name: 'التالي: الرمز السري' }).click();
    await typeCode(page, 'الرمز السري', '258147');
    await typeCode(page, 'أعد كتابة الرمز السري', '258147');
    await page.getByRole('button', { name: 'تسجيل الحاسوب' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('مرحبًا بك في فيرتكس شفا');
    expect(api.identity.devices).toMatchObject([{ facilityId: north.id, name: 'حاسوب الطبيب' }]);
  });

  test('another user signs in the first time on a registered computer', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    addMember(api.identity, {
      tenantId: api.tenant.id,
      phone: receptionistPhone,
      name: 'موظف استقبال',
      roles: ['reception'],
      password: null,
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'قفل' }).click();
    await expect(page).toHaveURL('/lock');
    await page.getByRole('button', { name: 'مستخدم آخر' }).click();
    await page.getByRole('link', { name: 'سجّل الدخول برقم هاتفك' }).click();
    await page.getByLabel('رقم الهاتف').fill('0900000102');
    await page.getByRole('button', { name: 'إرسال رمز التحقق' }).click();
    await typeCode(page, 'رمز التحقق', otpCode);
    await expect(page.getByLabel('اسمك')).toHaveValue('موظف استقبال');
    await page.getByLabel('كلمة المرور الجديدة').fill('synthetic-reception-pass');
    await page.getByRole('button', { name: 'حفظ ومتابعة' }).click();
    await typeCode(page, 'الرمز السري', '369258');
    await typeCode(page, 'أعد كتابة الرمز السري', '369258');
    await page.getByRole('button', { name: 'حفظ الرمز السري' }).click();

    // The receptionist works here; the clinic's setup is the owner's (read only).
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('banner')).toContainText('موظف استقبال');
    await page.goto('/settings/clinic');
    await expect(page.getByLabel('اسم العيادة بالعربية')).toBeDisabled();

    // Both members are on the lock screen now.
    await page.getByRole('button', { name: 'قفل' }).click();
    const members = page.getByRole('list', { name: 'المستخدمون على هذا الحاسوب' });
    await expect(members.getByRole('button')).toHaveCount(2);
    await expect(members).toContainText('مالك تجريبي');
    await expect(members).toContainText('موظف استقبال');
    await expect(members).toContainText('استقبال');
    await screenshot(page, testInfo, 'lock-members');
  });
});

test.describe('lock screen', () => {
  test('locks from the member menu on the narrowest window', async ({ page }, testInfo) => {
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities: [facility()] });
    // 360 px is the desktop window's minimum width (electron/main.ts): the lock button gives its
    // room to the brand, and the lock waits in the member menu.
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('مرحبًا بك في فيرتكس شفا');
    await expect(page.getByRole('button', { name: 'قفل' })).toBeHidden();
    await openUserMenu(page);
    await screenshot(page, testInfo, 'member-menu-360');
    await page.getByRole('menuitem', { name: 'قفل' }).click();
    await expect(page).toHaveURL('/lock');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('عيادة الاختبار');
    await expect(codeField(page, 'الرمز السري لـ مالك تجريبي').first()).toBeVisible();
  });

  test('unlocks with the PIN, disables it after five wrong ones, re-enables it with the password', async ({
    page,
  }, testInfo) => {
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities: [facility()] });
    await page.goto('/');
    await page.getByRole('button', { name: 'قفل' }).click();
    await expect(page).toHaveURL('/lock');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('عيادة الاختبار');
    await screenshot(page, testInfo, 'lock');

    const pin = 'الرمز السري لـ مالك تجريبي';
    for (let remaining = 4; remaining >= 1; remaining -= 1) {
      await typeCode(page, pin, '000000');
      await expect(page.getByText(`رمز سري خاطئ. المحاولات المتبقية: ${remaining}.`)).toBeVisible();
    }
    await typeCode(page, pin, '000000');
    await expect(page.getByText('أُوقف الرمز السري بعد 5 محاولات خاطئة')).toBeVisible();
    await expect(page.getByText('الرمز السري موقوف')).toBeVisible();
    await screenshot(page, testInfo, 'lock-pin-disabled');

    await page.getByRole('button', { name: 'الدخول بكلمة المرور' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('إعادة تفعيل الرمز السري');
    await expect(page.getByLabel('رقم الهاتف')).toHaveValue('+963900000101');
    await page.getByLabel('كلمة المرور', { exact: true }).fill(ownerPassword);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page).toHaveURL(/\/lock/);
    await typeCode(page, pin, seededPin);
    await expect(page).toHaveURL('/');
  });

  test('works offline with the PIN; sign-in and settings wait for the connection', async ({
    page,
    context,
  }, testInfo) => {
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities: [facility()] });
    await page.goto('/');
    await page.getByRole('button', { name: 'قفل' }).click();
    // The preview server stands in for the app's local files: the screen's code loads first, as
    // the built app always has it.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('عيادة الاختبار');
    await context.setOffline(true);
    await expect(page.getByText('يعمل الرمز السري دون اتصال.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'مستخدم آخر' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'إضافة عيادة إلى هذا الحاسوب' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'نسيت الرمز السري؟' })).toBeDisabled();
    await screenshot(page, testInfo, 'lock-offline');

    await typeCode(page, 'الرمز السري لـ مالك تجريبي', seededPin);
    await expect(page).toHaveURL('/');
    await expect(page.getByText('لا يوجد اتصال بالإنترنت')).toBeVisible();
    await context.setOffline(false);
  });

  test('needs the connection once the 7-day window has passed (rule 24)', async ({
    page,
    context,
  }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    await api.device.installation.calls.lock(null);
    api.device.setClockOffset(8 * DAY);
    await page.goto('/lock');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('عيادة الاختبار');
    await context.setOffline(true);
    await expect(page.getByText('يحتاج إلى اتصال')).toBeVisible();
    await expect(page.getByText('اتصل بالإنترنت للمتابعة')).toBeVisible();
    await expect(codeField(page, 'الرمز السري لـ مالك تجريبي').first()).toBeDisabled();
    await screenshot(page, testInfo, 'lock-window-expired');

    // Online, the PIN opens a session, which confirms the enrollment again.
    await context.setOffline(false);
    await typeCode(page, 'الرمز السري لـ مالك تجريبي', seededPin);
    await expect(page).toHaveURL('/');
  });

  test('warns when the clock is set back, without extending the window (rule 24)', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    await api.device.installation.calls.lock(null);
    api.device.setClockOffset(2 * DAY);
    await page.goto('/lock');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('عيادة الاختبار');
    await expect(page.getByText('ساعة الحاسوب متأخرة')).toHaveCount(0);
    api.device.setClockOffset(0);
    await page.reload();
    await expect(page.getByText('ساعة الحاسوب متأخرة')).toBeVisible();
    await screenshot(page, testInfo, 'lock-clock');
  });

  test('wipes a clinic that revoked this computer, and only that clinic (rule 29)', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    const [first] = api.identity.devices;
    const north = {
      tenantId: syntheticId(),
      nameAr: 'عيادة الشمال',
      nameLatin: null,
      status: 'active' as const,
      idleLockMinutes: 15,
      branches: [{ id: syntheticId(), name: 'الفرع الرئيسي' }],
    };
    api.identity.clinics.push(north);
    addMember(api.identity, {
      tenantId: north.tenantId,
      phone: api.owner.phone,
      name: 'مالك تجريبي',
      roles: ['owner'],
      password: ownerPassword,
    });
    await signInBeforehand(api.identity, api.device, api.owner, north.tenantId, { locked: true });
    api.identity.revoke(first?.id ?? '');

    await page.goto('/lock');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('عيادة الشمال');
    await page.getByRole('combobox', { name: 'العيادة' }).click();
    await page.getByRole('option', { name: 'عيادة الاختبار' }).click();
    await expect(page.getByText('أُزيل هذا الحاسوب من عيادة الاختبار')).toBeVisible();
    await expect(page.getByText('حُذفت بيانات هذه العيادة من هذا الحاسوب.')).toBeVisible();
    await screenshot(page, testInfo, 'lock-wiped');
    expect(api.identity.devices.find((item) => item.id === first?.id)?.wipedAt).not.toBeNull();

    // The other clinic is untouched.
    const view = await api.device.installation.calls.view(null);
    expect(view.registrations.find((item) => item.tenantId === north.tenantId)).toMatchObject({
      status: 'active',
      members: [{ name: 'مالك تجريبي' }],
    });
    await page.getByRole('button', { name: 'حسنًا' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('عيادة الشمال');
    await expect(page.getByRole('combobox', { name: 'العيادة' })).toHaveCount(0);
    await typeCode(page, 'الرمز السري لـ مالك تجريبي', seededPin);
    await expect(page).toHaveURL('/');
  });

  test('locks after the idle minutes (rule 25)', async ({ page }) => {
    await page.clock.install();
    await mockApi(page, {
      tenant: tenant({ status: 'active', idleLockMinutes: 5 }),
      facilities: [facility()],
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('مرحبًا بك في فيرتكس شفا');
    await page.clock.fastForward('04:00');
    await expect(page).toHaveURL('/');
    await page.clock.fastForward('01:01');
    await expect(page).toHaveURL('/lock');
  });

  test('replaces a forgotten PIN after a password sign-in (rule 22)', async ({ page }) => {
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities: [facility()] });
    await page.goto('/');
    await page.getByRole('button', { name: 'قفل' }).click();
    await page.getByRole('button', { name: 'نسيت الرمز السري؟' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('نسيت الرمز السري');
    await page.getByLabel('كلمة المرور', { exact: true }).fill(ownerPassword);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await typeCode(page, 'الرمز السري', '741852');
    await typeCode(page, 'أعد كتابة الرمز السري', '741852');
    await page.getByRole('button', { name: 'حفظ الرمز السري' }).click();
    await expect(page).toHaveURL('/');

    await page.getByRole('button', { name: 'قفل' }).click();
    await typeCode(page, 'الرمز السري لـ مالك تجريبي', seededPin);
    await expect(page.getByText('رمز سري خاطئ.', { exact: false })).toBeVisible();
    await typeCode(page, 'الرمز السري لـ مالك تجريبي', '741852');
    await expect(page).toHaveURL('/');
  });
});

test.describe('my account', () => {
  test('changes the password and the PIN on this computer', async ({ page }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    // An unlocked app never shows the lock screen: a step back to it lands home.
    await page.goto('/lock');
    await expect(page).toHaveURL('/');
    await openUserMenu(page);
    await expect(page.getByRole('menu')).toContainText('مالك تجريبي');
    await page.getByRole('menuitem', { name: 'حسابي' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('حسابي');
    await expect(page.getByText('+963900000101')).toBeVisible();
    await screenshot(page, testInfo, 'account');

    await page.getByLabel('كلمة المرور الحالية').fill('wrong-password');
    await page.getByLabel('كلمة المرور الجديدة').fill('another-synthetic-pass');
    await page.getByRole('button', { name: 'تغيير كلمة المرور' }).click();
    await expect(page.getByRole('alert')).toHaveText('رقم الهاتف أو كلمة المرور غير صحيحة.');
    await page.getByLabel('كلمة المرور الحالية').fill(ownerPassword);
    await page.getByRole('button', { name: 'تغيير كلمة المرور' }).click();
    await expect(page.getByText('تغيّرت كلمة المرور.')).toBeVisible();
    expect(api.owner.password).toBe('another-synthetic-pass');

    await typeCode(page, 'الرمز السري الحالي', '000000');
    await typeCode(page, 'الرمز السري الجديد', '741852');
    await typeCode(page, 'أعد كتابة الرمز السري', '741852');
    await page.getByRole('button', { name: 'تغيير الرمز السري' }).click();
    await expect(page.getByText('رمز سري خاطئ. المحاولات المتبقية: 4.')).toBeVisible();
    await typeCode(page, 'الرمز السري الحالي', seededPin);
    await page.getByRole('button', { name: 'تغيير الرمز السري' }).click();
    await expect(page.getByText('تغيّر الرمز السري.')).toBeVisible();

    await page.getByRole('button', { name: 'قفل' }).click();
    await typeCode(page, 'الرمز السري لـ مالك تجريبي', '741852');
    await expect(page).toHaveURL('/');
  });
});
