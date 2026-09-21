import type {IntakeField, IntakeSubMeta} from '@/lib/intake/plan';

export type IntakeOwner = {name: string; role: string} | null;
export type IntakeSubSummary = {name: string; priority: 'critical' | 'high' | 'medium' | 'low'; slaHours: number; fieldCount: number; requiredCount: number; hist: number; hubPriority: string | null};
export type IntakeCategory = {
  name: string;
  department: {id: string; name: string};
  owner: IntakeOwner;
  hubDepartment: string | null;
  owners: {mumbai: string; bengaluru: string; l1: string; l2: string} | null;
  subs: IntakeSubSummary[];
};
export type IntakeTaxonomy = {
  categories: IntakeCategory[];
  responseHours: Record<'critical' | 'high' | 'medium' | 'low', number>;
  positiveNoSla: boolean;
  studios: string[]; formats: string[]; trainers: string[]; memberships: string[];
  momence: {configured: boolean};
  reporter: {name: string; email: string} | null;
  plan: {repo: string; commit: string; generatedAt: string};
};
export type IntakePlan = {
  fields: IntakeField[];
  sub: IntakeSubMeta;
  routing: {departmentId: string; departmentName: string; owner: IntakeOwner; autoAssign: boolean} | null;
  reporter: {name: string; email: string} | null;
};
