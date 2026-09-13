import {z} from "zod";
import { CATEGORY_DEPARTMENT, CATEGORY_MAP, CLASS_FORMATS, MEMBERSHIPS, STUDIOS, TRAINERS } from "./constants";
export const configSchema = z.object({
  workspaceName: z.string().min(2).max(80).default("Physique 57 India"), timezone: z.string().refine(v=>{try{new Intl.DateTimeFormat("en",{timeZone:v});return true;}catch{return false;}},"Choose a valid IANA timezone").default("Asia/Kolkata"),
  defaultTheme: z.enum(["light","dark"]).default("dark"), defaultView: z.enum(["list","board","cards"]).default("list"),
  pollSeconds: z.number().min(5).max(120).default(15), aiEnabled: z.boolean().default(true), aiModel: z.string().max(80).default("gpt-4o-mini"),
  aiVoice: z.string().max(1200).default("Warm, attentive and concise. Personalise using the member's first name occasionally, not every turn. Never echo the member's answers. Ask exactly one missing question. No invented policies or promises."),
  historyRetrieval: z.boolean().default(true), autoTag: z.boolean().default(true), autoAssign: z.boolean().default(true), positiveNoSla: z.boolean().default(true),
  responseHours: z.object({critical:z.number().min(1).max(720).default(1),high:z.number().min(1).max(720).default(4),medium:z.number().min(1).max(720).default(24),low:z.number().min(1).max(720).default(72)}).default({critical:1,high:4,medium:24,low:72}),
  categoryDepartments: z.record(z.string(),z.string()).default(CATEGORY_DEPARTMENT), routingOwners: z.record(z.string(),z.number().int().positive()).default({}),
  taxonomy: z.record(z.string(),z.array(z.string().min(1))).default(CATEGORY_MAP), studios:z.array(z.string()).default(STUDIOS.map(s=>s.name)), trainers:z.array(z.string()).default([...TRAINERS]), formats:z.array(z.string()).default([...CLASS_FORMATS]), memberships:z.array(z.string()).default([...MEMBERSHIPS]),
  webhookOnCreate:z.boolean().default(false), assignmentEmail:z.boolean().default(false),
});
export type WorkspaceConfig=z.infer<typeof configSchema>;
export const DEFAULT_CONFIG=configSchema.parse({});
