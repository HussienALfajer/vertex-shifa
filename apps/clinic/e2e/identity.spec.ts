import { expect, type Page, type Route, test } from '@playwright/test';
import { facility, mockApi, syntheticId, tenant } from './mock-api.js';
import {
  addMember,
  otpCode,
  ownerPassword,
  receptionistPassword,
  receptionistPhone,
  seededPin,
  signInBeforehand,
} from './mock-identity.js';
import { lock, openUserMenu } from './nav.js';
import { screenshot } from './screenshot.js';
import { settled } from './settle.js';

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
    // The password is saved, then the clinics fail to load once: retried with the signed-in
    // ticket, never by setting the password again.
    let optionsFail = true;
    await page.route('**/api/auth/registration-options', (route) => {
      if (!optionsFail) return route.fallback();
      optionsFail = false;
      return route.abort('failed');
    });
    await page.getByRole('button', { name: 'حفظ ومتابعة' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'تعذّر جلب العيادات' })).toBeVisible();
    await screenshot(page, testInfo, 'registration-options-failed');
    await page.getByRole('button', { name: 'إعادة المحاولة' }).click();

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
    await lock(page);
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
    await lock(page);
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
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    await page.goto('/');
    await lock(page);
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

    // A renderer that only claims the sign-in happened re-enables nothing (F02).
    const [registration] = (await api.device.installation.calls.view(null)).registrations;
    const forged = await page.evaluate(
      `window.vertexShifaDevice.call('reenablePin', ${JSON.stringify({
        deviceId: registration?.deviceId,
        enrollmentId: registration?.members[0]?.enrollmentId,
      })})`,
    );
    expect(forged).toEqual({ ok: false, code: 'INVALID_INPUT' });

    await page.getByRole('button', { name: 'الدخول بكلمة المرور' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('إعادة تفعيل الرمز السري');
    await expect(page.getByLabel('رقم الهاتف')).toHaveValue('+963900000101');
    // A wrong password leaves the PIN disabled.
    await page.getByLabel('كلمة المرور', { exact: true }).fill('synthetic-wrong-pass');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(
      (await api.device.installation.calls.view(null)).registrations[0]?.members[0]?.pinDisabled,
    ).toBe(true);
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
    await lock(page);
    // The preview server stands in for the app's local files: the screen's code loads first, as
    // the built app always has it.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('عيادة الاختبار');
    // The lock screen's refresh on mount has answered: the connection drops after it.
    await settled(page);
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
    // The lock screen's refresh on mount has answered: the connection drops after it.
    await settled(page);
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

  test('locks a session whose 7-day window passes while it is open (rule 24)', async ({
    page,
    context,
  }) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^قائمة الحساب: / })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // 8 days pass with the app open: the main process locks the member and says so.
    api.device.setClockOffset(8 * DAY);
    await api.device.installation.checkWindow();
    await expect(page).toHaveURL(/\/lock/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('عيادة الاختبار');
    // Offline, the PIN no longer opens the app.
    // The lock screen's refresh on mount has answered: the connection drops after it.
    await settled(page);
    await context.setOffline(true);
    await expect(page.getByText('اتصل بالإنترنت للمتابعة')).toBeVisible();
    await expect(codeField(page, 'الرمز السري لـ مالك تجريبي').first()).toBeDisabled();
    await context.setOffline(false);
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
    await lock(page);
    await page.getByRole('button', { name: 'نسيت الرمز السري؟' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('نسيت الرمز السري');
    await page.getByLabel('كلمة المرور', { exact: true }).fill(ownerPassword);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await typeCode(page, 'الرمز السري', '741852');
    await typeCode(page, 'أعد كتابة الرمز السري', '741852');
    await page.getByRole('button', { name: 'حفظ الرمز السري' }).click();
    await expect(page).toHaveURL('/');

    await lock(page);
    await typeCode(page, 'الرمز السري لـ مالك تجريبي', seededPin);
    await expect(page.getByText('رمز سري خاطئ.', { exact: false })).toBeVisible();
    await typeCode(page, 'الرمز السري لـ مالك تجريبي', '741852');
    await expect(page).toHaveURL('/');
  });
});

