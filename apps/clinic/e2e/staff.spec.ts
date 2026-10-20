import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { facility, logoPng, type MockApi, mockApi, tenant } from './mock-api.js';
import {
  type Account,
  addMember,
  type Membership,
  receptionistPassword,
  receptionistPhone,
  signInBeforehand,
} from './mock-identity.js';
import { specialties } from './mock-staff.js';
import { closeNav, mainNav } from './nav.js';
import { screenshot } from './screenshot.js';

// Staff, doctor profiles, devices and security (S02 screens 6–10) against the mocked API.

const doctorPhone = '+963900000103';

function membershipOf(account: Account): Membership {
  return account.memberships[0] as Membership;
}

function addReceptionist(api: MockApi): Account {
  return addMember(api.identity, {
    tenantId: api.tenant.id,
    phone: receptionistPhone,
    name: 'موظف استقبال',
    roles: ['reception'],
    password: receptionistPassword,
  });
}

/** An active doctor with a profile, as an accepted invitation leaves them. */
function addDoctor(api: MockApi): Account {
  const doctor = addMember(api.identity, {
    tenantId: api.tenant.id,
    phone: doctorPhone,
    name: 'سامر حداد',
    roles: ['doctor'],
    password: 'synthetic-doctor-pass',
  });
  const at = '2026-10-17T12:00:00.000Z';
  api.identity.practitioners.push({
    id: randomUUID(),
    membershipId: membershipOf(doctor).id,
    displayNameAr: 'د. سامر حداد',
    displayNameLatin: null,
    gender: 'male',
    specialtyIds: [specialties[0]?.id as string],
    syndicateNumber: null,
    hasPhoto: false,
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
  });
  return doctor;
}

const checkbox = (page: Page, name: string) => page.getByRole('checkbox', { name, exact: true });

