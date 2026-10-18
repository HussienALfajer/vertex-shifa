CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"level" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_latin" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "areas_name_ar_unique" UNIQUE NULLS NOT DISTINCT("parent_id","name_ar"),
	CONSTRAINT "areas_name_latin_unique" UNIQUE NULLS NOT DISTINCT("parent_id","name_latin"),
	CONSTRAINT "areas_id_is_uuidv7" CHECK (uuid_extract_version("areas"."id") = 7),
	CONSTRAINT "areas_level" CHECK ("areas"."level" in ('governorate', 'city')),
	CONSTRAINT "areas_parent" CHECK (("areas"."level" = 'city') = ("areas"."parent_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text DEFAULT 'clinic' NOT NULL,
	"name" text NOT NULL,
	"area_id" uuid NOT NULL,
	"address_details" text NOT NULL,
	"latitude_e7" integer NOT NULL,
	"longitude_e7" integer NOT NULL,
	"contact_phones" jsonb NOT NULL,
	"default_currency" text NOT NULL,
	"working_days" smallint DEFAULT 63 NOT NULL,
	"display_name_format" text DEFAULT 'ticket_only' NOT NULL,
	"display_call_sound" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "facilities_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "facilities_id_is_uuidv7" CHECK (uuid_extract_version("facilities"."id") = 7),
	CONSTRAINT "facilities_type" CHECK ("facilities"."type" = 'clinic'),
	CONSTRAINT "facilities_name" CHECK (char_length("facilities"."name") between 2 and 100),
	CONSTRAINT "facilities_address_details" CHECK (char_length("facilities"."address_details") between 2 and 200),
	CONSTRAINT "facilities_latitude" CHECK ("facilities"."latitude_e7" between -900000000 and 900000000),
	CONSTRAINT "facilities_longitude" CHECK ("facilities"."longitude_e7" between -1800000000 and 1800000000),
	CONSTRAINT "facilities_contact_phones" CHECK (jsonb_typeof("facilities"."contact_phones") = 'array' and jsonb_array_length("facilities"."contact_phones") between 1 and 3),
	CONSTRAINT "facilities_default_currency" CHECK ("facilities"."default_currency" in ('USD', 'TRY', 'SYP')),
	CONSTRAINT "facilities_working_days" CHECK ("facilities"."working_days" between 1 and 127),
	CONSTRAINT "facilities_display_name_format" CHECK ("facilities"."display_name_format" in ('ticket_only', 'first_name_father_initial'))
);
--> statement-breakpoint
CREATE TABLE "tenant_logos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "tenant_logos_id_is_uuidv7" CHECK (uuid_extract_version("tenant_logos"."id") = 7),
	CONSTRAINT "tenant_logos_content_type" CHECK ("tenant_logos"."content_type" = 'image/png'),
	CONSTRAINT "tenant_logos_byte_size" CHECK ("tenant_logos"."byte_size" = octet_length("tenant_logos"."bytes") and "tenant_logos"."byte_size" between 1 and 262144),
	CONSTRAINT "tenant_logos_dimensions" CHECK ("tenant_logos"."width" between 16 and 512 and "tenant_logos"."height" between 16 and 512),
	CONSTRAINT "tenant_logos_sha256" CHECK ("tenant_logos"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_latin" text,
	"status" text DEFAULT 'onboarding' NOT NULL,
	"status_reason" text,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"directory_listed" boolean DEFAULT false NOT NULL,
	"data_location" text DEFAULT 'pool' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "tenants_id_is_uuidv7" CHECK (uuid_extract_version("tenants"."id") = 7),
	CONSTRAINT "tenants_status" CHECK ("tenants"."status" in ('onboarding', 'active', 'suspended', 'closed')),
	CONSTRAINT "tenants_status_reason" CHECK (("tenants"."status_reason" is not null) = ("tenants"."status" in ('suspended', 'closed')) and ("tenants"."status_reason" is null or "tenants"."status_reason" in ('non_payment', 'other'))),
	CONSTRAINT "tenants_closed_is_archived" CHECK (("tenants"."status" = 'closed') = ("tenants"."archived_at" is not null)),
	CONSTRAINT "tenants_name_ar" CHECK (char_length("tenants"."name_ar") between 2 and 100),
	CONSTRAINT "tenants_name_latin" CHECK (char_length("tenants"."name_latin") between 2 and 100),
	CONSTRAINT "tenants_data_location" CHECK ("tenants"."data_location" = 'pool')
);
--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_parent_id_areas_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_logos" ADD CONSTRAINT "tenant_logos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "areas_parent_idx" ON "areas" USING btree ("parent_id","position");--> statement-breakpoint
CREATE INDEX "facilities_tenant_archived_idx" ON "facilities" USING btree ("tenant_id","archived_at");--> statement-breakpoint
CREATE INDEX "facilities_tenant_area_idx" ON "facilities" USING btree ("tenant_id","area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_logos_current_idx" ON "tenant_logos" USING btree ("tenant_id") WHERE "tenant_logos"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");