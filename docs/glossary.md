# Glossary

One name per concept. Code, contracts and tables use the English term; the Arabic term is what users see. Add a row when a spec introduces a new concept.

| Arabic (UI) | English (code) | Meaning |
|---|---|---|
| المنصة | platform | Vertex Shifa as a whole |
| العميل / الجهة | tenant | The contracting customer (a doctor, a clinic group, later a lab or pharmacy) |
| الفرع / المنشأة | facility | A branch or site of a tenant; type `clinic` in V1 |
| القسم | unit | A department inside a facility (optional) |
| الطبيب | practitioner | A health professional |
| دور الطبيب في الفرع | practitioner role | A practitioner working at a facility with a schedule |
| الموظف | staff member | A person with a role in a tenant |
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
| الجهاز | device | A registered clinic computer |
| المزامنة | sync | Exchange of commands and changes with the server |
| الأمر (مزامنة) | command | A queued change validated by the server |
| رمز التحقق | OTP | One-time code sent by WhatsApp |
| ربط واتساب | WhatsApp link | A clinic's WhatsApp session linked by QR |
| الإشعار | notification | A push or WhatsApp message |
| لوحة المنصة | console | The platform back office |
| سجل التدقيق | audit log | Append-only record of changes and reads |