test.describe('staff', () => {
  test('invites a receptionist and a doctor with the permission editor (step 3)', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    await page.goto('/settings/staff');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الموظفون');
    await expect(page.getByRole('row')).toHaveCount(2);
    await expect(page.getByRole('row').nth(1)).toContainText('مالك تجريبي (أنت)');
    // A single-branch clinic never sees the word "branch" (S01 rule 9).
    await expect(page.getByRole('main').getByText(/فرع|الفروع/)).toHaveCount(0);

    await page.getByRole('link', { name: 'دعوة موظف' }).click();
    await expect(page).toHaveURL('/settings/staff/new');
    await page.getByLabel('رقم الجوال').fill('0900 000 102');
    await page.getByLabel('الاسم', { exact: true }).fill('موظف استقبال');
    await checkbox(page, 'استقبال').click();

    // The editor: presets "from role", what the roles' limits keep out disabled and explained.
    const editor = page.getByRole('group', { name: 'الصلاحيات' });
    const item = (name: string) => editor.getByRole('listitem').filter({ hasText: name });
    await expect(checkbox(page, 'الاطلاع على بيانات العيادة')).toBeChecked();
    await expect(item('الاطلاع على بيانات العيادة')).toContainText('من الدور');
    await expect(checkbox(page, 'إدارة الموظفين والصلاحيات')).toBeDisabled();
    await expect(item('إدارة الموظفين والصلاحيات')).toContainText('لا تُمنح إلا لدور: مالك');
    await expect(item('تعديل ملفه المهني')).toContainText('لا تُمنح إلا لدور: طبيب');
    await checkbox(page, 'إدارة حواسيب العيادة').click();
    await expect(item('إدارة حواسيب العيادة')).toContainText('مضافة');
    await checkbox(page, 'الاطلاع على الأطباء وتخصصاتهم').click();
    await expect(item('الاطلاع على الأطباء وتخصصاتهم')).toContainText('مُزالة');
    await screenshot(page, testInfo, 'staff-invite');

    await page.getByRole('button', { name: 'إرسال الدعوة' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('موظف استقبال');
    await expect(page.getByRole('main')).toContainText('مدعو');
    await expect(page.getByRole('main')).toContainText('رسالة الدعوة: بانتظار الإرسال');
    const receptionist = api.identity.accounts.find((item) => item.phone === receptionistPhone);
    expect(receptionist && membershipOf(receptionist)).toMatchObject({
      roles: ['reception'],
      granted: ['devices.manage'],
      revoked: ['practitioners.read'],
    });

    // A doctor: the profile comes with the role, the name prefilled.
    await page.getByRole('link', { name: 'الموظفون' }).first().click();
    await page.getByRole('link', { name: 'دعوة موظف' }).click();
    await page.getByLabel('رقم الجوال').fill('0900000103');
    await page.getByLabel('الاسم', { exact: true }).fill('سامر حداد');
    await checkbox(page, 'طبيب').click();
    await expect(page.getByLabel('الاسم المهني بالعربية')).toHaveValue('د. سامر حداد');
    await expect(checkbox(page, 'تعديل ملفه المهني')).toBeChecked();
    await page.getByRole('button', { name: 'إرسال الدعوة' }).click();
    await expect(page.getByText('اختر الجنس.')).toBeVisible();
    await expect(page.getByText('اختر من تخصص إلى ثلاثة تخصصات.')).toBeVisible();
    await page.getByRole('button', { name: 'ذكر' }).click();
    const picker = page.getByRole('combobox', { name: 'التخصصات' });
    await picker.fill('باطنية');
    await page.getByRole('option', { name: 'باطنية' }).click();
    await picker.fill('قلبية');
    await page.getByRole('option', { name: 'قلبية' }).click();
    await expect(page.getByText('التخصص الرئيسي: باطنية')).toBeVisible();
    await screenshot(page, testInfo, 'staff-invite-doctor');
    await page.getByRole('button', { name: 'إرسال الدعوة' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('سامر حداد');

    // The photo, on the doctor profile.
    await page.getByRole('link', { name: 'فتح الملف المهني' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الملف المهني: سامر حداد');
    await expect(page.getByText('لا توجد صورة: يظهر الحرف الأول من الاسم.')).toBeVisible();
    await page.getByLabel('رفع صورة').setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: logoPng,
    });
    await expect(page.getByRole('img', { name: 'صورة الطبيب' })).toBeVisible();
    await expect(page.getByLabel('الاسم المهني بالعربية')).toHaveValue('د. سامر حداد');
    const profile = api.identity.practitioners[0];
    expect(profile).toMatchObject({
      gender: 'male',
      specialtyIds: [specialties[1]?.id, specialties[3]?.id],
      hasPhoto: true,
    });
    await screenshot(page, testInfo, 'staff-doctor-profile');

    // Both wait for their first sign-in.
    await (await mainNav(page)).getByRole('link', { name: 'الموظفون' }).click();
    await page.getByRole('button', { name: 'المدعوون' }).click();
    await expect(page).toHaveURL('/settings/staff?status=invited');
    await expect(page.getByRole('row')).toHaveCount(3);
    await screenshot(page, testInfo, 'staff-list');

    // Inviting a member's phone again names the member instead.
    await page.getByRole('link', { name: 'دعوة موظف' }).click();
    await page.getByLabel('رقم الجوال').fill('0900000102');
    await page.getByLabel('الاسم', { exact: true }).fill('موظف آخر');
    await checkbox(page, 'ممرض').click();
    await page.getByRole('button', { name: 'إرسال الدعوة' }).click();
    await expect(page.getByRole('alert')).toContainText('صاحب هذا الرقم موظف في العيادة.');
    await page.getByRole('button', { name: 'فتح صفحة موظف استقبال' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('موظف استقبال');
  });

  test('resends, cancels, deactivates, reactivates and authorizes a password reset', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    const receptionist = addReceptionist(api);
    const invited = addMember(api.identity, {
      tenantId: api.tenant.id,
      phone: '+963900000104',
      name: 'ممرض مدعو',
      roles: ['nurse'],
      password: null,
    });

    // The last owner stays (rule 5).
    await page.goto(`/settings/staff/${membershipOf(api.owner).id}`);
    // An owner always keeps the read permissions (rule 6), and never takes away on their own
    // record what their roles give.
    await expect(checkbox(page, 'الاطلاع على بيانات العيادة')).toBeDisabled();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'الاطلاع على الموظفين' }),
    ).toContainText('تبقى مع المالك دائمًا');
    await expect(checkbox(page, 'إدارة حواسيب العيادة')).toBeDisabled();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'إدارة حواسيب العيادة' }),
    ).toContainText('لا يمكنك إزالتها من نفسك');
    await page.getByRole('button', { name: 'إيقاف الموظف' }).click();
    // Toasts are dialogs too: the form's dialog by its title.
    const dialog = page.getByRole('dialog', { name: /^إيقاف / });
    await dialog.getByLabel('السبب').fill('اختبار');
    await dialog.getByRole('button', { name: 'إيقاف' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('يجب أن يبقى للعيادة مالك واحد على الأقل.');
    await dialog.getByRole('button', { name: 'رجوع' }).click();

    // An active member: deactivated with a reason, then reactivated.
    await page.goto(`/settings/staff/${membershipOf(receptionist).id}`);
    await expect(page.getByRole('main')).toContainText('يعمل في العيادة منذ');
    await page.getByRole('button', { name: 'إيقاف الموظف' }).click();
    await dialog.getByRole('button', { name: 'إيقاف' }).click();
    await expect(dialog.getByText('اكتب سببًا من حرفين إلى 500 حرف.')).toBeVisible();
    await dialog.getByLabel('السبب').fill('انتهى العقد');
    await screenshot(page, testInfo, 'staff-deactivate');
    await dialog.getByRole('button', { name: 'إيقاف' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('main')).toContainText('موقوف منذ');
    expect(membershipOf(receptionist).status).toBe('deactivated');
    await page.getByRole('button', { name: 'إعادة التفعيل' }).click();
    await expect(page.getByRole('button', { name: 'إيقاف الموظف' })).toBeVisible();
    expect(membershipOf(receptionist).status).toBe('active');

    await page.getByRole('button', { name: 'السماح بتعيين كلمة مرور جديدة' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'السماح' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'يستطيع تعيين كلمة مرور جديدة حتى' }),
    ).toBeVisible();
    await screenshot(page, testInfo, 'staff-member');

    // Another owner changed this member meanwhile: the save reloads the member and says so.
    api.editBehind(() => {
      Object.assign(membershipOf(receptionist), {
        roles: ['reception', 'accountant'],
        updatedAt: '2026-10-19T09:00:00.000Z',
      });
    });
    await checkbox(page, 'ممرض').click();
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByRole('alert')).toContainText('غيّر شخص آخر هذه البيانات أثناء تعديلك');
    await expect(checkbox(page, 'محاسب')).toBeChecked();
    await expect(checkbox(page, 'ممرض')).not.toBeChecked();
    await checkbox(page, 'ممرض').click();
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('حُفظت التغييرات.')).toBeVisible();
    expect(membershipOf(receptionist).roles).toEqual(['reception', 'nurse', 'accountant']);

    // An invitation: resent at most every 10 minutes, then cancelled.
    await page.goto(`/settings/staff/${membershipOf(invited).id}`);
    await page.getByRole('button', { name: 'إعادة إرسال الدعوة' }).click();
    await expect(page.getByRole('alert')).toHaveText('محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.');
    await page.getByRole('button', { name: 'إلغاء الدعوة' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'إلغاء الدعوة' }).click();
    await expect(page).toHaveURL('/settings/staff');
    await expect(page.getByRole('main')).not.toContainText('ممرض مدعو');
    expect(membershipOf(invited).archivedAt).not.toBeNull();
  });

  test('a receptionist cannot open staff or device settings (step 4)', async ({ page }) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
      signedIn: false,
    });
    const receptionist = addReceptionist(api);
    await signInBeforehand(api.identity, api.device, receptionist, api.tenant.id);
    await page.goto('/');
    const nav = await mainNav(page);
    await expect(nav).toContainText('بيانات العيادة');
    await expect(nav).not.toContainText('الموظفون');
    await expect(nav).not.toContainText('الحواسيب');
    await expect(nav).not.toContainText('الأمان');
    await closeNav(page);
    for (const path of ['/settings/staff', '/settings/devices']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'ليست لديك صلاحية لهذه الشاشة',
      );
    }
    await page.goto('/settings/security');
    await expect(page.getByLabel('القفل التلقائي بعد (دقيقة)')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'حفظ' })).toHaveCount(0);
  });

  test('gives the doctor role back with the previous profile for review (edge case 11)', async ({
    page,
  }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    const doctor = addDoctor(api);
    const receptionist = addReceptionist(api);
    const [stored] = api.identity.practitioners;
    Object.assign(stored ?? {}, {
      specialtyIds: [specialties[2]?.id, specialties[0]?.id],
      syndicateNumber: 'SY-1020',
    });

    // The photo goes with the profile.
    await page.goto(`/settings/staff/${membershipOf(doctor).id}`);
    await page.getByRole('link', { name: 'فتح الملف المهني' }).click();
    await page.getByLabel('رفع صورة').setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: logoPng,
    });
    await expect(page.getByRole('img', { name: 'صورة الطبيب' })).toBeVisible();
    await page.getByRole('link', { name: 'سامر حداد' }).click();

    // The role goes: its profile is archived.
    await checkbox(page, 'طبيب').click();
    await checkbox(page, 'استقبال').click();
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('حُفظت التغييرات.')).toBeVisible();
    expect(stored?.archivedAt).not.toBeNull();
    await expect(page.getByRole('link', { name: 'فتح الملف المهني' })).toHaveCount(0);

    // It comes back: the previous profile, prefilled, with its photo.
    await checkbox(page, 'طبيب').click();
    await expect(
      page.getByText('هذا ملفه المهني السابق: راجعه وعدّل ما يلزم، ويعود مع دور الطبيب عند الحفظ.'),
    ).toBeVisible();
    await expect(page.getByLabel('الاسم المهني بالعربية')).toHaveValue('د. سامر حداد');
    await expect(page.getByRole('button', { name: 'ذكر' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('التخصص الرئيسي: طب الأطفال')).toBeVisible();
    await expect(page.getByLabel('رقم النقابة (اختياري)')).toHaveValue('SY-1020');
    await expect(page.getByRole('img', { name: 'صورة الطبيب' })).toBeVisible();
    await screenshot(page, testInfo, 'staff-doctor-restore');
    await page.getByLabel('رقم النقابة (اختياري)').fill('SY-1021');
    await page.getByRole('button', { name: 'حفظ' }).click();
    // The first save's toast may still show.
    await expect(page.getByText('حُفظت التغييرات.').last()).toBeVisible();
    expect(api.identity.practitioners).toHaveLength(1);
    expect(stored).toMatchObject({
      archivedAt: null,
      syndicateNumber: 'SY-1021',
      specialtyIds: [specialties[2]?.id, specialties[0]?.id],
      hasPhoto: true,
    });
    await expect(page.getByRole('link', { name: 'فتح الملف المهني' })).toBeVisible();

    // A member who never had a profile gets a new one, the name prefilled.
    await page.goto(`/settings/staff/${membershipOf(receptionist).id}`);
    await checkbox(page, 'طبيب').click();
    await expect(page.getByText('أكمل الملف المهني للطبيب ليُحفظ دور الطبيب.')).toBeVisible();
    await expect(page.getByLabel('الاسم المهني بالعربية')).toHaveValue('د. موظف استقبال');
    await expect(page.getByLabel('رقم النقابة (اختياري)')).toHaveValue('');
    await expect(page.getByRole('img', { name: 'صورة الطبيب' })).toHaveCount(0);
  });

  test('a doctor edits their own profile', async ({ page }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
      signedIn: false,
    });
    const doctor = addDoctor(api);
    await signInBeforehand(api.identity, api.device, doctor, api.tenant.id);
    await page.goto('/me');
    await page.getByRole('link', { name: 'ملفي المهني' }).click();
    await expect(page).toHaveURL('/me/profile');
    await expect(page.getByLabel('الاسم المهني بالعربية')).toHaveValue('د. سامر حداد');
    await page.getByLabel('رقم النقابة (اختياري)').fill('12 34');
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('أرقام وأحرف لاتينية و - و / فقط، حتى 30 حرفًا.')).toBeVisible();
    await page.getByLabel('رقم النقابة (اختياري)').fill('ALP-1234');
    await page.getByLabel('الاسم المهني بالأحرف اللاتينية (اختياري)').fill('Dr. Samer Haddad');
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('حُفظت التغييرات.')).toBeVisible();
    expect(api.identity.practitioners[0]).toMatchObject({
      displayNameLatin: 'Dr. Samer Haddad',
      syndicateNumber: 'ALP-1234',
    });
    await screenshot(page, testInfo, 'doctor-own-profile');
  });
});

