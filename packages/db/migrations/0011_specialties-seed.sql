-- Specialties seed (S02): the medical specialties doctors choose for their profile (1–3, the first is
-- the main one). Public names, not personal data. Fixed UUIDv7 ids, so every environment and every
-- replicated device (S04) shares them. Vertex adds specialties in later migrations until S23.
INSERT INTO specialties (id, code, name_ar, name_latin, position) VALUES
  ('01a1231c-0001-7001-8000-000000000001', 'general-practice', 'الطب العام', 'General practice', 1),
  ('01a1231c-0001-7002-8000-000000000002', 'family-medicine', 'طب الأسرة', 'Family medicine', 2),
  ('01a1231c-0001-7003-8000-000000000003', 'internal-medicine', 'الأمراض الداخلية', 'Internal medicine', 3),
  ('01a1231c-0001-7004-8000-000000000004', 'pediatrics', 'طب الأطفال', 'Pediatrics', 4),
  ('01a1231c-0001-7005-8000-000000000005', 'obstetrics-gynecology', 'النسائية والتوليد', 'Obstetrics and gynecology', 5),
  ('01a1231c-0001-7006-8000-000000000006', 'general-dentistry', 'طب الأسنان العام', 'General dentistry', 6),
  ('01a1231c-0001-7007-8000-000000000007', 'orthodontics', 'تقويم الأسنان', 'Orthodontics', 7),
  ('01a1231c-0001-7008-8000-000000000008', 'oral-surgery', 'جراحة الفم', 'Oral surgery', 8),
  ('01a1231c-0001-7009-8000-000000000009', 'ent', 'الأذن والأنف والحنجرة', 'Ear, nose and throat', 9),
  ('01a1231c-0001-700a-8000-00000000000a', 'ophthalmology', 'طب العيون', 'Ophthalmology', 10),
  ('01a1231c-0001-700b-8000-00000000000b', 'dermatology', 'الأمراض الجلدية', 'Dermatology', 11),
  ('01a1231c-0001-700c-8000-00000000000c', 'orthopedics', 'جراحة العظام', 'Orthopedics', 12),
  ('01a1231c-0001-700d-8000-00000000000d', 'cardiology', 'أمراض القلب', 'Cardiology', 13),
  ('01a1231c-0001-700e-8000-00000000000e', 'neurology', 'الأمراض العصبية', 'Neurology', 14),
  ('01a1231c-0001-700f-8000-00000000000f', 'psychiatry', 'الطب النفسي', 'Psychiatry', 15),
  ('01a1231c-0001-7010-8000-000000000010', 'urology', 'المسالك البولية', 'Urology', 16),
  ('01a1231c-0001-7011-8000-000000000011', 'general-surgery', 'الجراحة العامة', 'General surgery', 17),
  ('01a1231c-0001-7012-8000-000000000012', 'gastroenterology', 'أمراض الجهاز الهضمي', 'Gastroenterology', 18),
  ('01a1231c-0001-7013-8000-000000000013', 'endocrinology', 'الغدد الصم', 'Endocrinology', 19),
  ('01a1231c-0001-7014-8000-000000000014', 'chest-medicine', 'الأمراض الصدرية', 'Chest medicine', 20),
  ('01a1231c-0001-7015-8000-000000000015', 'nephrology', 'أمراض الكلى', 'Nephrology', 21),
  ('01a1231c-0001-7016-8000-000000000016', 'physical-therapy', 'العلاج الفيزيائي', 'Physical therapy', 22);
