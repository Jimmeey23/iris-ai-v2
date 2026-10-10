ALTER TABLE "tickets" ADD COLUMN "additional_owners" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "committed_resolution_at" timestamp with time zone;