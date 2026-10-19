ALTER TABLE "account_tenant_links" DROP CONSTRAINT "account_tenant_links_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "staff_membership_facilities" DROP CONSTRAINT "staff_membership_facilities_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "staff_memberships" DROP CONSTRAINT "staff_memberships_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "audit_entries" DROP CONSTRAINT "audit_entries_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "platform_audit_entries" DROP CONSTRAINT "platform_audit_entries_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "device_enrollments" DROP CONSTRAINT "device_enrollments_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "device_enrollments" DROP CONSTRAINT "device_enrollments_public_key";--> statement-breakpoint
ALTER TABLE "devices" DROP CONSTRAINT "devices_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "devices" DROP CONSTRAINT "devices_public_key";--> statement-breakpoint
ALTER TABLE "otp_challenges" DROP CONSTRAINT "otp_challenges_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "platform_sessions" DROP CONSTRAINT "platform_sessions_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "platform_user_recovery_codes" DROP CONSTRAINT "platform_user_recovery_codes_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "platform_users" DROP CONSTRAINT "platform_users_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "staff_sessions" DROP CONSTRAINT "staff_sessions_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "used_tokens" DROP CONSTRAINT "used_tokens_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "practitioner_photos" DROP CONSTRAINT "practitioner_photos_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "practitioner_specialties" DROP CONSTRAINT "practitioner_specialties_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "practitioners" DROP CONSTRAINT "practitioners_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "specialties" DROP CONSTRAINT "specialties_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "areas" DROP CONSTRAINT "areas_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "facilities" DROP CONSTRAINT "facilities_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "tenant_logos" DROP CONSTRAINT "tenant_logos_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "tenants" DROP CONSTRAINT "tenants_id_is_uuidv7";--> statement-breakpoint
ALTER TABLE "account_tenant_links" ADD CONSTRAINT "account_tenant_links_id_is_uuidv7" CHECK ((uuid_extract_version("account_tenant_links"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "staff_membership_facilities" ADD CONSTRAINT "staff_membership_facilities_id_is_uuidv7" CHECK ((uuid_extract_version("staff_membership_facilities"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_id_is_uuidv7" CHECK ((uuid_extract_version("staff_memberships"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_id_is_uuidv7" CHECK ((uuid_extract_version("audit_entries"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "platform_audit_entries" ADD CONSTRAINT "platform_audit_entries_id_is_uuidv7" CHECK ((uuid_extract_version("platform_audit_entries"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_id_is_uuidv7" CHECK ((uuid_extract_version("outbox_events"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_id_is_uuidv7" CHECK ((uuid_extract_version("accounts"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_id_is_uuidv7" CHECK ((uuid_extract_version("device_enrollments"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_public_key" CHECK ("device_enrollments"."public_key" ~ '^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$');--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_id_is_uuidv7" CHECK ((uuid_extract_version("devices"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_public_key" CHECK ("devices"."public_key" ~ '^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$');--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_id_is_uuidv7" CHECK ((uuid_extract_version("otp_challenges"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_id_is_uuidv7" CHECK ((uuid_extract_version("platform_sessions"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "platform_user_recovery_codes" ADD CONSTRAINT "platform_user_recovery_codes_id_is_uuidv7" CHECK ((uuid_extract_version("platform_user_recovery_codes"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "platform_users" ADD CONSTRAINT "platform_users_id_is_uuidv7" CHECK ((uuid_extract_version("platform_users"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_id_is_uuidv7" CHECK ((uuid_extract_version("staff_sessions"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "used_tokens" ADD CONSTRAINT "used_tokens_id_is_uuidv7" CHECK ((uuid_extract_version("used_tokens"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "practitioner_photos" ADD CONSTRAINT "practitioner_photos_id_is_uuidv7" CHECK ((uuid_extract_version("practitioner_photos"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "practitioner_specialties" ADD CONSTRAINT "practitioner_specialties_id_is_uuidv7" CHECK ((uuid_extract_version("practitioner_specialties"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_id_is_uuidv7" CHECK ((uuid_extract_version("practitioners"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "specialties" ADD CONSTRAINT "specialties_id_is_uuidv7" CHECK ((uuid_extract_version("specialties"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_id_is_uuidv7" CHECK ((uuid_extract_version("areas"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_id_is_uuidv7" CHECK ((uuid_extract_version("facilities"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "tenant_logos" ADD CONSTRAINT "tenant_logos_id_is_uuidv7" CHECK ((uuid_extract_version("tenant_logos"."id") = 7) IS TRUE);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_id_is_uuidv7" CHECK ((uuid_extract_version("tenants"."id") = 7) IS TRUE);