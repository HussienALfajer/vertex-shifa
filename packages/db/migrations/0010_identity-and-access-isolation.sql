-- Identity, access and practitioners (S02, ADR 0004, ADR 0016, ADR 0024): isolation, grants and the
-- append-only guard of the platform audit.

-- staff_memberships: tenant table, business; deactivated or archived, never deleted.
ALTER TABLE staff_memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staff_memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON staff_memberships
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
REVOKE ALL ON staff_memberships FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON staff_memberships TO shifa_app;
--> statement-breakpoint

-- staff_membership_facilities: tenant table, business; a branch leaving a member's scope is archived.
ALTER TABLE staff_membership_facilities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staff_membership_facilities FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON staff_membership_facilities
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
REVOKE ALL ON staff_membership_facilities FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON staff_membership_facilities TO shifa_app;
--> statement-breakpoint

-- devices: tenant table, business; revoked, never deleted.
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE devices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON devices
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
REVOKE ALL ON devices FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON devices TO shifa_app;
--> statement-breakpoint

-- device_enrollments: tenant table, business; revoked, never deleted.
ALTER TABLE device_enrollments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE device_enrollments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON device_enrollments
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
REVOKE ALL ON device_enrollments FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON device_enrollments TO shifa_app;
--> statement-breakpoint

-- staff_sessions: tenant table, business; ended, never deleted.
ALTER TABLE staff_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staff_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON staff_sessions
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
REVOKE ALL ON staff_sessions FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON staff_sessions TO shifa_app;
--> statement-breakpoint

-- practitioners: tenant table, business; archived when the doctor role is removed.
ALTER TABLE practitioners ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE practitioners FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON practitioners
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
REVOKE ALL ON practitioners FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON practitioners TO shifa_app;
--> statement-breakpoint

-- practitioner_specialties: tenant table, business; replaced specialties are archived.
ALTER TABLE practitioner_specialties ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE practitioner_specialties FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON practitioner_specialties
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
REVOKE ALL ON practitioner_specialties FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON practitioner_specialties TO shifa_app;
--> statement-breakpoint

-- practitioner_photos: tenant table, business; replaced photos are archived.
ALTER TABLE practitioner_photos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE practitioner_photos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON practitioner_photos
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
REVOKE ALL ON practitioner_photos FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON practitioner_photos TO shifa_app;
--> statement-breakpoint

-- accounts: platform table, business: one per person; personal data read by the identity module only.
REVOKE ALL ON accounts FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON accounts TO shifa_app;
--> statement-breakpoint

-- account_tenant_links: platform table, business: offers an account's clinics at sign-in; every decision
-- rereads the membership under the tenant's RLS.
REVOKE ALL ON account_tenant_links FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON account_tenant_links TO shifa_app;
--> statement-breakpoint

-- otp_challenges: platform table, work queue: attempts and consumption change the row.
REVOKE ALL ON otp_challenges FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON otp_challenges TO shifa_app;
--> statement-breakpoint

-- platform_users: platform table, business: Vertex staff; disabled, never deleted.
REVOKE ALL ON platform_users FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON platform_users TO shifa_app;
--> statement-breakpoint

-- platform_user_recovery_codes: platform table, business: used or archived, never deleted.
REVOKE ALL ON platform_user_recovery_codes FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON platform_user_recovery_codes TO shifa_app;
--> statement-breakpoint

-- platform_sessions: platform table, business: ended, never deleted.
REVOKE ALL ON platform_sessions FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON platform_sessions TO shifa_app;
--> statement-breakpoint

-- specialties: platform reference list, changed only by migrations; the apps read it.
REVOKE ALL ON specialties FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON specialties TO shifa_app;
--> statement-breakpoint

-- platform_audit_entries: platform table, append-only for every role (ADR 0016).
CREATE TRIGGER platform_audit_entries_refuse_change BEFORE UPDATE OR DELETE ON platform_audit_entries
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER platform_audit_entries_refuse_truncate BEFORE TRUNCATE ON platform_audit_entries
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
REVOKE ALL ON platform_audit_entries FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON platform_audit_entries TO shifa_app;
