CREATE TABLE "account_tenant_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"linked_tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "account_tenant_links_account_tenant_unique" UNIQUE("account_id","linked_tenant_id"),
	CONSTRAINT "account_tenant_links_id_is_uuidv7" CHECK (uuid_extract_version("account_tenant_links"."id") = 7)
);
--> statement-breakpoint
CREATE TABLE "staff_membership_facilities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "staff_membership_facilities_id_is_uuidv7" CHECK (uuid_extract_version("staff_membership_facilities"."id") = 7)
);
--> statement-breakpoint
CREATE TABLE "staff_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"status" text NOT NULL,
	"roles" text[] NOT NULL,
	"all_facilities" boolean DEFAULT false NOT NULL,
	"granted_permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"revoked_permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"invited_name" text NOT NULL,
	"invited_by_membership_id" uuid,
	"invitation_expires_at" timestamp with time zone,
	"invitation_message_status" text,
	"accepted_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "staff_memberships_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "staff_memberships_tenant_account_unique" UNIQUE("tenant_id","account_id"),
	CONSTRAINT "staff_memberships_id_is_uuidv7" CHECK (uuid_extract_version("staff_memberships"."id") = 7),
	CONSTRAINT "staff_memberships_status" CHECK ("staff_memberships"."status" in ('invited', 'active', 'deactivated')),
	CONSTRAINT "staff_memberships_roles" CHECK (cardinality("staff_memberships"."roles") between 1 and 5 and "staff_memberships"."roles" <@ array['owner', 'doctor', 'reception', 'nurse', 'accountant']),
	CONSTRAINT "staff_memberships_owner_all_facilities" CHECK (not ('owner' = any("staff_memberships"."roles")) or "staff_memberships"."all_facilities"),
	CONSTRAINT "staff_memberships_adjustments_disjoint" CHECK (not ("staff_memberships"."granted_permissions" && "staff_memberships"."revoked_permissions")),
	CONSTRAINT "staff_memberships_invited_name" CHECK (char_length("staff_memberships"."invited_name") between 2 and 100),
	CONSTRAINT "staff_memberships_invitation" CHECK ("staff_memberships"."status" <> 'invited' or ("staff_memberships"."invitation_expires_at" is not null and "staff_memberships"."invitation_message_status" is not null)),
	CONSTRAINT "staff_memberships_invitation_message_status" CHECK ("staff_memberships"."invitation_message_status" in ('pending', 'sent', 'failed')),
	CONSTRAINT "staff_memberships_deactivated" CHECK (("staff_memberships"."status" = 'deactivated') = ("staff_memberships"."deactivated_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "platform_audit_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" uuid,
	"device_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"reason" text,
	"subject_tenant_id" uuid,
	"request_route" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_audit_entries_id_is_uuidv7" CHECK (uuid_extract_version("platform_audit_entries"."id") = 7),
	CONSTRAINT "platform_audit_entries_actor_kind" CHECK ("platform_audit_entries"."actor_kind" in ('platform', 'staff', 'system'))
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name_ar" text,
	"password_hash" text,
	"password_changed_at" timestamp with time zone,
	"phone_verified_at" timestamp with time zone,
	"password_reset_authorized_until" timestamp with time zone,
	"failed_sign_ins" smallint DEFAULT 0 NOT NULL,
	"sign_in_locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "accounts_phone_unique" UNIQUE("phone"),
	CONSTRAINT "accounts_id_is_uuidv7" CHECK (uuid_extract_version("accounts"."id") = 7),
	CONSTRAINT "accounts_phone" CHECK ("accounts"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "accounts_name_ar" CHECK (char_length("accounts"."name_ar") between 2 and 100),
	CONSTRAINT "accounts_failed_sign_ins" CHECK ("accounts"."failed_sign_ins" >= 0)
);
--> statement-breakpoint
CREATE TABLE "device_enrollments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"last_confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "device_enrollments_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "device_enrollments_id_is_uuidv7" CHECK (uuid_extract_version("device_enrollments"."id") = 7),
	CONSTRAINT "device_enrollments_public_key" CHECK ("device_enrollments"."public_key" ~ '^[A-Za-z0-9+/]{43}=$'),
	CONSTRAINT "device_enrollments_revoked" CHECK (("device_enrollments"."revoked_at" is null) = ("device_enrollments"."revoke_reason" is null)),
	CONSTRAINT "device_enrollments_revoke_reason" CHECK ("device_enrollments"."revoke_reason" in ('device_revoked', 'member_deactivated', 'removed_from_device', 'pin_forgotten', 'branch_left'))
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"facility_id" uuid,
	"name" text NOT NULL,
	"public_key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"os" text NOT NULL,
	"app_version" text NOT NULL,
	"registered_by_membership_id" uuid NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_membership_id" uuid,
	"wiped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "devices_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "devices_tenant_public_key_unique" UNIQUE("tenant_id","public_key"),
	CONSTRAINT "devices_id_is_uuidv7" CHECK (uuid_extract_version("devices"."id") = 7),
	CONSTRAINT "devices_name" CHECK (char_length("devices"."name") between 2 and 50),
	CONSTRAINT "devices_public_key" CHECK ("devices"."public_key" ~ '^[A-Za-z0-9+/]{43}=$'),
	CONSTRAINT "devices_status" CHECK ("devices"."status" in ('active', 'revoked')),
	CONSTRAINT "devices_revoked" CHECK (("devices"."status" = 'revoked') = ("devices"."revoked_at" is not null)),
	CONSTRAINT "devices_wiped" CHECK ("devices"."wiped_at" is null or "devices"."status" = 'revoked'),
	CONSTRAINT "devices_os" CHECK (char_length("devices"."os") between 1 and 100),
	CONSTRAINT "devices_app_version" CHECK (char_length("devices"."app_version") between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"delivery_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_challenges_id_is_uuidv7" CHECK (uuid_extract_version("otp_challenges"."id") = 7),
	CONSTRAINT "otp_challenges_purpose" CHECK ("otp_challenges"."purpose" in ('device_sign_in', 'first_sign_in', 'password_reset')),
	CONSTRAINT "otp_challenges_attempts" CHECK ("otp_challenges"."attempts" between 0 and 5),
	CONSTRAINT "otp_challenges_delivery_status" CHECK ("otp_challenges"."delivery_status" in ('sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "platform_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reauthenticated_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "platform_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "platform_sessions_id_is_uuidv7" CHECK (uuid_extract_version("platform_sessions"."id") = 7),
	CONSTRAINT "platform_sessions_ended" CHECK (("platform_sessions"."ended_at" is null) = ("platform_sessions"."end_reason" is null)),
	CONSTRAINT "platform_sessions_end_reason" CHECK ("platform_sessions"."end_reason" in ('signed_out', 'expired', 'idle', 'user_disabled', 'user_reset', 'password_changed'))
);
--> statement-breakpoint
CREATE TABLE "platform_user_recovery_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "platform_user_recovery_codes_id_is_uuidv7" CHECK (uuid_extract_version("platform_user_recovery_codes"."id") = 7)
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending_setup' NOT NULL,
	"password_hash" text,
	"setup_code_hash" text,
	"setup_code_expires_at" timestamp with time zone,
	"totp_secret" text,
	"totp_last_step" bigint,
	"failed_sign_ins" smallint DEFAULT 0 NOT NULL,
	"sign_in_locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "platform_users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "platform_users_id_is_uuidv7" CHECK (uuid_extract_version("platform_users"."id") = 7),
	CONSTRAINT "platform_users_phone" CHECK ("platform_users"."phone" ~ '^\+[0-9]{8,15}$'),
	CONSTRAINT "platform_users_name" CHECK (char_length("platform_users"."name") between 2 and 100),
	CONSTRAINT "platform_users_role" CHECK ("platform_users"."role" in ('admin', 'support')),
	CONSTRAINT "platform_users_status" CHECK ("platform_users"."status" in ('pending_setup', 'active', 'disabled')),
	CONSTRAINT "platform_users_active_is_set_up" CHECK ("platform_users"."status" <> 'active' or ("platform_users"."password_hash" is not null and "platform_users"."totp_secret" is not null)),
	CONSTRAINT "platform_users_setup_code" CHECK (("platform_users"."setup_code_hash" is null) = ("platform_users"."setup_code_expires_at" is null)),
	CONSTRAINT "platform_users_failed_sign_ins" CHECK ("platform_users"."failed_sign_ins" >= 0)
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "staff_sessions_tenant_refresh_token_unique" UNIQUE("tenant_id","refresh_token_hash"),
	CONSTRAINT "staff_sessions_id_is_uuidv7" CHECK (uuid_extract_version("staff_sessions"."id") = 7),
	CONSTRAINT "staff_sessions_ended" CHECK (("staff_sessions"."ended_at" is null) = ("staff_sessions"."end_reason" is null)),
	CONSTRAINT "staff_sessions_end_reason" CHECK ("staff_sessions"."end_reason" in ('signed_out', 'locked', 'expired', 'member_deactivated', 'device_revoked', 'enrollment_revoked', 'password_reset'))
);
--> statement-breakpoint
CREATE TABLE "practitioner_photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "practitioner_photos_id_is_uuidv7" CHECK (uuid_extract_version("practitioner_photos"."id") = 7),
	CONSTRAINT "practitioner_photos_content_type" CHECK ("practitioner_photos"."content_type" = 'image/jpeg'),
	CONSTRAINT "practitioner_photos_byte_size" CHECK ("practitioner_photos"."byte_size" = octet_length("practitioner_photos"."bytes") and "practitioner_photos"."byte_size" between 1 and 262144),
	CONSTRAINT "practitioner_photos_dimensions" CHECK ("practitioner_photos"."width" = "practitioner_photos"."height" and "practitioner_photos"."width" between 128 and 512),
	CONSTRAINT "practitioner_photos_sha256" CHECK ("practitioner_photos"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "practitioner_specialties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"specialty_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "practitioner_specialties_id_is_uuidv7" CHECK (uuid_extract_version("practitioner_specialties"."id") = 7),
	CONSTRAINT "practitioner_specialties_position" CHECK ("practitioner_specialties"."position" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "practitioners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"display_name_ar" text NOT NULL,
	"display_name_latin" text,
	"gender" text NOT NULL,
	"syndicate_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "practitioners_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "practitioners_id_is_uuidv7" CHECK (uuid_extract_version("practitioners"."id") = 7),
	CONSTRAINT "practitioners_display_name_ar" CHECK (char_length("practitioners"."display_name_ar") between 2 and 100),
	CONSTRAINT "practitioners_display_name_latin" CHECK (char_length("practitioners"."display_name_latin") between 2 and 100),
	CONSTRAINT "practitioners_gender" CHECK ("practitioners"."gender" in ('male', 'female')),
	CONSTRAINT "practitioners_syndicate_number" CHECK ("practitioners"."syndicate_number" ~ '^[A-Za-z0-9/-]{1,30}$')
);
--> statement-breakpoint
CREATE TABLE "specialties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_latin" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "specialties_code_unique" UNIQUE("code"),
	CONSTRAINT "specialties_position_unique" UNIQUE("position"),
	CONSTRAINT "specialties_id_is_uuidv7" CHECK (uuid_extract_version("specialties"."id") = 7),
	CONSTRAINT "specialties_code" CHECK ("specialties"."code" ~ '^[a-z]+(-[a-z]+)*$')
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "idle_lock_minutes" smallint DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "clinical_read_scope" text DEFAULT 'branch' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_tenant_links" ADD CONSTRAINT "account_tenant_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_tenant_links" ADD CONSTRAINT "account_tenant_links_linked_tenant_id_tenants_id_fk" FOREIGN KEY ("linked_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_membership_facilities" ADD CONSTRAINT "staff_membership_facilities_membership_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."staff_memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_membership_facilities" ADD CONSTRAINT "staff_membership_facilities_facility_fk" FOREIGN KEY ("tenant_id","facility_id") REFERENCES "public"."facilities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_invited_by_fk" FOREIGN KEY ("tenant_id","invited_by_membership_id") REFERENCES "public"."staff_memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_device_fk" FOREIGN KEY ("tenant_id","device_id") REFERENCES "public"."devices"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_membership_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."staff_memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_facility_fk" FOREIGN KEY ("tenant_id","facility_id") REFERENCES "public"."facilities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_registered_by_fk" FOREIGN KEY ("tenant_id","registered_by_membership_id") REFERENCES "public"."staff_memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_revoked_by_fk" FOREIGN KEY ("tenant_id","revoked_by_membership_id") REFERENCES "public"."staff_memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_platform_user_id_platform_users_id_fk" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_user_recovery_codes" ADD CONSTRAINT "platform_user_recovery_codes_platform_user_id_platform_users_id_fk" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_membership_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."staff_memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_device_fk" FOREIGN KEY ("tenant_id","device_id") REFERENCES "public"."devices"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_enrollment_fk" FOREIGN KEY ("tenant_id","enrollment_id") REFERENCES "public"."device_enrollments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_photos" ADD CONSTRAINT "practitioner_photos_practitioner_fk" FOREIGN KEY ("tenant_id","practitioner_id") REFERENCES "public"."practitioners"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_specialties" ADD CONSTRAINT "practitioner_specialties_specialty_id_specialties_id_fk" FOREIGN KEY ("specialty_id") REFERENCES "public"."specialties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_specialties" ADD CONSTRAINT "practitioner_specialties_practitioner_fk" FOREIGN KEY ("tenant_id","practitioner_id") REFERENCES "public"."practitioners"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_membership_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."staff_memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_tenant_links_tenant_idx" ON "account_tenant_links" USING btree ("linked_tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_membership_facilities_current_idx" ON "staff_membership_facilities" USING btree ("tenant_id","membership_id","facility_id") WHERE "staff_membership_facilities"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "staff_membership_facilities_membership_idx" ON "staff_membership_facilities" USING btree ("tenant_id","membership_id");--> statement-breakpoint
CREATE INDEX "staff_membership_facilities_facility_idx" ON "staff_membership_facilities" USING btree ("tenant_id","facility_id");--> statement-breakpoint
CREATE INDEX "staff_memberships_tenant_status_idx" ON "staff_memberships" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "staff_memberships_tenant_invited_by_idx" ON "staff_memberships" USING btree ("tenant_id","invited_by_membership_id");--> statement-breakpoint
CREATE INDEX "platform_audit_entries_occurred_idx" ON "platform_audit_entries" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "platform_audit_entries_subject_tenant_idx" ON "platform_audit_entries" USING btree ("subject_tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "platform_audit_entries_actor_idx" ON "platform_audit_entries" USING btree ("actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "platform_audit_entries_entity_idx" ON "platform_audit_entries" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "device_enrollments_current_idx" ON "device_enrollments" USING btree ("tenant_id","device_id","membership_id") WHERE "device_enrollments"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "device_enrollments_device_idx" ON "device_enrollments" USING btree ("tenant_id","device_id");--> statement-breakpoint
CREATE INDEX "device_enrollments_membership_idx" ON "device_enrollments" USING btree ("tenant_id","membership_id");--> statement-breakpoint
CREATE INDEX "devices_tenant_facility_status_idx" ON "devices" USING btree ("tenant_id","facility_id","status");--> statement-breakpoint
CREATE INDEX "devices_tenant_registered_by_idx" ON "devices" USING btree ("tenant_id","registered_by_membership_id");--> statement-breakpoint
CREATE INDEX "devices_tenant_revoked_by_idx" ON "devices" USING btree ("tenant_id","revoked_by_membership_id");--> statement-breakpoint
CREATE INDEX "otp_challenges_account_created_idx" ON "otp_challenges" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_sessions_user_ended_idx" ON "platform_sessions" USING btree ("platform_user_id","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_user_recovery_codes_current_idx" ON "platform_user_recovery_codes" USING btree ("platform_user_id","code_hash") WHERE "platform_user_recovery_codes"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "platform_user_recovery_codes_user_idx" ON "platform_user_recovery_codes" USING btree ("platform_user_id");--> statement-breakpoint
CREATE INDEX "staff_sessions_tenant_membership_ended_idx" ON "staff_sessions" USING btree ("tenant_id","membership_id","ended_at");--> statement-breakpoint
CREATE INDEX "staff_sessions_tenant_device_idx" ON "staff_sessions" USING btree ("tenant_id","device_id");--> statement-breakpoint
CREATE INDEX "staff_sessions_tenant_enrollment_idx" ON "staff_sessions" USING btree ("tenant_id","enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioner_photos_current_idx" ON "practitioner_photos" USING btree ("tenant_id","practitioner_id") WHERE "practitioner_photos"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "practitioner_photos_practitioner_idx" ON "practitioner_photos" USING btree ("tenant_id","practitioner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioner_specialties_position_idx" ON "practitioner_specialties" USING btree ("tenant_id","practitioner_id","position") WHERE "practitioner_specialties"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "practitioner_specialties_specialty_idx" ON "practitioner_specialties" USING btree ("tenant_id","practitioner_id","specialty_id") WHERE "practitioner_specialties"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "practitioner_specialties_practitioner_idx" ON "practitioner_specialties" USING btree ("tenant_id","practitioner_id");--> statement-breakpoint
CREATE INDEX "practitioner_specialties_tenant_specialty_idx" ON "practitioner_specialties" USING btree ("tenant_id","specialty_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioners_current_idx" ON "practitioners" USING btree ("tenant_id","membership_id") WHERE "practitioners"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "practitioners_membership_idx" ON "practitioners" USING btree ("tenant_id","membership_id");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_idle_lock_minutes" CHECK ("tenants"."idle_lock_minutes" between 5 and 60);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_clinical_read_scope" CHECK ("tenants"."clinical_read_scope" in ('branch', 'own_patients'));