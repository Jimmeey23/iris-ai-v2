/**
 * The staff directory seed: names, work emails, roles and the categories each person covers.
 *
 * Server-only. It carries every staff member's email, so it must never be imported by a
 * 'use client' module — client surfaces read the directory from /api/staff, which serves the
 * live table. (The `server-only` package is not installed; this comment is the guard.)
 */
import { CATEGORY_DEPARTMENT, DEPARTMENT_RECORDS, type StaffRecord } from "./constants";
import { studioIdsFor, studioRegion } from "./routing";

export const STAFF: StaffRecord[] = [
  {
    id: 1,
    externalId: "accounts-physique57mumbai-com",
    name: "Sagar Ingole",
    email: "accounts@physique57mumbai.com",
    role: "Associate",
    department: "Operations",
    location: "Physique 57, Mumbai",
    manager: "Zahur Shaikh",
    studioId: 1,
    categories: [
      "Scheduling",
      "Repair and Maintenance",
      "Studio Amenities and Facilities",
      "Operating Systems",
      "Tech Issues",
      "Theft and Lost Items",
      "Miscellaneous",
      "Internal Operations & Admin",
    ],
    avatarColor: "#ec4899",
    isActive: true,
  },
  {
    id: 2,
    externalId: "akshay-physique57mumbai-com",
    name: "Akshay Rane",
    email: "akshay@physique57mumbai.com",
    role: "Sr. Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Mumbai",
    manager: "Jimmeey Gondaa",
    studioId: 1,
    categories: ["Customer Service and Communication"],
    avatarColor: "#0ea5e9",
    isActive: true,
  },
  {
    id: 3,
    externalId: "anisha-physique57india-com",
    name: "Anisha Shah",
    email: "anisha@physique57india.com",
    role: "Master Trainer",
    department: "Training",
    location: "India",
    manager: "Mallika Parekh",
    studioId: null,
    categories: ["Class Experience", "Trainer Feedback"],
    avatarColor: "#14b8a6",
    isActive: true,
  },
  {
    id: 4,
    externalId: "api-physique57bengaluru-com",
    name: "Api Serou",
    email: "api@physique57bengaluru.com",
    role: "Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Bengaluru",
    manager: "Shifa Ali",
    studioId: 3,
    categories: ["Customer Service and Communication"],
    avatarColor: "#ec4899",
    isActive: true,
  },
  {
    id: 5,
    externalId: "deesha-physique57mumbai-com",
    name: "Deesha Changwani",
    email: "deesha@physique57mumbai.com",
    role: "Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Bandra",
    manager: "Jimmeey Gondaa",
    studioId: 2,
    categories: ["Customer Service and Communication"],
    avatarColor: "#14b8a6",
    isActive: true,
  },
  {
    id: 6,
    externalId: "gaurav-physique57mumbai-com",
    name: "Gaurav Sogam",
    email: "gaurav@physique57mumbai.com",
    role: "Accounts Assistant",
    department: "Accounts",
    location: "Physique 57, Mumbai",
    manager: "Sachin Nalawade",
    studioId: 1,
    categories: ["Pricing and Memberships"],
    avatarColor: "#3b82f6",
    isActive: true,
  },
  {
    id: 7,
    externalId: "imran-physique57mumbai-com",
    name: "Imran Shaikh",
    email: "imran@physique57mumbai.com",
    role: "Sr. Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Bandra",
    manager: "Jimmeey Gondaa",
    studioId: 2,
    categories: ["Customer Service and Communication"],
    avatarColor: "#a855f7",
    isActive: true,
  },
  {
    id: 8,
    externalId: "jhanavi-physique57india-com",
    name: "Jhanvi Chhaya",
    email: "Jhanavichhaya11@gmail.com",
    role: "Social Media",
    department: "Marketing",
    location: "Physique 57, India",
    manager: "Reyna",
    studioId: null,
    categories: ["Brand Feedback"],
    avatarColor: "#a855f7",
    isActive: true,
  },
  {
    id: 9,
    externalId: "jimmeey-physique57india-com",
    name: "Jimmeey Gondaa",
    email: "jimmeey@physique57india.com",
    role: "Head of Sales & Client Servicing",
    department: "Sales & Client Servicing",
    location: "India",
    manager: "Mitali Kumar",
    studioId: null,
    categories: ["Customer Service and Communication"],
    avatarColor: "#3b82f6",
    isActive: true,
  },
  {
    id: 10,
    externalId: "mallika-physique57india-com",
    name: "Mallika Parekh",
    email: "mallika@physique57india.com",
    role: "Owner",
    department: "Management",
    location: "India",
    manager: "Board",
    studioId: null,
    categories: ["Safety and Security"],
    avatarColor: "#a855f7",
    isActive: true,
  },
  {
    id: 11,
    externalId: "mitali-physique57india-com",
    name: "Mitali Kumar",
    email: "mitali@physique57india.com",
    role: "Chief Operations Officer",
    department: "Management",
    location: "India",
    manager: "Mallika Parekh",
    studioId: null,
    categories: ["Safety and Security"],
    avatarColor: "#3b82f6",
    isActive: true,
  },
  {
    id: 12,
    externalId: "mrigakshi-physique57mumbai-com",
    name: "Mrigakshi Jaiswal",
    email: "mrigakshi@physique57mumbai.com",
    role: "Head Trainer",
    department: "Training",
    location: "Mumbai",
    manager: "Anisha Shah",
    studioId: 1,
    categories: ["Class Experience", "Trainer Feedback"],
    avatarColor: "#a855f7",
    isActive: true,
  },
  {
    id: 13,
    externalId: "nadiya-physique57mumbai-com",
    name: "Nadiya Shaikh",
    email: "nadiya@physique57mumbai.com",
    role: "Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Mumbai",
    manager: "Jimmeey Gondaa",
    studioId: 1,
    categories: ["Customer Service and Communication"],
    avatarColor: "#10b981",
    isActive: true,
  },
  {
    id: 14,
    externalId: "prathap-physique57bengaluru-com",
    name: "Prathap K P",
    email: "prathap@physique57bengaluru.com",
    role: "Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Bengaluru",
    manager: "Shifa Ali",
    studioId: 3,
    categories: ["Customer Service and Communication"],
    avatarColor: "#10b981",
    isActive: true,
  },
  {
    id: 15,
    externalId: "pujal-physique57mumbai-com",
    name: "Pujal Jathar",
    email: "pujal@physique57mumbai.com",
    role: "Sr. Finance & Accounts Executive",
    department: "Accounts",
    location: "Physique 57, Bengaluru",
    manager: "Sachin Nalawade",
    studioId: 3,
    categories: ["Pricing and Memberships"],
    avatarColor: "#ec4899",
    isActive: true,
  },
  {
    id: 16,
    externalId: "pushyank-physique57bengaluru-com",
    name: "Pushyank Nahar",
    email: "pushyank@physique57bengaluru.com",
    role: "Head Trainer",
    department: "Training",
    location: "Bengaluru",
    manager: "Anisha Shah",
    studioId: 3,
    categories: ["Class Experience", "Trainer Feedback"],
    avatarColor: "#f59e0b",
    isActive: true,
  },
  {
    id: 17,
    externalId: "rasika-physique57mumbai-com",
    name: "Rasika Kalambe",
    email: "rasika@physique57mumbai.com",
    role: "Accounts Executive",
    department: "Accounts",
    location: "Physique 57, Bengaluru",
    manager: "Sachin Nalawade",
    studioId: 3,
    categories: ["Pricing and Memberships"],
    avatarColor: "#8b5cf6",
    isActive: true,
  },
  {
    id: 18,
    externalId: "reyna-physique57india-com",
    name: "Reyna Jagtiani",
    email: "jagtianireyna@gmail.com",
    role: "Marketing Lead",
    department: "Marketing",
    location: "Physique 57, India",
    manager: "Mitali Kumar",
    studioId: null,
    categories: ["Brand Feedback"],
    avatarColor: "#a855f7",
    isActive: true,
  },
  {
    id: 19,
    externalId: "saachi-physique57india-com",
    name: "Saachi Shetty",
    email: "saachi@physique57india.com",
    role: "Ops Manager",
    department: "Operations",
    location: "India",
    manager: "Mitali Kumar",
    studioId: null,
    categories: [
      "Scheduling",
      "Repair and Maintenance",
      "Studio Amenities and Facilities",
      "Operating Systems",
      "Tech Issues",
      "Theft and Lost Items",
      "Miscellaneous",
      "Internal Operations & Admin",
    ],
    avatarColor: "#ef4444",
    isActive: true,
  },
  {
    id: 20,
    externalId: "saachi-s-physique57bengaluru-com",
    name: "Saachi Shetty Jr",
    email: "saachi.s@physique57bengaluru.com",
    role: "Marketing Lead",
    department: "Marketing",
    location: "Bengaluru",
    manager: "Shifa Ali",
    studioId: 3,
    categories: ["Brand Feedback"],
    avatarColor: "#0ea5e9",
    isActive: true,
  },
  {
    id: 21,
    externalId: "sachin-physique57mumbai-com",
    name: "Sachin Nalawade",
    email: "sachin@physique57mumbai.com",
    role: "Accounts Head",
    department: "Accounts",
    location: "Physique 57, India",
    manager: "Mitali Kumar",
    studioId: null,
    categories: ["Pricing and Memberships"],
    avatarColor: "#3b82f6",
    isActive: true,
  },
  {
    id: 22,
    externalId: "sashi-physique57bengaluru-com",
    name: "Sashi Singh",
    email: "sashi@physique57bengaluru.com",
    role: "Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Bengaluru",
    manager: "Shifa Ali",
    studioId: 3,
    categories: ["Customer Service and Communication"],
    avatarColor: "#14b8a6",
    isActive: true,
  },
  {
    id: 23,
    externalId: "sheetal-physique57mumbai-com",
    name: "Sheetal Kataria",
    email: "sheetal@physique57mumbai.com",
    role: "Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Mumbai",
    manager: "Jimmeey Gondaa",
    studioId: 1,
    categories: ["Customer Service and Communication"],
    avatarColor: "#ec4899",
    isActive: true,
  },
  {
    id: 24,
    externalId: "shifa-physique57bengaluru-com",
    name: "Shifa Ali",
    email: "shifa@physique57bengaluru.com",
    role: "Regional Head of Ops - South",
    department: "Operations",
    location: "Bengaluru",
    manager: "Mitali Kumar",
    studioId: 3,
    categories: [
      "Scheduling",
      "Repair and Maintenance",
      "Studio Amenities and Facilities",
      "Operating Systems",
      "Tech Issues",
      "Theft and Lost Items",
      "Miscellaneous",
      "Internal Operations & Admin",
    ],
    avatarColor: "#0ea5e9",
    isActive: true,
  },
  {
    id: 25,
    externalId: "shipra-physique57mumbai-com",
    name: "Shipra Pinge",
    email: "shipra@physique57mumbai.com",
    role: "Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Bandra",
    manager: "Jimmeey Gondaa",
    studioId: 2,
    categories: ["Customer Service and Communication"],
    avatarColor: "#8b5cf6",
    isActive: true,
  },
  {
    id: 26,
    externalId: "tahira-physique57mumbai-com",
    name: "Taahira Sayyed",
    email: "tahira@physique57mumbai.com",
    role: "Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Mumbai",
    manager: "Jimmeey Gondaa",
    studioId: 1,
    categories: ["Customer Service and Communication"],
    avatarColor: "#0ea5e9",
    isActive: true,
  },
  {
    id: 27,
    externalId: "vahishta-physique57mumbai-com",
    name: "Vahishta Fitter",
    email: "vahishta@physique57mumbai.com",
    role: "Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Mumbai",
    manager: "Jimmeey Gondaa",
    studioId: 1,
    categories: ["Customer Service and Communication"],
    avatarColor: "#10b981",
    isActive: true,
  },
  {
    id: 28,
    externalId: "vivaran-physique57mumbai-com",
    name: "Vivaran Dhasmana",
    email: "vivaran@physique57mumbai.com",
    role: "Head Trainer",
    department: "Training",
    location: "Mumbai",
    manager: "Anisha Shah",
    studioId: 1,
    categories: ["Class Experience", "Trainer Feedback"],
    avatarColor: "#a855f7",
    isActive: true,
  },
  {
    id: 29,
    externalId: "yashas-physique57bengaluru-com",
    name: "Yashas K",
    email: "yashas@physique57bengaluru.com",
    role: "Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Bengaluru",
    manager: "Shifa Ali",
    studioId: 3,
    categories: ["Customer Service and Communication"],
    avatarColor: "#f59e0b",
    isActive: true,
  },
  {
    id: 30,
    externalId: "zaheer-physique57mumbai-com",
    name: "Zaheer Agarbattiwala",
    email: "zaheer@physique57mumbai.com",
    role: "Sales & Client Servicing Associate",
    department: "Sales & Client Servicing",
    location: "Physique 57, Mumbai",
    manager: "Jimmeey Gondaa",
    studioId: 1,
    categories: ["Customer Service and Communication"],
    avatarColor: "#8b5cf6",
    isActive: true,
  },
  {
    id: 31,
    externalId: "zahur-physique57mumbai-com",
    name: "Zahur Shaikh",
    email: "zahur@physique57mumbai.com",
    role: "Studio Coordinator",
    department: "Operations",
    location: "Physique 57, Mumbai",
    manager: "Saachi Shetty",
    studioId: 1,
    categories: [
      "Scheduling",
      "Repair and Maintenance",
      "Studio Amenities and Facilities",
      "Operating Systems",
      "Tech Issues",
      "Theft and Lost Items",
      "Miscellaneous",
      "Internal Operations & Admin",
    ],
    avatarColor: "#3b82f6",
    isActive: true,
  },
];

