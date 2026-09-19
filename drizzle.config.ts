import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env" });

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  // Scoped to this app's tables so push never touches other tables that share
  // the Supabase `public` schema (e.g. brand_documents, n8n_chat_histories).
  tablesFilter: [
    "app_settings",
    "app_users",
    "assets",
    "audit_logs",
    "auth_sessions",
    "chat_attachments",
    "chat_messages",
    "chat_sessions",
    "delivery_logs",
    "departments",
    "import_runs",
    "integrations",
    "staff",
    "ticket_activities",
    "ticket_comments",
    "ticket_contact_log",
    "ticket_follow_ups",
    "ticket_links",
    "ticket_resolution_steps",
    "ticket_resolutions",
    "tickets",
  ],
  dbCredentials: { url, ssl: url.includes("supabase.com") ? { rejectUnauthorized: false } : false },
});
