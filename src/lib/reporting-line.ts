/** Resolve the staff directory's name/id reporting line without granting ambiguous matches. */
export type ReportingStaff = {id: number; externalId: string | null; name: string; manager: string | null; isActive: boolean};
export function reportingManagerId(manager: string | null, directory: ReportingStaff[]): number | null {
  const key = manager?.trim().toLowerCase();
  if (!key) return null;
  const active = directory.filter(person => person.isActive);
  const unique = (people: ReportingStaff[]) => people.length === 1 ? people[0].id : null;
  if (/^\d{1,9}$/.test(key)) {
    const ids = active.filter(person => person.id === Number(key) || person.externalId === key);
    if (ids.length) return unique(ids);
  }
  const exact = active.filter(person => person.name.trim().toLowerCase() === key);
  if (exact.length) return unique(exact);
  // Only a first-name-only value permits a shortened match. A misspelled full name
  // must not accidentally grant access to a different person with the same first name.
  if (/\s/.test(key)) return null;
  return unique(active.filter(person => person.name.trim().split(/\s+/)[0].toLowerCase() === key));
}
export function directReportIds(staffId: number, directory: ReportingStaff[]): number[] {
  return directory.filter(person => person.isActive && person.id !== staffId && reportingManagerId(person.manager, directory) === staffId).map(person => person.id);
}
