import { boolean, customType, integer, jsonb, numeric, pgTable, serial, text, timestamp, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";

/** Postgres `bytea`. Attachments are held in the database because this deployment has no
 *  object store configured; the upload route previously wrote a placeholder URL and dropped
 *  the bytes on the floor. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const departments = pgTable("departments", {
  id: text("id").primaryKey(), name: text("name").notNull(), description: text("description").notNull(), active: boolean("active").notNull().default(true),
});
export const staff = pgTable("staff", {
  id: integer("id").primaryKey(), externalId: text("external_id").notNull(), name: text("name").notNull(), email: text("email").notNull(), role: text("role").notNull(), department: text("department").notNull(), location: text("location").notNull(), manager: text("manager"), studioId: integer("studio_id"), categories: jsonb("categories").$type<string[]>().notNull(), avatarColor: text("avatar_color").notNull(), isActive: boolean("is_active").notNull().default(true),
});
export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(), ticketNumber: text("ticket_number").notNull().unique(), title: text("title").notNull(), summary: text("summary").notNull(), description: text("description").notNull(), category: text("category").notNull(), subcategory: text("subcategory").notNull(), status: text("status").notNull().default("new"), priority: text("priority").notNull(), severity: text("severity").notNull(), sentiment: text("sentiment"), studio: text("studio"), classFormat: text("class_format"), trainer: text("trainer"), membership: text("membership"), incidentAt: text("incident_at"), memberName: text("member_name").notNull(), memberEmail: text("member_email"), memberPhone: text("member_phone"), momenceMemberId: text("momence_member_id"), preferredContact: text("preferred_contact"), requestedResolution: text("requested_resolution"), assignedStaffId: integer("assigned_staff_id"), assignedStaffName: text("assigned_staff_name"), assignedStaffEmail: text("assigned_staff_email"), departmentId: text("department_id"), departmentName: text("department_name"), slaHours: integer("sla_hours").notNull().default(24), slaDueAt: timestamp("sla_due_at", { withTimezone: true }), source: text("source").notNull().default("iris"), channel: text("channel").notNull().default("chat"), tags: jsonb("tags").$type<string[]>().notNull(), customFields: jsonb("custom_fields").$type<Record<string, unknown>>().notNull(), momenceContext: jsonb("momence_context").$type<Record<string, unknown>>(), templateId: text("template_id"), isEscalated: boolean("is_escalated").notNull().default(false), resolvedAt: timestamp("resolved_at", { withTimezone: true }), closedAt: timestamp("closed_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  kind: text("kind").notNull().default("issue"), resolutionRequired: boolean("resolution_required").notNull().default(true), momenceSessionId: text("momence_session_id"), sourceRef: text("source_ref"), submissionKey: text("submission_key"), impact: text("impact"), assetId: integer("asset_id"), version: integer("version").notNull().default(1),
}, (t) => [uniqueIndex("tickets_source_ref_idx").on(t.sourceRef), uniqueIndex("tickets_submission_key_idx").on(t.submissionKey), index("tickets_category_idx").on(t.category,t.subcategory), index("tickets_status_sla_idx").on(t.status,t.slaDueAt), index("tickets_owner_idx").on(t.assignedStaffId), index("tickets_created_idx").on(t.createdAt), index("tickets_asset_idx").on(t.assetId)]);
export const ticketComments = pgTable("ticket_comments", {
  id: serial("id").primaryKey(), ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }), authorName: text("author_name").notNull(), authorRole: text("author_role").notNull(), body: text("body").notNull(), isInternal: boolean("is_internal").notNull().default(true), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const ticketActivities = pgTable("ticket_activities", {
  id: serial("id").primaryKey(), ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }), actorName: text("actor_name").notNull(), action: text("action").notNull(), detail: text("detail"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const chatSessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(), phase: text("phase").notNull().default("welcome"), collected: jsonb("collected").$type<Record<string, unknown>>().notNull(), missing: jsonb("missing").$type<string[]>().notNull(), draft: jsonb("draft").$type<Record<string, unknown>>(), ticketId: integer("ticket_id"), ticketNumber: text("ticket_number"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(), ownerKey: text("owner_key"), version: integer("version").notNull().default(1), expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => [index("chat_sessions_expires_at_idx").on(t.expiresAt)]);
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(), sessionId: text("session_id").notNull(), role: text("role").notNull(), content: text("content").notNull(), meta: jsonb("meta").$type<Record<string, unknown>>(), attachmentIds: jsonb("attachment_ids").$type<string[]>().default([]), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
},(t)=>[index("chat_message_session_idx").on(t.sessionId)]);

export const chatAttachments = pgTable("chat_attachments", {
  id: text("id").primaryKey(), sessionId: text("session_id").notNull(), fileName: text("file_name").notNull(), fileType: text("file_type").notNull(), fileSize: integer("file_size").notNull(), storageUrl: text("storage_url").notNull(), data: bytea("data"), checksum: text("checksum"), uploadedBy: text("uploaded_by"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("chat_attachments_session_idx").on(t.sessionId)]);
export const appUsers = pgTable("app_users", {
  id: serial("id").primaryKey(), email: text("email").notNull().unique(), name: text("name").notNull(), passwordHash: text("password_hash").notNull(), role: text("role").notNull().default("agent"), staffId: integer("staff_id").references(() => staff.id), active: boolean("active").notNull().default(true), createdAt: timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
},(t)=>[uniqueIndex("app_users_staff_profile_idx").on(t.staffId)]);
export const authSessions = pgTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(), userId: integer("user_id").notNull().references(()=>appUsers.id,{onDelete:"cascade"}), expiresAt: timestamp("expires_at",{withTimezone:true}).notNull(),
});
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(), value: jsonb("value").$type<Record<string, unknown>>().notNull(), version: integer("version").notNull().default(1), updatedBy: integer("updated_by").references(()=>appUsers.id), updatedAt: timestamp("updated_at",{withTimezone:true}).defaultNow().notNull(),
});
export const ticketResolutions = pgTable("ticket_resolutions", {
  ticketId: integer("ticket_id").primaryKey().references(()=>tickets.id,{onDelete:"cascade"}), authorUserId: integer("author_user_id").notNull().references(()=>appUsers.id), rootCause: text("root_cause").notNull().default(""), actionTaken: text("action_taken").notNull().default(""), preventiveAction: text("preventive_action").notNull().default(""), memberOutcome: text("member_outcome").notNull().default(""), followUpAt: text("follow_up_at"), updatedAt: timestamp("updated_at",{withTimezone:true}).defaultNow().notNull(),
});
/** Resolution work log: each step the owner took, kept in order. Richer than the
 *  single free-text actionTaken field, and it survives as an audit trail. */
export const ticketResolutionSteps = pgTable("ticket_resolution_steps", {
  id: serial("id").primaryKey(), ticketId: integer("ticket_id").notNull().references(()=>tickets.id,{onDelete:"cascade"}), authorUserId: integer("author_user_id").notNull().references(()=>appUsers.id), authorName: text("author_name").notNull(), body: text("body").notNull(), createdAt: timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
},(t)=>[index("ticket_resolution_steps_ticket_idx").on(t.ticketId,t.createdAt)]);
/** A ticket can need several follow-ups, each with its own owner and due date. */
export const ticketFollowUps = pgTable("ticket_follow_ups", {
  id: serial("id").primaryKey(), ticketId: integer("ticket_id").notNull().references(()=>tickets.id,{onDelete:"cascade"}), note: text("note").notNull(), dueAt: timestamp("due_at",{withTimezone:true}).notNull(), ownerStaffId: integer("owner_staff_id").references(()=>staff.id), ownerName: text("owner_name").notNull().default(""), done: boolean("done").notNull().default(false), completedAt: timestamp("completed_at",{withTimezone:true}), createdByUserId: integer("created_by_user_id").notNull().references(()=>appUsers.id), createdByName: text("created_by_name").notNull(), createdAt: timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
},(t)=>[index("ticket_follow_ups_ticket_idx").on(t.ticketId,t.dueAt)]);
/** Every outreach attempt to the member, whether or not it connected. */
export const ticketContactLog = pgTable("ticket_contact_log", {
  id: serial("id").primaryKey(), ticketId: integer("ticket_id").notNull().references(()=>tickets.id,{onDelete:"cascade"}), channel: text("channel").notNull(), outcome: text("outcome").notNull(), note: text("note").notNull().default(""), contactedAt: timestamp("contacted_at",{withTimezone:true}).defaultNow().notNull(), authorUserId: integer("author_user_id").notNull().references(()=>appUsers.id), authorName: text("author_name").notNull(),
},(t)=>[index("ticket_contact_log_ticket_idx").on(t.ticketId,t.contactedAt)]);
export const ticketLinks = pgTable("ticket_links", {
  ticketId: integer("ticket_id").notNull().references(()=>tickets.id,{onDelete:"cascade"}), relatedId: integer("related_id").notNull().references(()=>tickets.id,{onDelete:"cascade"}), relation: text("relation").notNull().default("related"), createdAt: timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
},(t)=>[primaryKey({columns:[t.ticketId,t.relatedId]})]);
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  /** The site that owns it, using the studio names the rest of the app routes on. */
  studio: text("studio").notNull(),
  /** The room it lives in — "PowerCycle Studio", "Studio 1". */
  area: text("area"),
  /** What it is: "PowerCycle bike" today, extensible to mics, consoles, AC units. */
  type: text("type").notNull(),
  /** How the floor refers to it, normalised — "6" for bike 6. */
  label: text("label").notNull(),
  /** How it is shown: "Bike #6". */
  name: text("name").notNull(),
  serial: text("serial"),
  /** in-service | out-of-rotation | in-repair | retired */
  status: text("status").notNull().default("in-service"),
  statusNote: text("status_note"),
  statusChangedAt: timestamp("status_changed_at",{withTimezone:true}),
  /** Denormalised fault counters: the fleet view reads these for every asset at once,
   *  so they are maintained on write rather than counted per request. */
  faultCount: integer("fault_count").notNull().default(0),
  lastFaultAt: timestamp("last_fault_at",{withTimezone:true}),
  /** Which grouping in the equipment catalogue this type belongs to — "Cardio",
   *  "IT & systems", "Weights". Stored rather than derived so a catalogue edit does not
   *  silently regroup equipment somebody already filed. */
  category: text("category"),
  manufacturer: text("manufacturer"),
  model: text("model"),
  /** The sticker on the item, if the studio tags its equipment. Distinct from `serial`,
   *  which is the manufacturer's. */
  assetTag: text("asset_tag"),
  vendor: text("vendor"),
  /** Where it physically lives. Free-text `area` is kept for everything imported before
   *  locations were defined; `locationId` is the managed version. */
  locationId: integer("location_id").references(()=>assetLocations.id,{onDelete:"set null"}),
  /** For consumables counted in bulk — bands, balls, a rack of 2 kg weights. One row can
   *  legitimately stand for several identical items. */
  quantity: integer("quantity").notNull().default(1),
  condition: text("condition"),
  purchaseCost: numeric("purchase_cost",{precision:12,scale:2}),
  warrantyUntil: timestamp("warranty_until",{withTimezone:true}),
  notes: text("notes"),
  acquiredAt: timestamp("acquired_at",{withTimezone:true}),
  retiredAt: timestamp("retired_at",{withTimezone:true}),
  createdAt: timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).defaultNow().notNull(),
},(t)=>[uniqueIndex("assets_studio_type_label_idx").on(t.studio,t.type,t.label),index("assets_studio_status_idx").on(t.studio,t.status),index("assets_type_idx").on(t.type),index("assets_location_idx").on(t.locationId)]);

