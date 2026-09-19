CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'agent' NOT NULL,
	"staff_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"studio" text NOT NULL,
	"area" text,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"name" text NOT NULL,
	"serial" text,
	"status" text DEFAULT 'in-service' NOT NULL,
	"status_note" text,
	"status_changed_at" timestamp with time zone,
	"fault_count" integer DEFAULT 0 NOT NULL,
	"last_fault_at" timestamp with time zone,
	"acquired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"storage_url" text NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"meta" jsonb,
	"attachment_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"phase" text DEFAULT 'welcome' NOT NULL,
	"collected" jsonb NOT NULL,
	"missing" jsonb NOT NULL,
	"draft" jsonb,
	"ticket_id" integer,
	"ticket_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_key" text,
	"version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "delivery_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"integration_id" text NOT NULL,
	"action" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"encrypted_secrets" text,
	"status" text DEFAULT 'not_configured' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" integer PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"department" text NOT NULL,
	"location" text NOT NULL,
	"manager" text,
	"studio_id" integer,
	"categories" jsonb NOT NULL,
	"avatar_color" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"author_role" text NOT NULL,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_contact_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"channel" text NOT NULL,
	"outcome" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"contacted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_user_id" integer NOT NULL,
	"author_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_follow_ups" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"note" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"owner_staff_id" integer,
	"owner_name" text DEFAULT '' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by_user_id" integer NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_links" (
	"ticket_id" integer NOT NULL,
	"related_id" integer NOT NULL,
	"relation" text DEFAULT 'related' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_links_ticket_id_related_id_pk" PRIMARY KEY("ticket_id","related_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_resolution_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"author_user_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_resolutions" (
	"ticket_id" integer PRIMARY KEY NOT NULL,
	"author_user_id" integer NOT NULL,
	"root_cause" text DEFAULT '' NOT NULL,
	"action_taken" text DEFAULT '' NOT NULL,
	"preventive_action" text DEFAULT '' NOT NULL,
	"member_outcome" text DEFAULT '' NOT NULL,
	"follow_up_at" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_number" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text NOT NULL,
	"severity" text NOT NULL,
	"sentiment" text,
	"studio" text,
	"class_format" text,
	"trainer" text,
	"membership" text,
	"incident_at" text,
	"member_name" text NOT NULL,
	"member_email" text,
	"member_phone" text,
	"momence_member_id" text,
	"preferred_contact" text,
	"requested_resolution" text,
	"assigned_staff_id" integer,
	"assigned_staff_name" text,
	"assigned_staff_email" text,
	"department_id" text,
	"department_name" text,
	"sla_hours" integer DEFAULT 24 NOT NULL,
	"sla_due_at" timestamp with time zone,
	"source" text DEFAULT 'iris' NOT NULL,
	"channel" text DEFAULT 'chat' NOT NULL,
	"tags" jsonb NOT NULL,
	"custom_fields" jsonb NOT NULL,
	"momence_context" jsonb,
	"template_id" text,
	"is_escalated" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text DEFAULT 'issue' NOT NULL,
	"resolution_required" boolean DEFAULT true NOT NULL,
	"momence_session_id" text,
	"source_ref" text,
	"submission_key" text,
	"impact" text,
	"asset_id" integer,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_app_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_contact_log" ADD CONSTRAINT "ticket_contact_log_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_contact_log" ADD CONSTRAINT "ticket_contact_log_author_user_id_app_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_follow_ups" ADD CONSTRAINT "ticket_follow_ups_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_follow_ups" ADD CONSTRAINT "ticket_follow_ups_owner_staff_id_staff_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_follow_ups" ADD CONSTRAINT "ticket_follow_ups_created_by_user_id_app_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_related_id_tickets_id_fk" FOREIGN KEY ("related_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_resolution_steps" ADD CONSTRAINT "ticket_resolution_steps_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_resolution_steps" ADD CONSTRAINT "ticket_resolution_steps_author_user_id_app_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_resolutions" ADD CONSTRAINT "ticket_resolutions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_resolutions" ADD CONSTRAINT "ticket_resolutions_author_user_id_app_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_staff_profile_idx" ON "app_users" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_studio_type_label_idx" ON "assets" USING btree ("studio","type","label");--> statement-breakpoint
CREATE INDEX "assets_studio_status_idx" ON "assets" USING btree ("studio","status");--> statement-breakpoint
CREATE INDEX "chat_attachments_session_idx" ON "chat_attachments" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_message_session_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_expires_at_idx" ON "chat_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ticket_contact_log_ticket_idx" ON "ticket_contact_log" USING btree ("ticket_id","contacted_at");--> statement-breakpoint
CREATE INDEX "ticket_follow_ups_ticket_idx" ON "ticket_follow_ups" USING btree ("ticket_id","due_at");--> statement-breakpoint
CREATE INDEX "ticket_resolution_steps_ticket_idx" ON "ticket_resolution_steps" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_source_ref_idx" ON "tickets" USING btree ("source_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_submission_key_idx" ON "tickets" USING btree ("submission_key");--> statement-breakpoint
CREATE INDEX "tickets_category_idx" ON "tickets" USING btree ("category","subcategory");--> statement-breakpoint
CREATE INDEX "tickets_status_sla_idx" ON "tickets" USING btree ("status","sla_due_at");--> statement-breakpoint
CREATE INDEX "tickets_owner_idx" ON "tickets" USING btree ("assigned_staff_id");--> statement-breakpoint
CREATE INDEX "tickets_created_idx" ON "tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tickets_asset_idx" ON "tickets" USING btree ("asset_id");