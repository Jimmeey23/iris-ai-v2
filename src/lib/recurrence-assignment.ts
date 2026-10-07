export type RecurrenceOwner = {id: number | null; name: string | null; email: string | null};
/** Studio verification belongs to the original reporter for AC/bike repairs.
 * Missing reporter mappings stay unassigned; never silently use the repair owner. */
export function recurrenceOwner(kind: 'bike' | 'ac' | 'mic', originalOwner: RecurrenceOwner, reporter: RecurrenceOwner | null): RecurrenceOwner {
  if (kind === 'mic') return originalOwner;
  return reporter ?? {id: null, name: 'Unassigned — original reporter needs a staff profile', email: null};
}
