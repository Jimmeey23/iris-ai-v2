/** Shared by intake, the legacy composer and the server creation path. */
export function hostedFeedbackError(category: string, subcategory: string, attendees: unknown): string | null {
  if (category !== 'Brand Feedback' || !/hosted class/i.test(subcategory)) return null;
  if (!Array.isArray(attendees) || !attendees.length) return 'Load the selected hosted class roster and add a comment for every member row.';
  for (const [index, value] of attendees.entries()) {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const name = typeof row.name === 'string' ? row.name.trim() : typeof row.attendee === 'string' ? row.attendee.trim() : '';
    if (!name) return `Add a member name for hosted class row ${index + 1}.`;
    const comment = typeof row.note === 'string' ? row.note : typeof row.comments === 'string' ? row.comments : '';
    if (!comment.trim()) return `Add a comment for ${name}. Every hosted class member row requires a comment.`;
  }
  return null;
}
