// Synthetic fixtures. Fixed ids so the scenarios can refer to them.
const id = (n) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;

export const IDS = {
  tenantA: id(1),
  branchA: id(2),
  tenantB: id(3),
  branchB: id(4),
  practitioner: id(5),
  deviceA: id(10),
  deviceB: id(11),
  deviceOtherTenant: id(12),
  deviceCrash: id(13),
  user: id(20),
  patients: [id(30), id(31), id(32), id(33), id(34), id(35)],
  patientOtherTenant: id(39),
  note: id(40),
  noteOtherTenant: id(41),
  // 09:00 shared, 09:15-09:45 reception, 10:00 online, 10:15 shared, 10:30-10:45 reception, 11:15 online
  slotShared: id(50),
  slotReception: id(51),
  slotReception2: id(52),
  slotReception3: id(53),
  slotOnline: id(54),
  slotShared2: id(55),
  slotReception4: id(56),
  slotReception5: id(57),
  slotOnline2: id(60),
  slotOtherTenant: id(59),
  // Tenant B row that reuses branch A's id: only tenant filters (RLS, stream tenant filter) can exclude it.
  slotTenantBInBranchA: id(58),
};

const SLOTS = [
  [IDS.slotShared, '09:00', 'shared'],
  [IDS.slotReception, '09:15', 'reception'],
  [IDS.slotReception2, '09:30', 'reception'],
  [IDS.slotReception3, '09:45', 'reception'],
  [IDS.slotOnline, '10:00', 'online'],
  [IDS.slotShared2, '10:15', 'shared'],
  [IDS.slotReception4, '10:30', 'reception'],
  [IDS.slotReception5, '10:45', 'reception'],
  [IDS.slotOnline2, '11:15', 'online'],
];

export async function seed(db) {
  await db.query('TRUNCATE outbox, audit_log, command_log, appointments, booking_conflicts, visit_notes, patients, slots, devices');
  const { tenantA: t, branchA: b } = IDS;
  await db.query(
    `INSERT INTO devices (id, tenant_id, branch_id, name) VALUES
      ($1,$4,$5,'reception-a'), ($2,$4,$5,'reception-b'), ($3,$6,$7,'other-tenant'), ($8,$4,$5,'crash-test')`,
    [IDS.deviceA, IDS.deviceB, IDS.deviceOtherTenant, t, b, IDS.tenantB, IDS.branchB, IDS.deviceCrash],
  );
  for (const [i, pid] of IDS.patients.entries()) {
    await db.query('INSERT INTO patients VALUES ($1,$2,$3,$4)', [pid, t, b, `Synthetic Patient ${i + 1}`]);
  }
  await db.query('INSERT INTO patients VALUES ($1,$2,$3,$4)', [IDS.patientOtherTenant, IDS.tenantB, IDS.branchB, 'Synthetic Other']);
  await db.query('INSERT INTO visit_notes VALUES ($1,$2,$3,$4,$5)', [IDS.note, t, b, IDS.patients[0], 'Synthetic note body']);
  await db.query('INSERT INTO visit_notes VALUES ($1,$2,$3,$4,$5)', [IDS.noteOtherTenant, IDS.tenantB, IDS.branchB, IDS.patientOtherTenant, 'Synthetic other']);
  for (const [sid, hm, pool] of SLOTS) {
    await db.query('INSERT INTO slots VALUES ($1,$2,$3,$4,$5,$6)', [sid, t, b, IDS.practitioner, `2026-11-01T${hm}:00+03:00`, pool]);
  }
  await db.query('INSERT INTO slots VALUES ($1,$2,$3,$4,$5,$6)', [IDS.slotOtherTenant, IDS.tenantB, IDS.branchB, IDS.practitioner, '2026-11-01T09:00:00+03:00', 'reception']);
  await db.query('INSERT INTO slots VALUES ($1,$2,$3,$4,$5,$6)', [IDS.slotTenantBInBranchA, IDS.tenantB, IDS.branchA, IDS.practitioner, '2026-11-01T11:00:00+03:00', 'reception']);
  return { ok: true };
}
