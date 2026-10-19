CREATE TABLE "used_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"token_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "used_tokens_kind_token_id_unique" UNIQUE("kind","token_id"),
	CONSTRAINT "used_tokens_id_is_uuidv7" CHECK (uuid_extract_version("used_tokens"."id") = 7),
	CONSTRAINT "used_tokens_kind" CHECK ("used_tokens"."kind" in ('ticket', 'console_step', 'proof_of_work'))
);
