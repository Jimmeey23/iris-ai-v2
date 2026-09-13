export type TicketStatus =
  | "new"
  | "triaged"
  | "assigned"
  | "in_progress"
  | "waiting_on_member"
  | "waiting_on_vendor"
  | "resolved"
  | "closed";

export type TicketPriority = "low" | "medium" | "high" | "critical";

export type ChatOption = {
  id: string;
  label: string;
  value: string;
  hint?: string;
};

export type IntakeFieldType =
  | "choice"
  | "text"
  | "email"
  | "phone"
  | "date"
  | "longtext";

export type IntakeField = {
  key: string;
  label: string;
  prompt: string;
  type: IntakeFieldType;
  required: boolean;
  allowOther?: boolean;
  options?: ChatOption[];
  helper?: string;
};

export type CollectedTicket = {
  narrative?: string;
  category?: string;
  subcategory?: string;
  studio?: string;
  classFormat?: string;
  trainer?: string;
  membership?: string;
  incidentAt?: string;
  memberName?: string;
  memberEmail?: string;
  memberPhone?: string;
  momenceMemberId?: string;
  preferredContact?: string;
  requestedResolution?: string;
  priority?: TicketPriority;
  severity?: string;
  sentiment?: string;
  impact?: string;
  area?: string;
  systemName?: string;
  itemDescription?: string;
  lastSeen?: string;
  isClassImpacted?: string;
  isImmediateDanger?: string;
  alreadyReported?: string;
  channelOfIssue?: string;
  staffInvolved?: string;
  amount?: string;
  extraNotes?: string;
  [key: string]: unknown;
};

export type TicketDraft = {
  title: string;
  summary: string;
  description: string;
  category: string;
  subcategory: string;
  studio: string;
  classFormat?: string;
  trainer?: string;
  membership?: string;
  incidentAt?: string;
  memberName: string;
  memberEmail?: string;
  memberPhone?: string;
  momenceMemberId?: string;
  preferredContact?: string;
  requestedResolution?: string;
  priority: TicketPriority;
  severity: string;
  sentiment?: string;
  tags: string[];
  customFields: Record<string, unknown>;
  assignedStaffId: number;
  assignedStaffName: string;
  assignedStaffEmail: string;
  assignedStaffRole: string;
  departmentId: string;
  departmentName: string;
  slaHours: number;
  slaLabel: string;
  memberFacingUpdate: string;
  internalBrief: string;
  opsChecklist: string[];
  momenceContext?: Record<string, unknown>;
};

export type IrisTurnResponse = {
  sessionId: string;
  assistantMessage: string;
  inputMode: "text" | "buttons" | "draft" | "complete";
  options: ChatOption[];
  allowFreeText: boolean;
  placeholder?: string;
  fieldKey?: string;
  draft?: TicketDraft;
  collected: CollectedTicket;
  progress: { step: number; total: number; label: string };
  phase: string;
  insights?: string[];
  ticket?: { id: number; ticketNumber: string };
};
