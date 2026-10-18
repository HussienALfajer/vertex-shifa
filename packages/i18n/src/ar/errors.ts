import type { ErrorCode } from '@vertex-shifa/contracts';

/** The Arabic text of every error code front ends show (ADR 0020); the server's message is for logs. */
export const errors = {
  VALIDATION_FAILED: 'بعض البيانات غير صحيحة. راجعها ثم أعد المحاولة.',
  UNAUTHENTICATED: 'انتهت الجلسة. سجّل الدخول من جديد.',
  FORBIDDEN: 'ليست لديك صلاحية لهذه العملية.',
  NOT_ENTITLED: 'هذه الميزة غير مشمولة في اشتراك العيادة.',
  TENANT_SUSPENDED: 'حساب العيادة موقوف. يمكنك قراءة البيانات وتصديرها فقط.',
  TENANT_CLOSED: 'حساب العيادة مغلق. يمكنك قراءة البيانات وتصديرها فقط.',
  NOT_FOUND: 'العنصر المطلوب غير موجود.',
  CONFLICT: 'تعارضت هذه العملية مع تغيير آخر. حدّث البيانات ثم أعد المحاولة.',
  INVALID_STATUS_TRANSITION: 'لا يمكن نقل حساب العيادة إلى هذه الحالة.',
  LAST_ACTIVE_FACILITY: 'لا يمكن أرشفة آخر فرع مستخدم. أضف فرعًا آخر أولًا.',
  CURRENCY_MISMATCH: 'لا يمكن الجمع بين مبالغ بعملات مختلفة.',
  INVALID_AMOUNT: 'المبلغ غير صالح.',
  ONBOARDING_INCOMPLETE: 'لم تكتمل بيانات العيادة بعد. أكمل الخطوات الناقصة ثم أعد المحاولة.',
  FILE_REJECTED: 'تعذّر قبول الصورة. استخدم صورة PNG أو JPEG أو WebP لا يتجاوز حجمها 2 ميغابايت.',
  MAP_LINK_UNRECOGNIZED:
    'لم نتمكن من قراءة الموقع من هذا الرابط. حدّد الموقع على الخريطة أو الصق الإحداثيات.',
  RATE_LIMITED: 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',
  INTERNAL_ERROR: 'حدث خطأ في الخادم. أعد المحاولة لاحقًا.',
  SERVICE_UNAVAILABLE: 'الخدمة غير متاحة الآن. أعد المحاولة بعد قليل.',
} satisfies Record<ErrorCode, string>;
