-- Tenancy (S01, ADR 0004): isolation and grants for tenants, tenant_logos, facilities and areas.

-- tenants: platform table, the tenant registry. The tenancy module reads and writes only the
-- session's tenant row for clinic routes; the console lists every row. Never deleted (closed
-- tenants are archived).
REVOKE ALL ON tenants FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON tenants TO shifa_app;
--> statement-breakpoint

-- tenant_logos: tenant table, business; replaced logos are archived, never deleted.
ALTER TABLE tenant_logos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant_logos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant_logos
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
REVOKE ALL ON tenant_logos FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON tenant_logos TO shifa_app;
--> statement-breakpoint

-- facilities: tenant table, business; branches are archived, never deleted.
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE facilities FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON facilities
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
REVOKE ALL ON facilities FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON facilities TO shifa_app;
--> statement-breakpoint

-- areas: platform reference list, changed only by migrations; the apps read it.
REVOKE ALL ON areas FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON areas TO shifa_app;
