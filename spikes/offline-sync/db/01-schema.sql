-- Spike A schema: the minimum to exercise ADR 0008 and ADR 0009. Synthetic data only.
CREATE DATABASE powersync_storage;

-- Roles. The API connects as shifa_app (subject to RLS). PowerSync replicates as powersync_role.
CREATE ROLE shifa_app LOGIN PASSWORD 'spike-only-password' NOSUPERUSER NOBYPASSRLS;
-- Logical replication ignores RLS, but PowerSync's initial snapshot is a plain SELECT, which RLS filters.
-- The spike checks both variants (see scenario "rls-snapshot").
CREATE ROLE powersync_role LOGIN PASSWORD 'spike-only-password' REPLICATION BYPASSRLS;

CREATE TABLE devices (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  name text NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE slots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  practitioner_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  pool text NOT NULL CHECK (pool IN ('online', 'reception', 'shared'))
);

CREATE TABLE patients (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  full_name text NOT NULL
);

CREATE TABLE visit_notes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  patient_id uuid NOT NULL REFERENCES patients(id),
  body text NOT NULL
);

CREATE TABLE booking_conflicts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  slot_id uuid NOT NULL REFERENCES slots(id),
  kept_appointment_id uuid NOT NULL,
  moved_appointment_id uuid NOT NULL,
  rule text NOT NULL,
  alternatives jsonb NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY, -- UUIDv7 made on the device (or by the API for cloud bookings)
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  slot_id uuid NOT NULL REFERENCES slots(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  channel text NOT NULL CHECK (channel IN ('online', 'reception')),
  patient_present boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  origin_device_id uuid,
  command_id uuid,
  conflict_id uuid REFERENCES booking_conflicts(id),
  received_at timestamptz NOT NULL DEFAULT now()
);
-- The database itself refuses a silent double booking.
CREATE UNIQUE INDEX appointments_one_active_per_slot ON appointments (slot_id)
  WHERE status IN ('booked', 'confirmed', 'arrived', 'in_consultation');

-- Every command a device uploads, with the server's decision. Idempotency key = command id.
CREATE TABLE command_log (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  device_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  device_time timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN ('accepted', 'adjusted', 'rejected')),
  outcome_detail jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  device_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL, -- device time of the read
  recorded_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid UNIQUE
);

CREATE TABLE outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  kind text NOT NULL,
  patient_id uuid NOT NULL,
  payload jsonb NOT NULL, -- times and ids only, never medical content
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only tables.
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;
CREATE TRIGGER command_log_append_only BEFORE UPDATE OR DELETE ON command_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Tenant isolation (ADR 0004): tenant context per transaction.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['devices','slots','patients','visit_notes','booking_conflicts','appointments','command_log','audit_log','outbox'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)$p$, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON devices, slots, patients, visit_notes, booking_conflicts, appointments, command_log, outbox TO shifa_app;
GRANT SELECT, INSERT ON audit_log TO shifa_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO shifa_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;

CREATE PUBLICATION powersync FOR TABLE slots, patients, visit_notes, booking_conflicts, appointments, command_log;
