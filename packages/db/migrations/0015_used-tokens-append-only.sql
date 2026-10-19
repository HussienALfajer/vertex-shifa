-- used_tokens: platform table, append-only for every role: a used ticket or proof of work stays
-- used. The app role inserts (`ON CONFLICT DO NOTHING` needs no more) and reads.
CREATE TRIGGER used_tokens_refuse_change BEFORE UPDATE OR DELETE ON used_tokens
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER used_tokens_refuse_truncate BEFORE TRUNCATE ON used_tokens
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
REVOKE ALL ON used_tokens FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON used_tokens TO shifa_app;
