-- Tenant isolation (ADR 0004) and append-only guards (ADR 0016, ADR 0020) for the first tables.
-- The roles shifa_owner (runs migrations, owns the tables) and shifa_app (the apps' role, cannot
-- bypass RLS) exist before the first migration: `pnpm db:setup-local` locally, deploy/ on servers.

-- The tenant of the current transaction, set by withTenant(); NULL when none is set, so a policy
-- comparing with it matches nothing. Every tenant policy uses it.
CREATE FUNCTION current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint

-- Refuses UPDATE, DELETE and TRUNCATE on append-only tables, for every role including the owner.
CREATE FUNCTION refuse_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint

-- audit_entries: tenant table, append-only; the app role reads and adds entries only.
ALTER TABLE audit_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_entries
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
CREATE TRIGGER audit_entries_refuse_change BEFORE UPDATE OR DELETE ON audit_entries
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER audit_entries_refuse_truncate BEFORE TRUNCATE ON audit_entries
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
REVOKE ALL ON audit_entries FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_entries TO shifa_app;
--> statement-breakpoint

-- outbox_events: tenant table, work queue; the API adds events in its tenant's transaction. The
-- worker's dispatcher gets its own access with the worker skeleton.
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON outbox_events
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint
REVOKE ALL ON outbox_events FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON outbox_events TO shifa_app;
