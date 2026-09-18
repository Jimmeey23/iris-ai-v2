
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

