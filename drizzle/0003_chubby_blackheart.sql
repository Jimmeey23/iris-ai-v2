CREATE TABLE "ticket_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"kind" text NOT NULL,
	"recipient_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "sla_hours" SET DEFAULT 48;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "area" text;--> statement-breakpoint
UPDATE "tickets"
SET "area" = nullif(coalesce("custom_fields"->>'area', "custom_fields"->>'specific_area', "custom_fields"->>'affected_room', "custom_fields"->>'incident_location'), '');--> statement-breakpoint
UPDATE "tickets"
SET "sla_hours" = greatest(12, least(72, "sla_hours")),
    "sla_due_at" = "created_at" + greatest(12, least(72, "sla_hours")) * interval '1 hour'
WHERE "resolution_required" = true
  AND "status" NOT IN ('resolved', 'closed', 'recorded')
  AND "sla_due_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_notifications" ADD CONSTRAINT "ticket_notifications_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_notifications_unique_idx" ON "ticket_notifications" USING btree ("ticket_id","kind","recipient_email");--> statement-breakpoint
CREATE INDEX "ticket_notifications_ticket_idx" ON "ticket_notifications" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_recurring_context_idx" ON "tickets" USING btree ("subcategory","studio","area");
--> statement-breakpoint
INSERT INTO "ticket_links" ("ticket_id", "related_id", "relation")
SELECT older."id", newer."id", 'recurring-context'
FROM "tickets" older
JOIN "tickets" newer
  ON older."id" < newer."id"
 AND older."subcategory" = newer."subcategory"
 AND older."studio" = newer."studio"
 AND older."area" = newer."area"
WHERE older."studio" IS NOT NULL
  AND older."area" IS NOT NULL
ON CONFLICT DO NOTHING;