function scoreStaff(person: StaffRecord, category: string, studioName?: string) {
  let score = 0;
  if (!person.isActive) return -1000;
  if (person.categories.includes(category)) score += 12;
  // Keyed on the studio itself: studioIdsFor gives an id only to the studio that owns it, so a
  // Kwality House associate is not "on site" for a Courtside ticket just because both carry 1.
  const ids = studioIdsFor(studioName);
  if (person.studioId && ids.includes(person.studioId)) score += 10;
  const region = studioRegion(studioName);
  if (region && person.location.toLowerCase().includes(region.toLowerCase())) score += 6;
  if (person.location === "India") score += 1;
  if (person.role.toLowerCase().includes("head")) score += 2;
  if (person.role.toLowerCase().includes("coordinator")) score += 3;
  if (category === "Safety and Security" && person.role === "Chief Operations Officer") score += 8;
  if (category === "Safety and Security" && person.role === "Owner") score += 4;
  if (
    (category === "Class Experience" || category === "Trainer Feedback") &&
    person.role === "Head Trainer"
  ) {
    score += 5;
  }
  return score;
}

/** Owner for a seeded ticket, from the static directory. Live tickets route through
 *  resolveRouting in lib/tickets.ts against the staff table. */
/**
 * Who a new joiner in each department reports to.
 *
 * Derived from the directory rather than written out again: the head of a department is the
 * person in it whom nobody else in it manages. That way a promotion or a transfer updates
 * this by updating the directory, which is the only place anybody maintains.
 */
