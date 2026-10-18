import type { AuditAction } from '@vertex-shifa/contracts';

/** The label of every audit action, for audit views (console, clinic). */
export const audit = {
  'tenant.created': 'إنشاء حساب العيادة',
  'tenant.status_changed': 'تغيير حالة حساب العيادة',
  'tenant.directory_listing_changed': 'تغيير الظهور في دليل تطبيق Vertex Shifa',
  'tenant.profile_updated': 'تعديل بيانات العيادة',
  'tenant.onboarding_completed': 'إكمال إعداد العيادة',
  'tenant_logo.replaced': 'تغيير شعار العيادة',
  'tenant_logo.archived': 'إزالة شعار العيادة',
  'facility.created': 'إضافة فرع',
  'facility.updated': 'تعديل إعدادات فرع',
  'facility.archived': 'أرشفة فرع',
  'facility.restored': 'استعادة فرع',
} satisfies Record<AuditAction, string>;
