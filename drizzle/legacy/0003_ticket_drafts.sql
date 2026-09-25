CREATE TABLE IF NOT EXISTS "ticket_drafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "template_id" text,
  "category" text NOT NULL,
  "subcategory" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ticket_drafts_user_updated_idx" ON "ticket_drafts" ("user_id", "updated_at");
