CREATE TABLE "ticket_resolution_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"checksum" text NOT NULL,
	"uploaded_by_user_id" integer NOT NULL,
	"uploaded_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_resolution_attachments" ADD CONSTRAINT "ticket_resolution_attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_resolution_attachments" ADD CONSTRAINT "ticket_resolution_attachments_uploaded_by_user_id_app_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_resolution_attachments_ticket_idx" ON "ticket_resolution_attachments" USING btree ("ticket_id","created_at");
--> statement-breakpoint
UPDATE "assets"
SET "asset_tag" = 'P57-EQ-' || lpad("id"::text, 5, '0')
WHERE "asset_tag" IS NULL OR btrim("asset_tag") = '';