/** Named places inside a site. Seeded from the room plans, then owned by administrators —
 *  the plan does not know about the pantry shelf the spare mics live on. */
export const assetLocations = pgTable("asset_locations", {
  id: serial("id").primaryKey(),
  studio: text("studio").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
},(t)=>[uniqueIndex("asset_locations_studio_name_idx").on(t.studio,t.name)]);

/** Receipts for Momence member actions. Previously module-scope arrays, which meant every
 *  receipt was shared between unrelated users in one process and lost on restart. */
export const momenceActionReceipts = pgTable("momence_action_receipts", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  targetName: text("target_name").notNull(),
  summary: text("summary").notNull(),
  details: jsonb("details").$type<Record<string,unknown>>().notNull().default({}),
  studio: text("studio"),
  performedBy: text("performed_by").notNull(),
  performedByUserId: integer("performed_by_user_id").references(()=>appUsers.id),
  status: text("status").notNull().default("synced"),
  momenceRef: text("momence_ref").notNull().default(""),
  performedAt: timestamp("performed_at",{withTimezone:true}).defaultNow().notNull(),
},(t)=>[index("momence_receipts_target_idx").on(t.targetType,t.targetId),index("momence_receipts_at_idx").on(t.performedAt)]);

/** Fixed-window request counters. In the database rather than in memory because the same
 *  process is not guaranteed to serve the next request. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start",{withTimezone:true}).defaultNow().notNull(),
});

export const integrations = pgTable("integrations", {
  id: text("id").primaryKey(), enabled: boolean("enabled").notNull().default(false), config: jsonb("config").$type<Record<string,string>>().notNull().default({}), encryptedSecrets: text("encrypted_secrets"), status: text("status").notNull().default("not_configured"), lastCheckedAt: timestamp("last_checked_at",{withTimezone:true}), updatedAt: timestamp("updated_at",{withTimezone:true}).defaultNow().notNull(),
});
export const deliveryLogs = pgTable("delivery_logs", {
  id: serial("id").primaryKey(), integrationId: text("integration_id").notNull(), action: text("action").notNull(), status: text("status").notNull().default("pending"), payload: jsonb("payload").$type<Record<string,unknown>>().notNull().default({}), result: jsonb("result").$type<Record<string,unknown>>(), attempts: integer("attempts").notNull().default(0), createdAt: timestamp("created_at",{withTimezone:true}).defaultNow().notNull(), updatedAt: timestamp("updated_at",{withTimezone:true}).defaultNow().notNull(),
});
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(), actorId: integer("actor_id"), actorName: text("actor_name").notNull(), action: text("action").notNull(), entity: text("entity").notNull(), detail: jsonb("detail").$type<Record<string,unknown>>().notNull().default({}), createdAt: timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
});
export const importRuns = pgTable("import_runs", {
  id: serial("id").primaryKey(), source: text("source").notNull(), imported: integer("imported").notNull().default(0), skipped: integer("skipped").notNull().default(0), errors: jsonb("errors").$type<string[]>().notNull().default([]), createdAt: timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
});