export function departmentHeads(): Record<string, string> {
  const byDept = new Map<string, StaffRecord[]>();
  for (const person of STAFF) {
    if (person.isActive === false) continue;
    byDept.set(person.department, [...(byDept.get(person.department) || []), person]);
  }
  const heads: Record<string, string> = {};
  const seniority = /owner|chief|head|lead|manager|principal/i;
  for (const [dept, people] of byDept) {
    // Ranked rather than picked: several people in a department can report outside it, so
    // "reports outside" alone chose whoever happened to be listed first. The head is the
    // one others actually report to, with the job title as the tie-break.
    const reports = (name: string) => people.filter(p => p.manager === name).length;
    const scored = [...people].sort((a, b) =>
      reports(b.name) - reports(a.name) ||
      Number(seniority.test(b.role)) - Number(seniority.test(a.role)) ||
      a.name.localeCompare(b.name));
    if (scored[0]) heads[dept] = scored[0].name;
  }
  return heads;
}

/** The manager to offer a new joiner in `department`, or an empty string when unknown. */
export function reportingManagerFor(department: string): string {
  return departmentHeads()[department] || '';
}

export function assignTicket(category: string, studioName?: string) {
  const departmentId = CATEGORY_DEPARTMENT[category] ?? "operations";
  const department = DEPARTMENT_RECORDS.find((d) => d.id === departmentId);
  const ranked = [...STAFF]
    .map((person) => ({ person, score: scoreStaff(person, category, studioName) }))
    .filter((row) => row.score > 0 && row.person.categories.includes(category))
    .sort((a, b) => b.score - a.score);

  const chosen = ranked[0]?.person ?? STAFF.find((s) => s.id === 19)!;
  return {
    staff: chosen,
    departmentId,
    departmentName: department?.name ?? chosen.department,
  };
}
