-- WhatsApp messaging (S03, ADR 0012, ADR 0022, ADR 0026): platform tables, no tenant data, so no
-- RLS. Each revokes PUBLIC and grants the app role (the API, the worker and the gateway) only
-- what the spec lists.

-- whatsapp_sessions: business; unlinked sessions are archived, never deleted.
REVOKE ALL ON whatsapp_sessions FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON whatsapp_sessions TO shifa_app;
--> statement-breakpoint

-- whatsapp_session_credentials: queue; deleted on re-link and unlink.
REVOKE ALL ON whatsapp_session_credentials FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_session_credentials TO shifa_app;
--> statement-breakpoint

-- whatsapp_session_events: append-only for every role.
CREATE TRIGGER whatsapp_session_events_refuse_change BEFORE UPDATE OR DELETE ON whatsapp_session_events
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER whatsapp_session_events_refuse_truncate BEFORE TRUNCATE ON whatsapp_session_events
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
REVOKE ALL ON whatsapp_session_events FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON whatsapp_session_events TO shifa_app;
--> statement-breakpoint

-- whatsapp_messages: the send queue; the gateway's sweep deletes rows after 30 days.
REVOKE ALL ON whatsapp_messages FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_messages TO shifa_app;
--> statement-breakpoint

-- whatsapp_known_recipients: derived from sends, deleted with the session's credentials.
REVOKE ALL ON whatsapp_known_recipients FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_known_recipients TO shifa_app;
--> statement-breakpoint

-- whatsapp_opt_outs: business; a person's choice is kept with its times, never deleted.
REVOKE ALL ON whatsapp_opt_outs FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON whatsapp_opt_outs TO shifa_app;
