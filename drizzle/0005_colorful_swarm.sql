CREATE TABLE "product_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'normal' NOT NULL,
	"title" text NOT NULL,
	"details" text NOT NULL,
	"steps_to_reproduce" text,
	"expected" text,
	"actual" text,
	"page_path" text NOT NULL,
	"page_label" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reporter_user_id" integer,
	"reporter_name" text NOT NULL,
	"reporter_email" text,
	"contact_back" boolean DEFAULT false NOT NULL,
	"email_status" text DEFAULT 'queued' NOT NULL,
	"email_error" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_feedback_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "product_feedback_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"feedback_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"origin" text DEFAULT 'upload' NOT NULL,
	"data" "bytea" NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_reporter_user_id_app_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_feedback_attachments" ADD CONSTRAINT "product_feedback_attachments_feedback_id_product_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."product_feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_feedback_created_idx" ON "product_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "product_feedback_status_idx" ON "product_feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "product_feedback_attachments_feedback_idx" ON "product_feedback_attachments" USING btree ("feedback_id");