import {z} from 'zod';
export const ticketInputSchema=z.object({
  title:z.string().max(240).optional(), summary:z.string().max(1000).optional(), description:z.string().min(12,'Describe what happened in at least 12 characters.').max(20000),
  category:z.string().min(1),subcategory:z.string().min(1),kind:z.enum(['issue','request','compliment','feedback','assessment']).default('issue'),studio:z.string().min(1),
  memberName:z.string().min(2).max(120),memberEmail:z.union([z.string().email(),z.literal('')]).optional(),memberPhone:z.string().max(30).optional(),momenceMemberId:z.string().optional(),momenceSessionId:z.string().optional(),
  classFormat:z.string().max(160).optional(),trainer:z.string().max(160).optional(),membership:z.string().max(200).optional(),incidentAt:z.string().min(1),preferredContact:z.string().max(50).default('Email'),
  requestedResolution:z.string().max(2000).optional(),priority:z.enum(['critical','high','medium','low']).optional(),sentiment:z.enum(['positive','neutral','frustrated','negative']).default('neutral'),impact:z.string().max(2000).optional(),
  customFields:z.record(z.string(),z.unknown()).default({}),momenceContext:z.record(z.string(),z.unknown()).optional(),templateId:z.string().optional(),source:z.enum(['iris','template','manual','voice','fillout','history','system']).default('manual'),
  submissionKey:z.string().min(12).max(200).optional(),
});
export type TicketInput=z.infer<typeof ticketInputSchema>;
export type AdvancedDraft=TicketInput&{title:string;summary:string;priority:'critical'|'high'|'medium'|'low';severity:string;assignedStaffId:number|null;assignedStaffName:string;assignedStaffEmail:string;assignedStaffRole:string;departmentId:string;departmentName:string;slaHours:number;slaLabel:string;resolutionRequired:boolean;tags:string[];opsChecklist:string[];memberFacingUpdate:string;internalBrief:string;routingReason:string;};
export type TicketRecord=AdvancedDraft&{id:number;ticketNumber:string;status:string;createdAt:string;updatedAt:string;slaDueAt:string|null;resolvedAt:string|null;version:number;isEscalated:boolean;};
export type PickerModule='members'|'sessions'|'trainers'|'studios'|'formats'|'memberships';
export type StructuredField={id:string;label:string;type:'text'|'textarea'|'number'|'datetime-local'|'select'|'rating'|'multiselect';required?:boolean;options?:string[];section?:string;weight?:number;dependsOn?:string;dependsOnValue?:string;module?:PickerModule;multi?:boolean;helper?:string};
export type GuidedTemplate={id:string;title:string;description:string;category:string;subcategory:string;kind:TicketInput['kind'];featured?:boolean;icon:string;fields:StructuredField[];provenance?:string;classContext?:boolean;};
export type PickerOption={id:string;label:string;sublabel?:string;meta?:Record<string,unknown>};