test.describe('devices', () => {
  test('renames, removes a member, revokes; a branch with a computer stays (step 9)', async ({
    page,
  }, testInfo) => {
    const main = facility({ name: 'فرع المركز' });
    const north = facility({ name: 'فرع الشمال' });
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [main, north],
    });
    const receptionist = addReceptionist(api);
    const other = {
      id: randomUUID(),
      tenantId: api.tenant.id,
      facilityId: north.id,
      name: 'حاسوب العيادة 2',
      publicKey: '',
      status: 'active' as const,
      wipedAt: null,
    };
    api.identity.devices.push(other);
    api.identity.enrollments.push({
      id: randomUUID(),
      deviceId: other.id,
      membershipId: membershipOf(receptionist).id,
      publicKey: '',
      lastConfirmedAt: '2026-10-18T08:00:00.000Z',
      revokedAt: null,
    });

    await page.goto('/settings/devices');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الحواسيب');
    const cards = page
      .getByRole('main')
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { level: 2 }) });
    await expect(cards).toHaveCount(2);
    const current = cards.filter({ has: page.getByText('هذا الحاسوب', { exact: true }) });
    await expect(current).toContainText('حاسوب الاستقبال');
    await expect(current).toContainText('الفرع: فرع المركز');
    await expect(current).toContainText('مالك تجريبي');
    const second = cards.filter({ hasText: 'حاسوب العيادة 2' });
    await expect(second).toContainText('الفرع: فرع الشمال');
    await expect(second).toContainText('موظف استقبال');
    await screenshot(page, testInfo, 'devices');

    // A dialog closed without saving opens again on the current name.
    const renameDialog = page.getByRole('dialog', { name: 'اسم الحاسوب' });
    await second.getByRole('button', { name: 'إعادة التسمية' }).click();
    await renameDialog.getByLabel('الاسم').fill('اسم لم يُحفظ');
    await renameDialog.getByRole('button', { name: 'رجوع' }).click();
    await expect(renameDialog).toBeHidden();
    await second.getByRole('button', { name: 'إعادة التسمية' }).click();
    await expect(renameDialog.getByLabel('الاسم')).toHaveValue('حاسوب العيادة 2');
    await renameDialog.getByLabel('الاسم').fill('حاسوب الطبيب');
    await page
      .getByRole('dialog', { name: 'اسم الحاسوب' })
      .getByRole('button', { name: 'حفظ' })
      .click();
    await expect(cards.filter({ hasText: 'حاسوب الطبيب' })).toHaveCount(1);

    const renamed = cards.filter({ hasText: 'حاسوب الطبيب' });
    await renamed.getByRole('button', { name: 'إزالة موظف استقبال' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'إزالة' }).click();
    await expect(renamed).toContainText('لا أحد مسجّل على هذا الحاسوب.');

    await renamed.getByRole('button', { name: 'إزالة الحاسوب' }).click();
    const dialog = page.getByRole('dialog', { name: /^إزالة «/ });
    await expect(dialog).toContainText('يُحفظ عند اتصاله للمراجعة');
    await dialog.getByRole('button', { name: 'إزالة الحاسوب' }).click();
    await expect(dialog).toContainText('اختر السبب.');
    await dialog.getByRole('button', { name: 'فُقد أو سُرق' }).click();
    await dialog.getByLabel('التفاصيل').fill('نُقل إلى مكان غير معروف');
    await screenshot(page, testInfo, 'devices-revoke');
    await dialog.getByRole('button', { name: 'إزالة الحاسوب' }).click();
    await expect(dialog).toBeHidden();
    await expect(cards).toHaveCount(1);
    expect(other.status).toBe('revoked');
    await page.getByRole('button', { name: 'المُزالة' }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('مُزال');

    // Rule 32: the branch of this computer cannot be archived.
    await page.goto('/settings/branches');
    const row = page.getByRole('row').filter({ hasText: 'فرع المركز' });
    await row.getByRole('button', { name: 'أرشفة' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'أرشفة' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'لا يمكن أرشفة فرع فيه حواسيب مسجّلة. أزل الحواسيب أولًا.',
    );
  });
});

