/**
 * The WhatsApp texts Vertex sends from its platform numbers (spec S03, ADR 0012): transactional
 * only, never medical, never a phone or a person's name in an alert. Filled by the API, the worker
 * and the gateway at send time.
 */
export const messaging = {
  otp: 'رمز التحقق في فيرتكس شفا: {{code}}\nصالح لمدة 5 دقائق. لا تشاركه مع أحد، ففريق فيرتكس لا يطلبه منك أبداً.',
  invitation:
    'دعتك عيادة «{{clinicName}}» للانضمام إليها بصفة {{role}} على فيرتكس شفا. سجّل الدخول من حاسوب العيادة باستخدام رقمك هذا. لإيقاف رسائل الدعوات أرسل: إيقاف',
  optOutReply:
    'تم إيقاف رسائل الدعوات من فيرتكس شفا. ستصلك رموز التحقق فقط عندما تطلبها بنفسك. لإعادة الرسائل أرسل: تشغيل',
  optInReply: 'تمت إعادة رسائل فيرتكس شفا. لإيقافها أرسل: إيقاف',
  autoReply:
    'هذا رقم فيرتكس شفا لإرسال رموز التحقق والدعوات فقط، ولا تُقرأ الرسائل الواردة إليه. للمساعدة تواصل مع عيادتك.',
  alert: 'تنبيه فيرتكس شفا: رقم المنصة «{{label}}» {{event}}.',
  alertEvents: {
    needs_relink: 'يحتاج إعادة ربط',
    banned: 'محظور من واتساب',
    disconnected: 'منقطع منذ أكثر من 5 دقائق',
    send_failures: 'أُوقف تلقائياً بعد فشل الإرسال',
    none_healthy: 'لم يبقَ أي رقم يعمل — رموز التحقق متوقفة',
    recovered: 'عاد رقم واحد على الأقل للعمل',
  },
};
