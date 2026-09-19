import {z} from "zod";
import {DEFAULT_COLUMNS, GROUP_BY, TICKET_COLUMNS} from "./dashboard-contract";
import { CATEGORY_DEPARTMENT, CATEGORY_MAP, CLASS_FORMATS, MEMBERSHIPS, STUDIOS, TRAINERS } from "./constants";
export const configSchema = z.object({
  workspaceName: z.string().min(2).max(80).default("Physique 57 India"), timezone: z.string().refine(v=>{try{new Intl.DateTimeFormat("en",{timeZone:v});return true;}catch{return false;}},"Choose a valid IANA timezone").default("Asia/Kolkata"),
  defaultTheme: z.enum(["light","dark"]).default("dark"), defaultView: z.enum(["list","board","cards"]).default("list"),
  pollSeconds: z.number().min(5).max(120).default(15), aiEnabled: z.boolean().default(true), aiModel: z.string().max(80).default("gpt-4o-mini"),
  aiVoice: z.string().max(1200).default("You're a smart operational assistant helping staff log issues efficiently. Be conversational, strategic, and context-aware. Reference what they've told you. If they signal urgency or blocking issues, prioritize resolution options. Never echo answers, apologize, or recap facts. Be concise like a colleague helping out, not a script."),
  historyRetrieval: z.boolean().default(true), autoTag: z.boolean().default(true), autoAssign: z.boolean().default(true), positiveNoSla: z.boolean().default(true),
  responseHours: z.object({critical:z.number().min(1).max(720).default(1),high:z.number().min(1).max(720).default(4),medium:z.number().min(1).max(720).default(24),low:z.number().min(1).max(720).default(72)}).default({critical:1,high:4,medium:24,low:72}),
  categoryDepartments: z.record(z.string(),z.string()).default(CATEGORY_DEPARTMENT), routingOwners: z.record(z.string(),z.number().int().positive()).default({}),
  taxonomy: z.record(z.string(),z.array(z.string().min(1))).default(CATEGORY_MAP), studios:z.array(z.string()).default(STUDIOS.map(s=>s.name)), trainers:z.array(z.string()).default([...TRAINERS]), formats:z.array(z.string()).default([...CLASS_FORMATS]), memberships:z.array(z.string()).default([...MEMBERSHIPS]),
  webhookOnCreate:z.boolean().default(false), assignmentEmail:z.boolean().default(false),

  /* ---------------------------------------------------------------- *
   * Workspace defaults for the ticket board.
   * These are the starting point for someone who has not set their own; a personal
   * preference always wins, and is stored per identity in `preferences:<key>`.
   * ---------------------------------------------------------------- */
  defaultGroupBy: z.enum(GROUP_BY).default("none"),
  defaultDensity: z.enum(["comfortable","compact"]).default("comfortable"),
  defaultPageSize: z.number().int().min(5).max(200).default(25),
  defaultColumns: z.array(z.enum(TICKET_COLUMNS)).max(TICKET_COLUMNS.length).default(DEFAULT_COLUMNS),

  /* ---------------------------------------------------------------- *
   * Ticket labels — see lib/ticket-label.ts.
   * ---------------------------------------------------------------- */
  /** `descriptive` writes what happened; `classification` keeps the old taxonomy titles. */
  labelStyle: z.enum(["descriptive","classification"]).default("descriptive"),
  labelMaxLength: z.number().int().min(40).max(140).default(76),

  /* ---------------------------------------------------------------- *
   * Working rhythm. These shape what the board calls urgent, stale or overdue.
   * ---------------------------------------------------------------- */
  /** A ticket older than this, still open, is flagged as ageing. */
  staleTicketDays: z.number().int().min(1).max(90).default(3),
  /** How long before the follow-up target a ticket starts reading as "due soon". */
  slaWarningPercent: z.number().int().min(5).max(90).default(20),
  /** Escalate to critical this many hours after a missed follow-up target. 0 disables it. */
  escalateAfterBreachHours: z.number().int().min(0).max(336).default(0),
  /** Resolving a ticket requires the resolution workspace to be filled in first. */
  requireResolutionNotes: z.boolean().default(false),
  /** Reopening a resolved ticket is allowed. */
  allowReopen: z.boolean().default(true),

  /* ---------------------------------------------------------------- *
   * Presentation.
   * ---------------------------------------------------------------- */
  weekStartsOn: z.enum(["sunday","monday"]).default("monday"),
  dateFormat: z.enum(["dd-mmm-yyyy","yyyy-mm-dd","dd/mm/yyyy"]).default("dd-mmm-yyyy"),
  currency: z.string().min(1).max(8).default("INR"),
  /** Members' email and phone are masked in lists for anyone below admin. */
  maskMemberContact: z.boolean().default(false),

  /* ---------------------------------------------------------------- *
   * Extended appearance controls.
   * ---------------------------------------------------------------- */
  appearancePreset: z.enum(['gold','blue','violet','mint','rose']).default('gold'),
  appearanceScale: z.number().int().min(90).max(115).default(100),
  appearanceSpacing: z.number().int().min(85).max(130).default(100),
  appearanceRadius: z.number().int().min(80).max(140).default(100),
  appearanceShadow: z.number().int().min(40).max(140).default(100),
  appearanceDensity: z.enum(['compact','cozy','airy']).default('cozy'),
  appearanceCardStyle: z.enum(['elevated','flat','glass']).default('elevated'),
});
export type WorkspaceConfig=z.infer<typeof configSchema>;
export const DEFAULT_CONFIG=configSchema.parse({});