test.describe('security', () => {
  test('sets the idle lock and the clinical read scope, saving only online', async ({
    page,
    context,
  }, testInfo) => {
    const api = await mockApi(page, {
      tenant: tenant({ status: 'active' }),
      facilities: [facility()],
    });
    await page.goto('/settings/security');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الأمان');
    const minutes = page.getByLabel('القفل التلقائي بعد (دقيقة)');
    await expect(minutes).toHaveValue('15');
    await expect(page.getByRole('button', { name: 'كل مرضى فروع الطبيب' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await minutes.fill('70');
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('أدخل عددًا صحيحًا من 5 إلى 60.')).toBeVisible();
    await minutes.fill('5');
    await page.getByRole('button', { name: 'مرضى الطبيب فقط' }).click();
    await expect(page.getByText('ولسجل مريض آخر يكتب سبب الدخول الطارئ')).toBeVisible();
    await page.getByRole('button', { name: 'حفظ' }).click();
    await expect(page.getByText('حُفظت التغييرات.')).toBeVisible();
    expect(api.tenant).toMatchObject({ idleLockMinutes: 5, clinicalReadScope: 'own_patients' });
    // This computer's lock follows at once.
    await expect
      .poll(
        async () =>
          (await api.device.installation.calls.view(null)).registrations[0]?.idleLockMinutes,
      )
      .toBe(5);
    await screenshot(page, testInfo, 'security');

    await page.waitForLoadState('networkidle');
    await context.setOffline(true);
    await minutes.fill('10');
    await expect(
      page.getByRole('status').filter({ hasText: 'لا يمكن الحفظ دون اتصال' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'حفظ' })).toBeDisabled();
    await screenshot(page, testInfo, 'security-offline');
    await context.setOffline(false);
  });
});
