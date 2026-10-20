# Glossary

One name per concept. Code, contracts and tables use the English term; the Arabic term is what users see. Add a row when a spec introduces a new concept.

| Arabic (UI) | English (code) | Meaning |
|---|---|---|
| المنصة | platform | Vertex Shifa as a whole |
| العميل / الجهة | tenant | The contracting customer (a doctor, a clinic group, later a lab or pharmacy) |
| الفرع / المنشأة | facility | A branch or site of a tenant; type `clinic` in V1 |
| القسم | unit | A department inside a facility (optional) |
| حالة العميل | tenant status | `onboarding` (قيد الإعداد), `active` (نشط), `suspended` (معلّق: قراءة وتصدير فقط), `closed` (مغلق) |
| معالج الإعداد | onboarding wizard | The owner's first-run steps that make a tenant active |
| هوية العيادة | clinic profile | A tenant's names and logo |
| المنطقة | area | A place in the address list: governorate (المحافظة) or city (المدينة) |
| أيام العمل | working days | The weekdays a branch opens |
| العملة الافتراضية | default currency | The currency a branch uses for new prices and invoices |
| صيغة الاسم على الشاشة | display name format | What the waiting-room display shows of a patient: ticket only, or first name and father's initial |
| الطبيب | practitioner | A health professional |
| دور الطبيب في الفرع | practitioner role | A practitioner working at a facility with a schedule |
| الموظف | staff member | A person with a role in a tenant |
| الحساب | account | One person's sign-in identity, by verified phone number, across clinics and the patient app |
| المالك | owner | A staff member with the owner role; a tenant always has at least one |
| الدور | role | A preset of permissions: owner, doctor, reception, nurse, accountant |
| تعديل الصلاحيات | permission adjustment | A permission added to or removed from one member on top of their roles' presets, within limits |
| نطاق الفروع | branch scope | The branches a member works in: all, or a list |
| الدعوة | invitation | A membership waiting for the invited person's first sign-in (7 days) |
| ملف الطبيب | practitioner profile | A doctor's professional name, gender, specialties, syndicate number and photo |
| الاختصاص | specialty | A medical specialty from the platform list |
| نطاق قراءة الملفات | clinical read scope | Which patients' records a doctor reads: all of their branches, or their own patients |
| الفتح الطارئ | break-glass | Opening a record outside one's scope with a stated reason, flagged in the audit |
| موظف Vertex | platform user | A Vertex staff account in the console: admin or support |
| رموز الاسترداد | recovery codes | Single-use codes that replace a console TOTP code once |
| الصلاحية | permission | A right granted through a role |
| الشخص | person | A human being at platform level |
| المريض | patient | A person receiving care |
| ملف المريض | patient chart | The person's file inside one tenant |
| فهرس المرضى الموحد | patient index (MPI) | Links between a person and their charts |
| ولي الأمر / فرد العائلة | related person | A person managing another person's profile |
| الموافقة | consent | Permission to share data outside its owner |
| الدوام | schedule | Working hours of a practitioner role |
| الجلسة (دوام) | session | A block of working time, e.g. the evening session |
| الموعد المحدد | slot | A bookable time interval |
| الدور / رقم الدور | queue ticket | A place in a session's queue |
| الحجز | appointment | A booking for a patient |
| حصة القناة | capacity pool | Capacity reserved for a booking channel |
| القناة | channel | Where a booking comes from: online, reception |
| صندوق التعارضات | conflict inbox | Booking conflicts waiting for reception |
| تسجيل الوصول | check-in | The patient has arrived |
| الطابور | queue board | Live order of arrived patients |
| شاشة الانتظار | waiting-room display | TV screen showing current and next numbers |
| نوع الزيارة | visit type | Consultation, follow-up, procedure… with duration and price |
| الكشف | consultation | A standard visit |
| المراجعة | follow-up | A return visit |
| الزيارة | encounter | One visit of a patient to a practitioner |
| ملاحظة الزيارة | visit note | The clinical note of an encounter |
| العلامات الحيوية | vitals | Blood pressure, pulse, temperature, weight… |
| التشخيص | diagnosis (condition) | A coded clinical problem |
| الحساسية | allergy | A recorded allergy or intolerance |
| الوصفة | prescription | Medication request of an encounter |
| الدواء (منتج تجاري) | medication product | A trade product in the catalog |
| المادة الفعالة | substance | Active ingredient (INN) |
| طلب تحاليل / أشعة | service request | A lab or imaging request |
| النتيجة | result | A returned result attached to a request |
| التقرير الطبي | medical report | A printable medical document |
| الإجازة المرضية | sick leave | A printable sick-leave certificate |
| الإحالة | referral | A referral letter |
| القالب | template | A versioned form definition |
| حزمة الاختصاص | specialty pack | Templates and components for one specialty |
| الحقل المخصص | custom field | A clinic-defined field within limits |
| مخطط الأسنان | odontogram | Per-tooth chart (dental pack) |
| خطة العلاج | treatment plan | Multi-session plan with costs (dental pack) |
| الفاتورة | invoice | A bill to a patient |
| الدفعة | payment | Money received (append-only) |
| الذمم / الرصيد المستحق | balance due | What a patient still owes |
| الصندوق | cash session | A staff member's cash drawer for a shift |
| المصاريف | expense | Clinic spending |
| سعر الصرف | exchange rate | Rate stored with each conversion |
| الباقة | package | Plus, Pro or Max preset |
| العقد | contract | A tenant's commercial agreement |
| عرض السعر | quote | A proposed contract |
| الميزة | feature | A catalog item that can be entitled |
| الاستحقاق | entitlement | What a tenant may use |
| الاستثناء | override | A manual entitlement change |
| الجهاز | device | A registration of a clinic computer to one tenant and one branch, with its own keys and local data |
| نسخة التطبيق المثبتة | installation | The clinic app on one computer; it may hold one device registration per clinic |
| تسجيل المستخدم على الجهاز | device enrollment | A staff member enrolled on a device, with a per-user key unlocked by their PIN |
| الرمز السري | PIN | Six digits that unlock a member's key on a device, online or offline |
| مدة العمل دون اتصال | offline window | How long a member's PIN works offline after the server last confirmed them on that device (7 days) |
| القفل التلقائي | idle lock | The app locks after the owner's idle time and asks for a PIN |
| الحجر | quarantine | Commands of a revoked device (or doubtful ones of a deactivated member) held until an owner accepts or rejects each one |
| المزامنة | sync | Exchange of commands and changes with the server |
| الأمر (مزامنة) | command | A queued change validated by the server |
| رمز التحقق | OTP | One-time code sent by WhatsApp |
| ربط واتساب | WhatsApp link | Linking a clinic's WhatsApp number by scanning a QR code |
| جلسة واتساب | WhatsApp session | A linked WhatsApp number running in the gateway (clinic or platform) |
| رقم المنصة | platform number | A Vertex WhatsApp number that sends OTPs, invitations and admin alerts |
| رقم سليم | healthy number | A WhatsApp session that is connected, not paused, and held by a live gateway lease |
| تسخين الرقم | warm-up | The daily cap of a newly linked number, rising with its age |
| مستلم معروف | known recipient | A person a number has already messaged; only their incoming messages are processed |
| إيقاف الرسائل | opt-out | A person's request, by sending «إيقاف», to stop messages they did not request |
| الرد الآلي | auto-reply | The once-a-day answer of a platform number to a known recipient's message |
| نطاق المزامنة | replication scope | The data a device receives: the union of what its registered users' roles may read in its tenant and branch, decided on the server |
| أُدخل خطأً | entered in error | A version that withdraws an earlier clinical version |
| الإشعار | notification | A push or WhatsApp message |
| لوحة المنصة | console | The platform back office |
| سجل التدقيق | audit log | Append-only record of changes and reads |