test.describe('forgotten password (rule 16)', () => {
  const resetHint = 'لم يصلك الرمز؟ يصل فقط إن سمح لك مالك العيادة';

  /** From the lock screen, "Another user", then "Forgot your password?". */
  async function openReset(page: Page) {
    await lock(page);
    await expect(page).toHaveURL('/lock');
    await page.getByRole('button', { name: 'مستخدم آخر' }).click();
    await page.getByRole('link', { name: 'نسيت كلمة المرور؟' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('نسيت كلمة المرور');
  }

  async function requestCode(page: Page, phone: string) {
    await page.getByLabel('رقم الهاتف').fill(phone);
    await page.getByRole('button', { name: 'إرسال رمز التحقق' }).click();
    await expect(page.getByText(resetHint, { exact: false })).toBeVisible();
  }

  test('the owner authorizes a reset; the member sets a new password and signs in', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    const receptionist = addMember(api.identity, {
      tenantId: api.tenant.id,
      phone: receptionistPhone,
      name: 'موظف استقبال',
      roles: ['reception'],
      password: receptionistPassword,
    });

    // The owner authorizes the reset on the member's record (screen 7).
    await page.goto(`/settings/staff/${receptionist.memberships[0]?.id}`);
    await page.getByRole('button', { name: 'السماح بتعيين كلمة مرور جديدة' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'السماح' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'يستطيع تعيين كلمة مرور جديدة حتى' }),
    ).toBeVisible();
    expect(receptionist.resetUntil).toBeGreaterThan(Date.now());

    // The member, on this computer: "Forgot your password?" from the password sign-in.
    await openReset(page);
    await screenshot(page, testInfo, 'password-reset');
    await requestCode(page, '0900000102');
    await expect(page.getByRole('button', { name: /إعادة الإرسال بعد \d+ ثانية/ })).toBeDisabled();
    await typeCode(page, 'رمز التحقق', '000000');
    await expect(page.getByText('رمز التحقق غير صحيح.')).toBeVisible();
    await screenshot(page, testInfo, 'password-reset-otp');
    await typeCode(page, 'رمز التحقق', otpCode);

    // The new password alone (the name is the account's), with the strength rules.
    await expect(page.getByLabel('اسمك')).toHaveCount(0);
    await page.getByLabel('كلمة المرور الجديدة').fill('short');
    await page.getByRole('button', { name: 'حفظ ومتابعة' }).click();
    await expect(page.getByText('كلمة المرور لا تستوفي الشروط.')).toBeVisible();
    await page.getByLabel('كلمة المرور الجديدة').fill('synthetic-renewed-pass');
    await screenshot(page, testInfo, 'password-reset-new');
    await page.getByRole('button', { name: 'حفظ ومتابعة' }).click();

    // Then the PIN, as any sign-in on this computer, and the member is signed in.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('اختر رمزك السري');
    await typeCode(page, 'الرمز السري', '369258');
    await typeCode(page, 'أعد كتابة الرمز السري', '369258');
    await page.getByRole('button', { name: 'حفظ الرمز السري' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('banner')).toContainText('موظف استقبال');
    expect(receptionist.password).toBe('synthetic-renewed-pass');
    expect(receptionist.resetUntil).toBeUndefined();
  });

  test('answers the same without an authorization, and explains one that ended', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    const receptionist = addMember(api.identity, {
      tenantId: api.tenant.id,
      phone: receptionistPhone,
      name: 'موظف استقبال',
      roles: ['reception'],
      password: receptionistPassword,
    });
    await page.goto('/');

    // No authorization: the same answer and words, and no code verifies.
    await openReset(page);
    await requestCode(page, '0900000101');
    await typeCode(page, 'رمز التحقق', otpCode);
    await expect(page.getByText('رمز التحقق غير صحيح.')).toBeVisible();

    // The authorization ends before the code is checked.
    receptionist.resetUntil = Date.now() + 60_000;
    await page.getByRole('link', { name: 'شاشة القفل' }).click();
    await page.getByRole('button', { name: 'مستخدم آخر' }).click();
    await page.getByRole('link', { name: 'نسيت كلمة المرور؟' }).click();
    await requestCode(page, '0900000102');
    receptionist.resetUntil = Date.now() - 1;
    await typeCode(page, 'رمز التحقق', otpCode);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('انتهت صلاحية رمز التحقق.');
    await expect(alert).toContainText('اطلب من مالك العيادة السماح مرة أخرى');
    await screenshot(page, testInfo, 'password-reset-expired');

    // Authorized again, it ends after the code but before the new password is saved.
    receptionist.resetUntil = Date.now() + 60_000;
    await alert.getByRole('button', { name: 'البدء من جديد' }).click();
    await requestCode(page, '0900000102');
    await typeCode(page, 'رمز التحقق', otpCode);
    // The code is verified (the new password is asked) before the authorization ends.
    const newPassword = page.getByLabel('كلمة المرور الجديدة');
    await expect(newPassword).toBeVisible();
    receptionist.resetUntil = Date.now() - 1;
    await newPassword.fill('synthetic-renewed-pass');
    await page.getByRole('button', { name: 'حفظ ومتابعة' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'انتهى السماح بتعيين كلمة مرور جديدة. اطلب من مالك العيادة السماح مرة أخرى، ثم ابدأ من جديد.',
    );
    expect(receptionist.password).toBe(receptionistPassword);
  });

  test('a first sign-in of an account with a password points to the right path', async ({
    page,
  }) => {
    await mockApi(page, { tenant: tenant({ status: 'active' }), facilities: [facility()] });
    await page.goto('/');
    await lock(page);
    await page.getByRole('button', { name: 'مستخدم آخر' }).click();
    await page.getByRole('link', { name: 'سجّل الدخول برقم هاتفك' }).click();
    await page.getByLabel('رقم الهاتف').fill('0900000101');
    await page.getByRole('button', { name: 'إرسال رمز التحقق' }).click();
    // The answer of a phone with a password is a decoy: no code, and the words say what to do.
    await expect(
      page.getByText('إن كانت لديك كلمة مرور فسجّل الدخول بها', { exact: false }),
    ).toBeVisible();
    await typeCode(page, 'رمز التحقق', otpCode);
    await expect(page.getByText('رمز التحقق غير صحيح.')).toBeVisible();
  });
});

test.describe('several clinics on one computer', () => {
  test('an answer for one clinic’s owner never reaches a member of another clinic unlocked after them', async ({
    page,
  }) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    const north = {
      tenantId: syntheticId(),
      nameAr: 'عيادة الشمال',
      nameLatin: null,
      status: 'active' as const,
      idleLockMinutes: 15,
      branches: [{ id: syntheticId(), name: 'فرع الشمال' }],
    };
    api.identity.clinics.push(north);
    const northMember = addMember(api.identity, {
      tenantId: north.tenantId,
      phone: receptionistPhone,
      name: 'موظفة الشمال',
      roles: ['reception'],
      password: receptionistPassword,
    });
    await signInBeforehand(api.identity, api.device, northMember, north.tenantId, {
      locked: true,
    });
    // The first clinic's invitation reaches the server, and its answer is held.
    const held: Route[] = [];
    await page.route('**/api/staff/invitations', (route) => {
      held.push(route);
    });
    const visited: string[] = [];
    page.on('framenavigated', (frame) => visited.push(frame.url()));

    // The owner of the first clinic unlocks and invites someone.
    await page.goto('/lock');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('عيادة الشمال');
    await page.getByRole('combobox', { name: 'العيادة' }).click();
    await page.getByRole('option', { name: 'عيادة الاختبار' }).click();
    await typeCode(page, 'الرمز السري لـ مالك تجريبي', seededPin);
    await expect(page).toHaveURL('/');
    await page.goto('/settings/staff/new');
    await page.getByLabel('رقم الجوال').fill('0900 000 104');
    await page.getByLabel('الاسم', { exact: true }).fill('مدعوة العيادة الأولى');
    await page.getByRole('checkbox', { name: 'استقبال', exact: true }).click();
    await page.getByRole('button', { name: 'إرسال الدعوة' }).click();
    await expect.poll(() => held.length).toBe(1);

    // The owner locks, and the member of the other clinic unlocks before the answer comes.
    await lock(page);
    await expect(page).toHaveURL('/lock');
    await page.getByRole('combobox', { name: 'العيادة' }).click();
    await page.getByRole('option', { name: 'عيادة الشمال' }).click();
    await typeCode(page, 'الرمز السري لـ موظفة الشمال', seededPin);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('مرحبًا بك في فيرتكس شفا');

    // The first clinic's answer arrives now.
    const invited = {
      id: syntheticId(),
      name: 'مدعوة العيادة الأولى',
      phone: '+963900000104',
      status: 'invited',
      roles: ['reception'],
      branchScope: { allFacilities: true },
      adjustments: { granted: [], revoked: [] },
      permissions: [],
      practitionerId: null,
      invitationExpiresAt: '2026-10-25T09:00:00.000Z',
      invitationMessageStatus: 'pending',
      acceptedAt: null,
      deactivatedAt: null,
      createdAt: '2026-10-18T09:00:00.000Z',
      updatedAt: '2026-10-18T09:00:00.000Z',
      archivedAt: null,
    };
    await (held[0] as Route).fulfill({ status: 201, json: invited }).catch(() => {
      // The app cancelled the request when the owner locked: no answer reaches it.
    });

    // The member of the other clinic works on: nothing of the first clinic follows them.
    await openUserMenu(page);
    await page.getByRole('menuitem', { name: 'حسابي' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('حسابي');
    await expect(page.getByText('+963900000102')).toBeVisible();
    await expect(page.getByText('أُرسلت الدعوة.')).toHaveCount(0);
    await expect(page.getByText('مدعوة العيادة الأولى')).toHaveCount(0);
    expect(visited.filter((url) => url.includes(invited.id))).toEqual([]);
    await expect(page).toHaveURL('/me');
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

    await lock(page);
    await typeCode(page, 'الرمز السري لـ مالك تجريبي', '741852');
    await expect(page).toHaveURL('/');
  });
});
