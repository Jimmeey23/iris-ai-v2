/**
 * The parts of the feedback contract the browser needs: the option lists, their
 * wording and the attachment limits. Kept apart from lib/feedback.ts so the client
 * bundle does not pull in the database, the mail provider or their dependencies.
 */
export const FEEDBACK_KINDS = ['bug', 'visual', 'performance', 'idea', 'content', 'other'] as const;
export const FEEDBACK_SEVERITIES = ['blocker', 'high', 'normal', 'low'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

export const KIND_LABELS: Record<FeedbackKind, string> = {
  bug: 'Something is broken',
  visual: 'Looks wrong',
  performance: 'Too slow',
  idea: 'Idea / request',
  content: 'Wrong wording or data',
  other: 'Something else',
};
export const SEVERITY_LABELS: Record<FeedbackSeverity, string> = {
  blocker: 'Blocker — I cannot work',
  high: 'High — painful workaround',
  normal: 'Normal',
  low: 'Low — cosmetic',
};

/** Per file, and for everything attached to one report. The server enforces both;
 *  the browser checks them too so a 25MB video fails instantly rather than after
 *  a long upload. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 8;
