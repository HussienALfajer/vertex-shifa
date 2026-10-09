-- The platform-jobs role (ADR 0004, ADR 0021): the worker's outbox dispatcher reads and claims
-- outbox_events across tenants (ADR 0012, ADR 0020). The role shifa_jobs exists before this
-- migration (`pnpm db:setup-local` locally, deploy/ on servers) and is audited there: every
-- statement it runs is logged. It cannot bypass RLS: its reach across tenants is the policies below,
-- on the one table granted to it, so a grant added by mistake elsewhere still shows no tenant rows.

-- An outbox event never changes except by its claim: dispatched_at set once, for every role. A
-- claim takes the event out of the queue for good; the dispatcher hands it to pg-boss in the same
-- transaction.
CREATE FUNCTION outbox_events_claim_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF OLD.dispatched_at IS NOT NULL OR NEW.dispatched_at IS NULL
     OR (NEW.id, NEW.tenant_id, NEW.type, NEW.payload, NEW.created_at)
        IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.type, OLD.payload, OLD.created_at) THEN
    RAISE EXCEPTION 'outbox_events: only a claim, setting dispatched_at once, is allowed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER outbox_events_claim_only BEFORE UPDATE ON outbox_events
  FOR EACH ROW EXECUTE FUNCTION outbox_events_claim_only();
--> statement-breakpoint

-- The jobs role reads every tenant's events and claims those not yet dispatched. The app role is
-- untouched: tenant_isolation stays its only policy.
CREATE POLICY jobs_read ON outbox_events FOR SELECT TO shifa_jobs
  USING (true);
--> statement-breakpoint
CREATE POLICY jobs_claim ON outbox_events FOR UPDATE TO shifa_jobs
  USING (dispatched_at IS NULL)
  WITH CHECK (dispatched_at IS NOT NULL);
--> statement-breakpoint
GRANT SELECT, UPDATE (dispatched_at, updated_at) ON outbox_events TO shifa_jobs;
