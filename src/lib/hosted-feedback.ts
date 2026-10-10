/** Every hosted-class ticket type: the brand team's feedback form and the ops lead-capture
 *  record. Both are about a roster of real people, so both need a line per attendee. */
export function isHostedClassTicket(category: string, subcategory: string): boolean {
  return (category === 'Brand Feedback' && /hosted class/i.test(subcategory))
    || (category === 'Internal Operations & Admin' && /hosted class/i.test(subcategory));
}

/** Shared by intake, the legacy composer and the server creation path. */
export function hostedFeedbackError(category: string, subcategory: string, attendees: unknown): string | null {
  if (!isHostedClassTicket(category, subcategory)) return null;
  if (!Array.isArray(attendees) || !attendees.length) return 'Load the selected hosted class roster and add a comment for every member row.';
  for (const [index, value] of attendees.entries()) {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const name = typeof row.name === 'string' ? row.name.trim() : typeof row.attendee === 'string' ? row.attendee.trim() : '';
    if (!name) return `Add a member name for hosted class row ${index + 1}.`;
    const comment = typeof row.note === 'string' ? row.note : typeof row.comments === 'string' ? row.comments : '';
    if (!comment.trim()) return `Add a comment for ${name}. Every hosted class member row requires a comment.`;
    // Attendance is what the partnership review counts; a row without it is not a record.
    const attendance = typeof row.attendance === 'string' ? row.attendance.trim() : '';
    if ('attendance' in row && !attendance) return `Record attendance for ${name}.`;
  }
  return null;
}
