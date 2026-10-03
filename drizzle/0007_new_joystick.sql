ALTER TABLE "app_users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_extended_hours" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_extended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_extended_by_name" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_extension_reason" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "escalated_to_staff_id" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "escalated_to_name" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_escalated_to_staff_id_staff_id_fk" FOREIGN KEY ("escalated_to_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_username_idx" ON "app_users" USING btree ("username");