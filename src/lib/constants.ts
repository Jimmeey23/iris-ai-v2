
/** `momenceLocationId` is the live Momence `inPersonLocation.id`, verified against the API.
 *  Momence hosts four locations; Kenkere House and Copper & Cloves are not among them, so
 *  they carry `null` and session lookups for those studios stay unfiltered rather than empty.
 *
 *  `studioIds` are the legacy directory ids staff records carry (`StaffRecord.studioId`), not
 *  unique per studio: Courtside shares 1 with Kwality House and Copper & Cloves shares 3 with
 *  Kenkere House. Anything telling studios apart must key on the studio name — routing does. */
export const STUDIOS = [
  {
    id: "kwality",
    name: "Kwality House, Kemps Corner",
    city: "Mumbai",
    region: "Mumbai",
    studioIds: [1],
    momenceLocationId: 9030,
    address: "Kwality House, Kemps Corner, Mumbai",
  },
  {
    id: "supreme",
    name: "Supreme HQ, Bandra",
    city: "Mumbai",
    region: "Bandra",
    studioIds: [2],
    momenceLocationId: 29821,
    address: "Supreme HQ, Bandra, Mumbai",
  },
  {
    id: "kenkere",
    name: "Kenkere House, Bengaluru",
    city: "Bengaluru",
    region: "Bengaluru",
    studioIds: [3],
    momenceLocationId: null,
    address: "Kenkere House, Bengaluru",
  },
  {
    id: "courtside",
    name: "Courtside, Mumbai",
    city: "Mumbai",
    region: "Mumbai",
    studioIds: [1],
    momenceLocationId: 181416,
    address: "Courtside, Mumbai",
  },
  {
    id: "copper",
    name: "the Studio by Copper & Cloves, Bengaluru",
    city: "Bengaluru",
    region: "Bengaluru",
    studioIds: [3],
    momenceLocationId: null,
    address: "the Studio by Copper & Cloves, Bengaluru",
  },
] as const;

export const CLASS_FORMATS = [
  "Studio Hosted Class",
  "Studio FIT",
  "Studio Back Body Blaze",
  "Studio Barre 57",
  "Studio Mat 57",
  "Studio Trainer's Choice",
  "Studio Cardio Barre Express",
  "Studio Amped Up!",
  "Studio HIIT",
  "Studio Foundations",
  "Studio SWEAT In 30",
  "Studio Cardio Barre Plus",
  "Studio Barre 57 Express",
  "Studio Cardio Barre",
  "Studio Back Body Blaze Express",
  "Studio Recovery",
  "Studio Pre/Post Natal",
  "Studio Mat 57 Express",
  "Studio PowerCycle",
  "Studio PowerCycle Express",
  "Studio Strength Lab (Full Body)",
  "Studio Strength Lab (Pull)",
  "Studio Strength Lab (Push)",
  "Studio Strength Lab",
] as const;

export const STUDIO_AREAS = [
  "Main studio floor",
  "Reception / lobby",
  "Locker room",
  "Showers / washroom",
  "Member lounge",
  "Boutique",
  "Parking / valet",
  "Back office",
  "Staircase / corridor",
  "Cycle studio",
  "Strength Lab floor",
  // Studio-specific designated rooms & spaces
  "Studio 1",
  "Studio 2",
  "Strength Studio",
  "PowerCycle Studio",
  "His Space",
  "Her Space",
  "GUEST WASHROOM",
  "Brain Cell",
  "Pantry",
  "Lockers & Changing",
  "Washrooms",
  "Washroom & Changing",
  "Strength Lab",
  "Barre Studio",
  "Front Desk",
] as const;

export type StudioRoom = {
  name: string;
  capacity?: number;
  category: "studio" | "washroom" | "workspace" | "common";
  description: string;
};

export const STUDIO_LAYOUTS: Record<string, { studioName: string; rooms: StudioRoom[] }> = {
  kwality: {
    studioName: "Kwality House, Kemps Corner",
    rooms: [
      { name: "Studio 1", capacity: 22, category: "studio", description: "Studio 1 (capacity: 22 pax)" },
      { name: "Studio 2", capacity: 13, category: "studio", description: "Studio 2 (capacity: 13 pax)" },
      { name: "Strength Studio", capacity: 7, category: "studio", description: "Strength Studio (capacity: 7 pax)" },
      { name: "PowerCycle Studio", capacity: 10, category: "studio", description: "PowerCycle Studio (capacity: 10 pax)" },
      { name: "His Space", category: "washroom", description: "His Space (men's washroom & changing)" },
      { name: "Her Space", category: "washroom", description: "Her Space (women's washroom & changing)" },
      { name: "GUEST WASHROOM", category: "washroom", description: "Guest Washroom" },
      { name: "Brain Cell", category: "workspace", description: "Brain Cell (office space)" },
      { name: "Pantry", category: "workspace", description: "Pantry (staff kitchen)" },
      { name: "Lobby / Reception", category: "common", description: "Lobby & Reception desk" },
    ],
  },
  supreme: {
    studioName: "Supreme HQ, Bandra",
    rooms: [
      { name: "Strength Lab", capacity: 10, category: "studio", description: "Strength Lab (capacity: 10 pax)" },
      { name: "PowerCycle Studio", capacity: 13, category: "studio", description: "PowerCycle Studio (capacity: 13 pax)" },
      { name: "Barre Studio", capacity: 22, category: "studio", description: "Barre Studio (capacity: 22 pax)" },
      { name: "Brain Cell", category: "workspace", description: "Brain Cell (office space)" },
      { name: "Her Space", category: "washroom", description: "Her Space (women's washroom & changing)" },
      { name: "His Space", category: "washroom", description: "His Space (men's washroom & changing)" },
      { name: "Front Desk", category: "common", description: "Front desk & reception" },
      { name: "Pantry", category: "workspace", description: "Pantry (staff kitchen)" },
      { name: "Boutique", category: "common", description: "Retail boutique" },
    ],
  },
  kenkere: {
    studioName: "Kenkere House, Bengaluru",
    rooms: [
      { name: "Studio 1", capacity: 13, category: "studio", description: "Studio 1 (capacity: 13 pax)" },
      { name: "Studio 2", capacity: 13, category: "studio", description: "Studio 2 (capacity: 13 pax)" },
      { name: "Lobby / Reception", category: "common", description: "Lobby & Reception desk" },
      { name: "Washroom & Changing", category: "washroom", description: "Washrooms & changing area" },
    ],
  },
  courtside: {
    studioName: "Courtside, Mumbai",
    rooms: [
      { name: "Main Studio Floor", category: "studio", description: "Main studio floor" },
      { name: "Reception / Lobby", category: "common", description: "Reception & check-in" },
      { name: "Member Lounge", category: "common", description: "Member lounge" },
    ],
  },
  copper: {
    studioName: "the Studio by Copper & Cloves, Bengaluru",
    rooms: [
      { name: "Main Studio Floor", category: "studio", description: "Main studio floor" },
      { name: "Reception", category: "common", description: "Reception" },
      { name: "Changing Area", category: "washroom", description: "Changing area & washroom" },
    ],
  },
};

export function getStudioRoomsForStudio(studioNameOrId?: string): StudioRoom[] {
  if (!studioNameOrId) {
    const all: StudioRoom[] = [];
    for (const s of Object.values(STUDIO_LAYOUTS)) {
      for (const r of s.rooms) {
        if (!all.some((x) => x.name === r.name)) all.push(r);
      }
    }
    return all;
  }
  const low = studioNameOrId.toLowerCase();
  if (low.includes("kwality") || low.includes("kemps")) return STUDIO_LAYOUTS.kwality.rooms;
  if (low.includes("supreme") || low.includes("bandra") || low.includes("shq")) return STUDIO_LAYOUTS.supreme.rooms;
  if (low.includes("kenkere") || low.includes("indiranagar")) return STUDIO_LAYOUTS.kenkere.rooms;
  if (low.includes("courtside")) return STUDIO_LAYOUTS.courtside.rooms;
  if (low.includes("copper") || low.includes("cloves")) return STUDIO_LAYOUTS.copper.rooms;
  return STUDIO_LAYOUTS.kwality.rooms;
}

/** How the floor team actually says it, mapped to the room name on the room plan.
 *  Without this the same room is filed under two spellings — "Cycle studio" and
 *  "PowerCycle Studio" — and every report, filter and branch that keys off the name
 *  (including the PowerCycle bike intake) only ever sees half of them. */
export const AREA_ALIASES: Record<string, string> = {
  "cycle studio": "PowerCycle Studio",
  "spin studio": "PowerCycle Studio",
  "cycle room": "PowerCycle Studio",
  "strength lab floor": "Strength Studio",
  "main floor": "Main studio floor",
  "reception": "Reception / lobby",
  "reception / lobby": "Reception / lobby",
  "locker rooms": "Locker room",
  "changing room": "Lockers & Changing",
  "changing rooms": "Lockers & Changing",
  "washroom": "Washrooms",
  "gents": "His Space",
  "ladies": "Her Space",
};

/** Areas every site has, offered in addition to the rooms that studio's own plan lists. */
const COMMON_STUDIO_AREAS = [
  "Main studio floor",
  "Reception / lobby",
  "Locker room",
  "Showers / washroom",
  "Member lounge",
  "Boutique",
  "Parking / valet",
  "Back office",
  "Staircase / corridor",
] as const;

/** True for a string that names a site we hold a room plan for. `getStudioRoomsForStudio`
 *  silently falls back to the Kwality plan for anything else, so it cannot be used to
 *  decide whether a plan was actually found. */
const HAS_ROOM_PLAN = /kwality|kemps|supreme|bandra|shq|kenkere|indiranagar|courtside|copper|cloves/i;

/** The rooms offered for a studio: that studio's own plan plus the shared areas, with the
 *  two spellings of a room collapsed into one. Offering all 23 areas at every site let a
 *  Bandra ticket be filed against "Brain Cell" or "His Space", which only exist at
 *  Kwality House. When the studio is not known yet, everything stays on offer — narrowing
 *  the list before we know where we are would only strand the reporter. */
export function studioAreasFor(studioName?: string | null): string[] {
  const canonical = (name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return "";
    const alias = AREA_ALIASES[trimmed.toLowerCase()];
    if (alias) return alias;
    return STUDIO_AREAS.find((a) => a.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
  };
  const planned =
    studioName && HAS_ROOM_PLAN.test(studioName)
      ? getStudioRoomsForStudio(studioName).map((r) => r.name)
      : [...STUDIO_AREAS];
  const out: string[] = [];
  for (const raw of [...planned, ...COMMON_STUDIO_AREAS]) {
    const name = canonical(raw);
    if (!name) continue;
    if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

export const SYSTEMS = [
  "Momence",
  "POS / card machine",
  "Wi-Fi / router",
  "Front desk iPad",
  "Website / mobile app",
  "Payment gateway (Stripe / Razorpay)",
  "Audio / mic system",
  "CCTV / surveillance",
  "Access control / door lock",
  "Cash counting machine",
  "Yellow Messenger",
  "Other system",
] as const;

export const OCCURRED_OPTIONS = [
  "Just now",
  "Earlier today",
  "Yesterday",
  "Earlier this week",
  "Last week",
  "Ongoing / recurring",
] as const;

export const REPORTED_BY_OPTIONS = [
  "I noticed this myself",
  "A member told me about it",
  "A colleague flagged it to me",
  "Raised during a walkthrough / audit",
] as const;

export const TRAINERS = [
  "Anisha Shah",
  "Anmol Sharma",
  "Atulan Purohit",
  "Bret Saldanha",
  "Cauveri Vikrant",
  "Chaitanya Nahar",
  "Kajol Kanchan",
  "Karan Bhatia",
  "Karanvir Bhatia",
  "Mrigakshi Jaiswal",
  "Pranjali Jain",
  "Pushyank Nahar",
  "Raunak Khemuka",
  "Reshma Sharma",
  "Richard D'Costa",
  "Rohan Dahima",
  "Shruti Kulkarni",
  "Siddhartha Kusuma",
  "Simonelle De Vitre",
  "Vivaran Dhasmana",
] as const;

export const MEMBERSHIPS = [
  "Barre 1 month Unlimited",
  "Barre 2 week Unlimited",
  "Barre 3 months Unlimited",
  "Barre 6 month Unlimited",
  "Barre Annual Membership",
  "Newcomers 2 For 1",
  "Owner's Special - 2 for 1",
  "powerCycle 1 month Unlimited",
  "powerCycle 2 week Unlimited",
  "powerCycle 3 months Unlimited",
  "powerCycle 6 months Unlimited",
  "powerCycle Annual Membership",
  "Strength Lab 1 month Unlimited",
  "Strength Lab 2 week Unlimited",
  "Strength Lab 3 months Unlimited",
  "Strength Lab 6 months Unlimited",
  "Strength Lab Annual Membership",
  "Studio 1 Month Unlimited Membership",
  "Studio 10 Single Class Pack",
  "Studio 12 Class Package",
  "Studio 2 Week Unlimited Membership",
  "Studio 20 Single Class Pack",
  "Studio 3 Month U/L Monthly Installment",
  "Studio 3 Month Unlimited Membership",
  "Studio 30 Single Class Pack",
  "Studio 4 Class Package",
  "Studio 6 Month Unlimited Membership",
  "Studio 8 Class Package",
  "Studio Annual Membership - Monthly Intsallment",
  "Studio Annual Unlimited Membership",
  "Studio Extended 10 Single Class Pack",
  "Studio Happy Hour Private",
  "Studio Newcomers 2 Week Unlimited Membership",
  "Studio Private - Anisha (Single Class)",
  "Studio Private Class",
  "Studio Private Class X 10",
  "Studio Privates - Anisha x 10",
  "Studio Single Class",
  "Summer Bootcamp - Studio 6 Week Unlimited",
  "Virtual Private - Anisha",
  "Virtual Private Class",
  "Virtual Private Class X 10",
  "Virtual Privates - Anisha x 10",
] as const;

export const CATEGORY_MAP: Record<string, string[]> = {
  Scheduling: [
    "Time Change",
    "Level Change",
    "Additional Classes",
    "Trainer Preferences",
    "Class Capacity Issues",
    "Waitlist Concerns",
    "Studio Timings",
    "Session Length",
    "Cancellation Policy",
    "Booking Restrictions",
    "Class Substitutions",
    "Trainer Substitutions",
    "Last-minute Cancellations",
    "Late Arrival Policy",
    "Special Request Accommodations",
    "Early Morning/Late Night Class Availability",
    "Weekend vs. Weekday Class Balance",
    "Rescheduling Flexibility",
    "Booking Confirmation Issues",
    "Holiday and Festival Class Planning",
    "Workshop / Event Capacity & Planning",
    "Studio Operations / Class Feedback (grid review)",
    "Class Overbooking / Unregistered Attendance",
    "Private Group Booking / Guestlist Management",
    "Class Capacity & Schedule Gaps",
    "Class Schedule Delay / Internal Follow-up",
  ],
  "Class Experience": [
    "Bad Odour",
    "Audio Issues",
    "Studio Temperature Too Hot/Cold",
    "Overcrowding in Class",
    "Class Flow and Pacing",
    "Modifications in Routine",
    "Engagement with Clients",
    "Hands-on Adjustments",
    "Demonstration and Visual Cues",
    "Knowledge and Competence",
    "Brand Language Usage",
    "Grooming and Appearance",
    "Attendance for Workshops",
    "Attendance for Meetings",
    "Class Format Satisfaction",
    "Class Duration Suitability",
    "Instructor Energy and Motivation",
    "Class Variety and Themes",
    "Adjustments for Different Fitness Levels",
    "Challenges in Following Instructor",
    "Member Injury During Class",
    "Physical Discomfort During Class (cramping / dizziness)",
    "Class Frequency and Format Preference",
  ],
  "Trainer Feedback": [
    "Trainer Forgot Names",
    "Class Intensity Too High/Low",
    "Trainer Hygiene",
    "Trainer Punctuality Issues",
    "Trainer Behaviour",
    "Modifications in Routine",
    "Engagement with Clients",
    "Hands-on Adjustments",
    "Demonstration and Visual Cues",
    "Knowledge and Competence",
    "Brand Language Usage",
    "Pre and Post-Class Outreach",
    "Trainer Availability",
    "Feedback Handling",
    "Emergency Preparedness",
    "Trainer Focus on Individual Needs",
    "Class Ending on Time",
    "Trainer Encouragement",
    "Injury Prevention and Safety",
    "Too Many Corrections vs. Too Few",
    "Trainer No-Show / Late Arrival",
    "Instructor Music Balance & Schedule Fit",
    "Trainer Experience and Intensity Consistency",
  ],
  "Repair and Maintenance": [
    "PowerCycle Bike Malfunction & Repairs",
    "Studio Lighting Malfunction & Repairs",
    "Resistance Bands & Small Equipment Repairs",
    "Strength Studio Equipment Repairs",
    "Audio, Mic & Headphone Malfunction",
    "Housekeeping & Cleaning Issues",
    "Washroom & Plumbing Repairs",
    "AC & Ventilation Repairs",
    "Electrical & Power Issues",
    "Doors, Locks & Fixture Repairs",
    "General Studio Repairs & Maintenance",
    "TFA Malfunction",
    "Pest Control Needed",
    "Staff Uniforms Not Clean",
    "Toiletries and Supplies Low",
    "Towel Availability Issues",
    "Uncomfortable Lounge Seating",
    "Air Fresheners Too Strong",
    "Music System Too Loud/Low",
    "Vending Machine Out of Stock",
    "Additional Waiting Area Seating",
    "Fire Safety Compliance",
    "Water Dispenser Issues",
    "Standard Operating Procedure (SOP) — create / update",
    "Vendor / AMC Management",
    "Retail & Boutique Stock Replenishment",
    "Attendance / Check-in Discrepancy",
  ],
  "Studio Amenities and Facilities": [
    "Studio Odour and Aroma",
    "Cleanliness and Hygiene",
    "Ventilation Poor",
    "Air Quality Poor",
    "Valet Issues",
    "Locker Availability",
    "Shower Water Pressure",
    "Steam Room Not Working",
    "Boutique Availability Issues",
    "Wi-Fi Slow",
    "Integration Issues",
    "Lost and Found Disorganization",
    "Availability of Gym Accessories",
    "Fitness Challenges and Rewards",
    "Additional Membership Perks",
    "Smoothie Bar and Refreshments",
    "Member Lounge Cleanliness",
    "Community Events and Social Engagement",
    "Holiday-Themed Classes",
    "Sustainable and Eco-Friendly Practices",
    "Ventilation and Air Quality",
    "Equipment Layout / Weights Arrangement",
  ],
  "Operating Systems": [
    "Moments Notice",
    "Stripe and Razorpay",
    "Yellow Messenger",
    "Website Glitches",
    "Router Connectivity",
    "iPad Functionality",
    "Cash Counting Machine Issues",
    "POS System Malfunctions",
    "CRM System Errors",
    "Data Security Issues",
    "Technical Assistance",
    "Difficulty Tracking Sessions",
    "System Delays",
    "Software Bugs",
    "Mobile App UI/UX Issues",
    "Attendance Record Discrepancies",
    "Missed Sessions Not Recorded",
    "Mobile App Freezing",
    "Delayed Notifications",
    "Error in Class Listings",
  ],
  "Tech Issues": [
    "Laptops Not Functioning",
    "Speakers Static Noise",
    "Mic Not Working",
    "Phones Not Working",
    "App Performance Bugs",
    "Booking System Errors",
    "Password and Login Issues",
    "Payment Processing Delays",
    "Online Class Streaming Buffering",
    "Notifications Not Received",
    "Auto-Debit Incorrect Charges",
    "Social Media Glitches",
    "Wrong Class Bookings",
    "Incorrect Charges on Account",
    "Studio Music Preferences",
    "Camera Surveillance Issues",
    "Digital Receipts and Invoices",
    "Website Navigation Difficulties",
    "Virtual Class Video Quality",
    "Studio Wi-Fi Not Working",
  ],
  "Pricing and Memberships": [
    "Price Transparency",
    "Membership Flexibility",
    "Discounts and Offers Confusion",
    "Refund and Cancellation Policy Issue",
    "Auto-Renewal Concerns",
    "Transparency in TandC/",
    "Add-on Services Pricing Clarity",
    "Class Pack Expiry Confusion",
    "Private Session Pricing",
    "Membership Upgrade/Downgrade",
    "Lack of Payment Plan Options",
    "Referral Discount Issues",
    "Holiday and Special Pricing Clarity",
    "Corporate Wellness Program Pricing",
    "Pricing for International Clients",
    "Membership Pause and Freeze Policy",
    "Special Group Discounts",
    "Loyalty Program Issues",
    "Policy Non-Compliance / Unauthorised Refunds",
    "Studio Location & Pricing Preference",
  ],
  "Customer Service and Communication": [
    "Delay in Response",
    "Unresolved Complaints",
    "Front Desk Attitude",
    "Miscommunication on Offers",
    "Response Time to Queries",
    "Follow-up Post Inquiry",
    "Friendliness and Approachability",
    "Call Handling Etiquette",
    "Clarity in Policies",
    "Late Response to Complaints",
    "Handling of Complaints",
    "Feedback Follow-up Process",
    "Compensation for Service Issues",
    "Customer Retention Strategies",
    "Over-promising and Under-delivery",
    "Response to Negative Reviews",
    "Training of Customer Service Team",
    "Training of Sales Team",
    "Knowledge of Membership Policies",
    "Proactive Client Engagement",
    "Competitor Solicitation / Client Poaching",
    "Lead Conversion / Engagement Strategy",
    "Lead Management / Sales Tracking",
    "Lead Follow-up / Missing Contact Details",
  ],
  "Brand Feedback": [
    "Hosted Class Feedback",
    "Brand Positioning",
    "Brand Identity Consistency",
    "Marketing Message Accuracy",
    "Brand Tone Consistency",
    "Social Media Engagement",
    "Advertising Consistency",
    "Collaborations and Partnerships",
    "Merchandise Quality",
    "Member Recognition Efforts",
    "Influencer Engagement",
    "Staff Wearing Incorrect Branding",
    "Merchandise Display Issues",
    "Branded Content Guidelines",
    "Member Recognition Events",
    "Newsletter Effectiveness",
    "Brand Perception in Market",
    "Perception of Pricing Value",
    "Client Testimonials Management",
    "Client Loyalty Recognition",
    "Brand Event Participation",
    "Marketing Collateral Production & Review",
    "Partnership / Collab Approval",
    "Post-Event Lead Reporting",
  ],
  "Safety and Security": [
    "Emergency Exits Blocked",
    "Panic Button Malfunction",
    "Unlocked Doors",
    "CCTV Malfunction",
    "Security Guard Issues",
    "Client Harassment Reports",
    "Fire Drills Not Conducted",
    "Suspicious Individuals Inside Studio",
    "Front Desk Not Checking IDs",
    "Unregistered Walk-ins",
    "Trespassing Concerns",
    "Personal Safety Concerns",
    "Harassment Reports",
    "Data Breach Concerns",
    "Employee Security Training",
    "Reporting Suspicious Activity",
    "Staff Security Concerns",
    "Handling of Medical Emergencies",
    "First Aid Kit Availability",
    "Unauthorized Use of Equipment",
  ],
  "Theft and Lost Items": [
    "Locker Theft",
    "Stolen Personal Items",
    "Misplaced Valuables",
    "Items Taken from Boutique",
    "Items Left Behind by Clients",
    "Studio Lost and Found Management",
    "Staff Theft",
    "Reporting Stolen Items",
    "Theft Prevention Measures",
    "Theft Investigation Process",
    "Personal Items Taken from Trainer Area",
    "Issues with Valet Theft",
    "Theft by Other Members",
    "Lost Shoes/Workout Gear",
    "Safe Storage for Client Bags",
    "Clients Forgetting Items in Studio",
    "Missing Towels",
    "Theft During Busy Hours",
    "Members Taking Extra Equipment",
    "Coffee and Refreshments Options",
  ],
  Miscellaneous: [
    "Music Volume Issues",
    "Studio Decor and Ambience",
    "Mobile Charging Stations",
    "Late-Night Class Safety",
    "Noise Complaints from Neighbors",
    "Misplaced Equipment",
    "Temperature Control Inconsistency",
    "Scent Sensitivities",
    "Lighting Preferences",
    "Cold Air Drafts",
    "Overcrowding in Lobby",
    "Construction Noise Nearby",
    "Child-Friendly Facilities",
    "Outdoor Signage Visibility",
    "Feedback Fatigue",
    "Personal Storage Lockers Needed",
    "Background Music Selection",
    "Social Media Response Time",
    "Customer Flow Management",
  ],
  "Internal Operations & Admin": [
    "Internal Operations Memo / Escalation",
    "SOP & Policy Governance (issue, version, publish)",
    "Quality Assurance Audit / Checklist Sign-off",
    "Post-Class Session Reporting & Feedback Loop",
    "Hosted Class / Event Lead Capture & Tracking",
    "Performance Review / Payroll / Leave (HR-Admin)",
    "HRIS & Shift Tooling Access (Zoho Shift)",
    "Handover / Shift Reporting Gap",
    "Internal Communication Gap / Workflow Approval",
    "Business Intelligence & Report Request",
    "B2B / Corporate Wellness Ops Feedback",
  ],
};

export const CATEGORIES = Object.keys(CATEGORY_MAP);

export const DEPARTMENT_RECORDS = [
  { id: "accounts", name: "Accounts", description: "Accounts routing queue", active: true },
  {
    id: "customer-service",
    name: "Customer Service",
    description: "Customer Service routing queue",
    active: true,
  },
  { id: "management", name: "Management", description: "Management routing queue", active: true },
  { id: "marketing", name: "Marketing", description: "Marketing routing queue", active: true },
  { id: "operations", name: "Operations", description: "Operations routing queue", active: true },
  {
    id: "sales-client-servicing",
    name: "Sales & Client Servicing",
    description: "Sales & Client Servicing routing queue",
    active: true,
  },
  { id: "training", name: "Training", description: "Training routing queue", active: true },
] as const;

export const CATEGORY_DEPARTMENT: Record<string, string> = {
  Scheduling: "training",
  "Class Experience": "training",
  "Trainer Feedback": "training",
  "Repair and Maintenance": "operations",
  "Studio Amenities and Facilities": "operations",
  "Operating Systems": "operations",
  "Tech Issues": "operations",
  "Pricing and Memberships": "accounts",
  "Customer Service and Communication": "sales-client-servicing",
  "Brand Feedback": "marketing",
  "Safety and Security": "management",
  "Theft and Lost Items": "operations",
  Miscellaneous: "operations",
  "Internal Operations & Admin": "operations",
};

/** The directory itself (names, emails) is server-only: lib/staff-directory.ts. Client code
 *  reads the live directory from /api/staff. */
export type StaffRecord = {
  id: number;
  externalId: string;
  name: string;
  email: string;
  role: string;
  department: string;
  location: string;
  manager: string | null;
  studioId: number | null;
  categories: string[];
  avatarColor: string;
  isActive: boolean;
};

export const STATUS_LABELS: Record<string, string> = {
  recorded: "Recorded",
  new: "New",
  triaged: "Triaged",
  assigned: "Assigned",
  in_progress: "In progress",
  waiting_on_member: "Waiting on member",
  waiting_on_vendor: "Waiting on vendor",
  resolved: "Resolved",
  closed: "Closed",
};

/** Default first-response hours per priority — the one SLA table. The workspace's
 *  `responseHours` (Settings) defaults to this and is what tickets are actually filed with. */
export type SlaHours = Record<"critical" | "high" | "medium" | "low", number>;
export const PRIORITY_SLA_HOURS: SlaHours = {
  critical: 12,
  high: 16,
  medium: 48,
  low: 72,
};


/* ------------------------------------------------------------------ */
/* Stages SC3 / PowerCycle Bike Knowledge Base                         */
/* ------------------------------------------------------------------ */

export type CyclePart = {
  id: string;
  name: string;
  aliases: string[];
  tools: string;
  torque?: string;
  description: string;
};

export const STAGES_SC3_PARTS: CyclePart[] = [
  { id: "sic2-console", name: "SIC2 Console", aliases: ["console","screen","display","monitor"], tools: "3mm hex wrench", description: "Top-mounted console with ANT+ power display. Secured by 3mm hex screws via the power wire channel." },
  { id: "spm2-power-meter", name: "SPM2 Power Meter", aliases: ["power meter","watt meter","spm2","power sensor"], tools: "8mm hex wrench", torque: "52–57 N·m", description: "Crank-arm power meter. ANT+ 5-digit ID. Battery spacer or taped AA batteries. Zero reset ADC must read 790–990." },
  { id: "fitloc-lever", name: "FitLoc Lever & Handlebar Stem", aliases: ["fitloc","handlebar lever","handlebar clamp","stem lever","handlebar"], tools: "Hand-tightened", description: "Quick-release lever for handlebar height adjustment. Insert handlebar post, push lever down to lock." },
  { id: "fore-aft-knob", name: "Fore/Aft Slide Knob", aliases: ["fore aft","slider","seat slider","saddle slider"], tools: "Hand-tightened", description: "Adjusts horizontal saddle position along the rail." },
  { id: "resistance-knob", name: "Resistance / Brake Knob", aliases: ["resistance","brake knob","resistance dial","brake"], tools: "N/A", description: "Controls magnetic eddy-current braking force. Press down for emergency stop." },
  { id: "sprintshift-lever", name: "SprintShift Lever", aliases: ["sprint shift","shift lever","quick shift","sprint"], tools: "N/A", description: "Multi-stage quick shift for instant resistance jumps during sprints." },
  { id: "flywheel", name: "Flywheel", aliases: ["flywheel","fly wheel","wheel"], tools: "N/A", description: "Perimeter-weighted aluminum flywheel with magnetic eddy-current brake." },
  { id: "pedal-left", name: "Pedal CR-L (Left)", aliases: ["left pedal","cr-l","pedal left"], tools: "15mm pedal wrench", torque: "42 N·m", description: "Left pedal — REVERSE THREADED. Turn CLOCKWISE to remove, counterclockwise to install." },
  { id: "pedal-right", name: "Pedal CR-R (Right)", aliases: ["right pedal","cr-r","pedal right"], tools: "15mm pedal wrench", torque: "42 N·m", description: "Right pedal — standard thread. Turn counterclockwise to remove, clockwise to install." },
  { id: "saddle-clamp", name: "Saddle Height Clamp", aliases: ["seat clamp","saddle clamp","seat height","saddle height"], tools: "13mm wrench", description: "Clamp securing the seatpost at the desired height." },
  { id: "stabilizers", name: "Stabilizers (Front/Rear)", aliases: ["stabilizer","stabiliser","feet","leveling feet","base"], tools: "6mm hex + 17mm wrench", description: "Front: wheels facing forward. Rear: step plates with sloped edge pointing away. M10 bolts. 4 leveling feet with 14mm nut." },
  { id: "belt-drive", name: "Belt Drive", aliases: ["belt","drive belt","belt tension"], tools: "Technician service", description: "Poly-V belt connecting pedal crank to flywheel. Vibration or slipping requires technician service." },
  { id: "crank-arm", name: "Crank Arm", aliases: ["crank","crank arm"], tools: "8mm hex wrench", torque: "52–57 N·m", description: "Connects pedals to the flywheel via the bottom bracket. SPM2 power meter is integrated here." },
];

export type CycleTroubleshoot = {
  symptom: string;
  keywords: string[];
  diagnosis: string;
  action: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  partId: string;
};

export const STAGES_SC3_TROUBLESHOOTING: CycleTroubleshoot[] = [
  { symptom: "Flywheel scraping / grinding noise", keywords: ["scraping","grinding","noise","flywheel noise","rubbing"], diagnosis: "Brake pad or flywheel housing misalignment. Possible loose flywheel bolt.", action: "Immediately take bike out of rotation. Do NOT ride. Schedule technician inspection.", severity: "critical", partId: "flywheel" },
  { symptom: "FitLoc lever slipping / handlebar dropping", keywords: ["fitloc","handlebar dropping","handlebar slipping","handlebar loose","lever loose","handlebar won't hold"], diagnosis: "FitLoc cam mechanism worn or post not inserted deep enough.", action: "Check post insertion depth (min line visible). If still slipping, tag bike for FitLoc replacement.", severity: "high", partId: "fitloc-lever" },
  { symptom: "Power meter not pairing / no watts displayed", keywords: ["no power","watts not showing","power meter","not pairing","ant+","no reading","console blank power"], diagnosis: "ANT+ pairing failure or dead batteries in SPM2.", action: "1. Check/replace AA batteries (use spacer or tape). 2. Re-pair using 5-digit ANT+ ID on console. 3. If still dead, check power wire channel connection.", severity: "medium", partId: "spm2-power-meter" },
  { symptom: "Zero reset failing (ADC outside 790–990)", keywords: ["zero reset","adc","calibration","power calibration","zero offset"], diagnosis: "SPM2 zero offset out of range. May indicate mechanical stress on crank arm.", action: "Re-attempt zero reset with NO weight on pedals. If ADC reads outside 790–990 after 3 attempts, remove and reseat crank arm at 52–57 N·m. Escalate to Stages support if persistent.", severity: "medium", partId: "spm2-power-meter" },
  { symptom: "Pedal detached / came off", keywords: ["pedal came off","pedal off","pedal fell off","pedal detached","pedal missing","pedal came loose","lost a pedal","pedal is off"], diagnosis: "Pedal has unscrewed from the crank arm — most often the left (CR-L) pedal, which is REVERSE threaded and works loose if it was never torqued to spec.", action: "Take the bike out of rotation immediately — a pedal that can detach is a rider-safety fault. Refit at 42 N·m with a 15mm pedal wrench (left pedal: turn CLOCKWISE to tighten). Inspect the crank-arm threads; if they are stripped, replace the crank arm (8mm hex, 52–57 N·m).", severity: "critical", partId: "pedal-left" },
  { symptom: "Pedal cross-threaded / won't tighten", keywords: ["pedal cross","stripped","pedal stuck","pedal loose","pedal thread","cross thread"], diagnosis: "Pedal threads stripped or cross-threaded. Remember: left pedal is REVERSE threaded.", action: "Do NOT force. Remove pedal, inspect threads. If crank arm threads are stripped, replace crank arm (8mm hex, 52–57 N·m). Apply grease to threads before reinstall.", severity: "high", partId: "pedal-left" },
  { symptom: "Console dead / no display", keywords: ["console dead","no display","screen blank","console not working","monitor dead"], diagnosis: "Power wire disconnected or console battery dead.", action: "1. Check power wire in channel under handlebar. 2. Replace console batteries. 3. Reseat 3mm hex screws. If still dead, replace SIC2 console unit.", severity: "medium", partId: "sic2-console" },
  { symptom: "Belt vibration or slipping", keywords: ["belt vibration","belt slip","belt noise","vibrating","belt squeal"], diagnosis: "Belt tension loss or misalignment. Normal wear after heavy usage.", action: "Take bike out of rotation. Belt tensioning requires trained technician. Do not attempt field adjustment.", severity: "high", partId: "belt-drive" },
  { symptom: "Resistance knob not engaging / no resistance change", keywords: ["no resistance","resistance stuck","brake not working","resistance knob","can't feel resistance"], diagnosis: "Magnetic brake pad gap too wide or brake knob cable disconnected.", action: "Check brake knob cable routing under shroud. If cable intact, brake pad gap needs technician adjustment.", severity: "high", partId: "resistance-knob" },
  { symptom: "Bike wobbling / unstable", keywords: ["wobble","wobbling","unstable","rocking","bike moves","not stable"], diagnosis: "Stabilizer feet not leveled or stabilizer bolts loose.", action: "Adjust 4 leveling feet (14mm nut) until all contact the floor evenly. Tighten M10 stabilizer bolts (6mm hex + 17mm wrench).", severity: "medium", partId: "stabilizers" },
  { symptom: "Seat won't stay at height", keywords: ["seat drops","seat slips","saddle drops","seat won't hold","seat height"], diagnosis: "Saddle clamp not tightened or clamp mechanism worn.", action: "Tighten saddle clamp with 13mm wrench. If clamp is worn/stripped, replace the clamp assembly.", severity: "medium", partId: "saddle-clamp" },
  { symptom: "SprintShift lever stuck or unresponsive", keywords: ["sprint shift stuck","shift not working","sprint lever","quick shift"], diagnosis: "SprintShift cable binding or lever mechanism jammed.", action: "Check cable routing. If lever mechanism is jammed, take bike out of rotation for technician service.", severity: "medium", partId: "sprintshift-lever" },
];

/** IRIS prompts for cycle-related tickets: the questions to ask in sequence */
export const CYCLE_INTAKE_QUESTIONS = [
  { key: "bikeNumber", prompt: "Which bike number is this about? (e.g. Bike #3, Bike 7)", type: "text" },
  { key: "cycleIssueType", prompt: "What exactly is wrong?", type: "select", values: STAGES_SC3_TROUBLESHOOTING.map(t => t.symptom) },
  { key: "cyclePart", prompt: "Which part of the bike is affected?", type: "select", values: STAGES_SC3_PARTS.map(p => p.name) },
  { key: "cycleFirstOrRecurring", prompt: "Is this the first time this has happened on this bike, or has it happened before?", type: "select", values: ["First time", "Recurring — happened before", "Not sure"] },
  { key: "cycleReporterAction", prompt: "What did you do when you noticed it?", type: "select", values: ["Took bike out of rotation", "Flagged it but class continued", "Member reported mid-class", "Noticed during setup/walkthrough"] },
] as const;

/* ------------------------------------------------------------------ */
/* Trainer Image Mapping                                               */
/* ------------------------------------------------------------------ */

/** Maps trainer names to their image file paths in /public/trainer-images/ */
export const TRAINER_IMAGES: Record<string, string> = {
  "Anisha Shah": "/trainer-images/001-1_Anisha-1-e1590837044475.jpg",
  "Anmol Sharma": "/trainer-images/Anmol.jpeg",
  "Atulan Purohit": "/trainer-images/002-Atulan-Image-1.jpg",
  "Bret Saldanha": "/trainer-images/Bret.jpeg",
  "Cauveri Vikrant": "/trainer-images/Cauveri-Vikrant.jpg",
  "Chaitanya Nahar": "/trainer-images/Chaitanya-Nahar.jpg",
  "Kajol Kanchan": "/trainer-images/Kajol-Kanchan.jpg",
  "Karan Bhatia": "/trainer-images/Karan-Bhatia.jpg",
  "Mrigakshi Jaiswal": "/trainer-images/007-Mrigakshi-Image-2.jpg",
  "Pranjali Jain": "/trainer-images/008-Pranjali-Image-1.jpg",
  "Pushyank Nahar": "/trainer-images/009-Pushyank-Nahar-1.jpeg",
  "Raunak Khemuka": "/trainer-images/Raunak.jpeg",
  "Reshma Sharma": "/trainer-images/010-Reshma-Image-3.jpg",
  "Richard D'Costa": "/trainer-images/011-Richard-Image-3.jpg",
  "Rohan Dahima": "/trainer-images/012-Rohan-Image-3.jpg",
  "Shruti Kulkarni": "/trainer-images/Shruti-Kulkarni.jpeg",
  "Simonelle De Vitre": "/trainer-images/Simonelle.jpeg",
  "Vivaran Dhasmana": "/trainer-images/015-Vivaran-Image-4.jpg",
  // Files that were already on disk but had no entry, so these trainers fell
  // back to initials. A bare first name ("Karanvir", "Siddhartha") resolves
  // through the first-name rule below once the full name is listed here.
  "Karanvir Bhatia": "/trainer-images/Karanvir-Bhatia.jpeg",
  "Siddhartha Kusuma": "/trainer-images/siddhartha-kusuma.jpg",
  "Simran Dutt": "/trainer-images/Simran.jpeg",
  "Maysaa Nafis": "/trainer-images/maysaa-nafis.jpeg",
  "Siya Mukund": "/trainer-images/siya-mukund.jpeg",
};

/** Headshots for the associates — the studio and office staff who are not
 *  trainers. Kept as its own map because the two groups come from different
 *  shoots and live in different folders; the lookup below reads both. */
export const ASSOCIATE_IMAGES: Record<string, string> = {
  "Deesha Changwani": "/associates/deesha-changwani.png",
  "Imran Shaikh": "/associates/imran-shaikh.jpg",
  "Nadiya Shaikh": "/associates/nadiya-shaikh.png",
  // The file is named for a former surname; the directory lists her as Pinge.
  "Shipra Pinge": "/associates/shipra-bhika.jpg",
};

/** A trainer's headshot, or null. Matches the full name first, then a first name on its own
 *  ("Anisha") — never a different person who happens to share a first name ("Rohan Mehta" is
 *  not "Rohan Dahima"), and never "Karanvir" for "Karan". A co-taught "Anisha, Atulan" reads as
 *  its first trainer. */
function lookupImage(name: string, map: Record<string, string>): string | null {
  if (!name) return null;
  const first = name.split(/\s*(?:,|\+|&|\band\b)\s*/i)[0].trim().toLowerCase().replace(/\s+/g, ' ');
  if (!first) return null;
  for (const [key, url] of Object.entries(map)) if (key.toLowerCase() === first) return url;
  const words = first.split(' ');
  const matches = Object.entries(map).filter(([key]) => {
    const k = key.toLowerCase().split(' ');
    if (k[0] !== words[0]) return false;
    // A second word has to agree too, at least by its first letter ("Simonelle D.").
    return words.length === 1 || (k[1] || '').startsWith(words[1].replace(/\.$/, ''));
  });
  return matches.length === 1 ? matches[0][1] : null;
}

export function getTrainerImage(name: string): string | null {
  return lookupImage(name, TRAINER_IMAGES);
}

/** Any person's headshot: a trainer first, then an associate. One person is
 *  never in both maps, so the order only decides which is searched first. */
export function getPersonImage(name: string): string | null {
  return lookupImage(name, TRAINER_IMAGES) ?? lookupImage(name, ASSOCIATE_IMAGES);
}

/* ------------------------------------------------------------------------ *
 * Equipment catalogue
 *
 * The register began as bikes only, because a bike is the thing the floor names out loud
 * when it breaks. Everything else in a studio breaks too — the biometric machine that
 * stops logging attendance, the microwave in the pantry, the 5 kg weights that walk between
 * rooms — and until each one is a row, "how often does this fail" has no answer.
 *
 * `countable` marks the things a studio owns in identical multiples, where one row standing
 * for twelve bands is more honest than twelve rows nobody will keep up to date.
 * ------------------------------------------------------------------------ */

export type EquipmentCategory =
  | 'Cardio'
  | 'Strength & studio'
  | 'IT & systems'
  | 'Audio & visual'
  | 'Climate & facilities'
  | 'Pantry'
  // The vendor service & complaint register's groups.
  | 'Building & Civil'
  | 'Electrical'
  | 'HVAC'
  | 'Plumbing'
  | 'Fire & Safety'
  | 'Studio / Equipment'
  | 'Changing Room / Shower'
  | 'Housekeeping'
  | 'Reception';

export interface EquipmentTypeDef {
  /** Canonical name. Stored on the asset row, so renaming one is a data migration. */
  type: string;
  category: EquipmentCategory;
  /** Usually held in multiples and tracked by count rather than by individual item. */
  countable?: boolean;
  /** Other ways the floor says it, used when reading equipment out of a ticket. */
  aliases?: string[];
}

export const EQUIPMENT_CATALOGUE: EquipmentTypeDef[] = [
  {type: 'PowerCycle bike', category: 'Cardio', aliases: ['bike', 'cycle', 'powercycle', 'spin bike', 'studio cycle']},

  {type: 'Barre', category: 'Strength & studio', aliases: ['barre', 'ballet barre']},
  {type: 'Resistance band', category: 'Strength & studio', countable: true, aliases: ['band', 'bands', 'resistance band', 'resistance bands']},
  {type: 'Exercise ball', category: 'Strength & studio', countable: true, aliases: ['ball', 'balls', 'pilates ball', 'swiss ball']},
  {type: 'Weight 1 kg', category: 'Strength & studio', countable: true, aliases: ['1kg', '1 kg weight', '1kg weight']},
  {type: 'Weight 2 kg', category: 'Strength & studio', countable: true, aliases: ['2kg', '2 kg weight', '2kg weight']},
  {type: 'Weight 3 kg', category: 'Strength & studio', countable: true, aliases: ['3kg', '3 kg weight', '3kg weight']},
  {type: 'Weight 4 kg', category: 'Strength & studio', countable: true, aliases: ['4kg', '4 kg weight', '4kg weight']},
  {type: 'Weight 5 kg', category: 'Strength & studio', countable: true, aliases: ['5kg', '5 kg weight', '5kg weight']},
  {type: 'Weight 7 kg', category: 'Strength & studio', countable: true, aliases: ['7kg', '7 kg weight', '7kg weight']},
  {type: 'Weight 10 kg', category: 'Strength & studio', countable: true, aliases: ['10kg', '10 kg weight', '10kg weight']},

  {type: 'Laptop', category: 'IT & systems', aliases: ['laptop', 'notebook', 'macbook']},
  {type: 'Printer', category: 'IT & systems', aliases: ['printer', 'scanner']},
  {type: 'Biometric machine', category: 'IT & systems', aliases: ['biometric', 'biometric machine', 'attendance machine', 'fingerprint scanner']},
  {type: 'TFA system', category: 'IT & systems', aliases: ['tfa', 'tfa system', 'two factor', 'access control']},
  {type: 'Landline', category: 'IT & systems', aliases: ['landline', 'landline phone']},
  {type: 'Studio phone', category: 'IT & systems', aliases: ['studio phone', 'front desk phone', 'reception phone', 'reception landline']},

  {type: 'Microphone', category: 'Audio & visual', aliases: ['mic', 'microphone', 'headset mic', 'studio mic']},
  {type: 'Portable microphone', category: 'Audio & visual', aliases: ['portable mic', 'handheld mic', 'roving mic']},
  {type: 'Music system', category: 'Audio & visual', aliases: ['music system', 'sound system', 'console', 'mixer', 'amp']},
  {type: 'Speaker', category: 'Audio & visual', aliases: ['speaker', 'speakers', 'monitor speaker', 'speakers / audio']},
  {type: 'Studio lighting rig', category: 'Audio & visual', aliases: ['lighting rig', 'studio lights', 'light rig']},
  {type: 'Ambient light', category: 'Audio & visual', aliases: ['ambient light', 'mood light']},
  {type: 'Spotlight', category: 'Audio & visual', aliases: ['spotlight', 'spot light']},
  {type: 'Strip light', category: 'Audio & visual', aliases: ['strip light', 'led strip']},
  {type: 'Emergency light', category: 'Audio & visual', aliases: ['emergency light', 'exit light']},
  {type: 'Neon signage', category: 'Audio & visual', aliases: ['neon', 'neon sign', 'signage']},

  {type: 'Air conditioning system', category: 'Climate & facilities', aliases: ['ac', 'a/c', 'air conditioning', 'aircon', 'air conditioner']},
  {type: 'Portable cooler', category: 'Climate & facilities', aliases: ['cooler', 'portable cooler', 'air cooler']},
  {type: 'Washing machine', category: 'Climate & facilities', aliases: ['washing machine', 'washer', 'laundry machine']},
  {type: 'Shoe disinfectant', category: 'Climate & facilities', aliases: ['shoe disinfectant', 'shoe sanitiser', 'shoe sanitizer', 'sanitising mat']},

  {type: 'Coffee maker', category: 'Pantry', aliases: ['coffee maker', 'coffee machine', 'espresso machine']},
  {type: 'Microwave', category: 'Pantry', aliases: ['microwave', 'microwave oven']},

  /* The vendor service & complaint register (Assets sheet). Items the catalogue already had —
   * cycle, studio mic, speakers, resistance bands, laptop, printer, phone — stay under their
   * existing types (the aliases above now include the register's wording) so no equipment
   * already filed is regrouped. */
  {type: 'Walls / paint', category: 'Building & Civil', aliases: ['wall paint', 'paint peeling', 'damp wall', 'crack in the wall']},
  {type: 'Ceiling / fabric', category: 'Building & Civil', aliases: ['ceiling fabric', 'false ceiling', 'ceiling panel']},
  {type: 'Flooring', category: 'Building & Civil', aliases: ['flooring', 'floorboard', 'floor tile', 'floor tiles']},
  {type: 'Doors & locks', category: 'Building & Civil', aliases: ['door lock', 'door handle', 'door hinge']},
  {type: 'Glass / mirrors', category: 'Building & Civil', aliases: ['mirror wall', 'broken mirror', 'glass panel', 'cracked mirror']},

  {type: 'Lights', category: 'Electrical', aliases: ['tube light', 'light bulb', 'lights not working', 'light not working']},
  {type: 'Switches & sockets', category: 'Electrical', aliases: ['switch board', 'switchboard', 'plug point', 'power socket']},
  {type: 'Electrical panel / DB', category: 'Electrical', aliases: ['electrical panel', 'distribution board', 'db box', 'mcb']},

  {type: 'AC operation', category: 'HVAC', aliases: ['ac remote', 'ac not turning on', 'ac operation']},
  {type: 'AC cooling effect', category: 'HVAC', aliases: ['ac not cooling', 'cooling effect']},
  {type: 'AC filters', category: 'HVAC', aliases: ['ac filter', 'ac filters']},
  {type: 'AC water leakage / unusual noise', category: 'HVAC', aliases: ['ac leak', 'ac leakage', 'ac dripping', 'ac noise']},

  {type: 'Taps', category: 'Plumbing', aliases: ['water tap', 'tap leaking', 'taps', 'faucet']},
  {type: 'Showers', category: 'Plumbing', aliases: ['shower head', 'shower not working']},
  {type: 'Toilets / flush', category: 'Plumbing', aliases: ['toilet', 'toilets', 'flush', 'commode']},
  {type: 'Drains', category: 'Plumbing', aliases: ['blocked drain', 'drain', 'drains']},
  {type: 'Water leakage', category: 'Plumbing', aliases: ['water leak', 'water leakage', 'pipe leak']},
  {type: 'Water pressure', category: 'Plumbing', aliases: ['water pressure', 'low pressure']},

  {type: 'Fire extinguishers', category: 'Fire & Safety', countable: true, aliases: ['fire extinguisher', 'fire extinguishers', 'extinguisher']},
  {type: 'Fire alarm', category: 'Fire & Safety', aliases: ['fire alarm', 'smoke detector', 'smoke alarm']},
  {type: 'Emergency exits', category: 'Fire & Safety', aliases: ['emergency exit', 'fire exit']},
  {type: 'First-aid kit', category: 'Fire & Safety', countable: true, aliases: ['first aid kit', 'first-aid kit', 'first aid box']},

  {type: 'Fitness equipment', category: 'Studio / Equipment', aliases: ['fitness equipment', 'gym equipment']},
  {type: 'Mats', category: 'Studio / Equipment', countable: true, aliases: ['yoga mat', 'exercise mat', 'mats']},
  {type: 'Dumbbells', category: 'Studio / Equipment', countable: true, aliases: ['dumbbell', 'dumbbells', 'dumbells']},
  {type: 'Kettlebell', category: 'Studio / Equipment', countable: true, aliases: ['kettlebell', 'kettlebells', 'kettle bell']},
  {type: 'Plyometric box', category: 'Studio / Equipment', countable: true, aliases: ['plyo box', 'plyometric box', 'jump box']},

  {type: 'Lockers', category: 'Changing Room / Shower', countable: true, aliases: ['locker', 'lockers']},
  {type: 'Hair dryers', category: 'Changing Room / Shower', countable: true, aliases: ['hair dryer', 'hair dryers', 'hairdryer']},
  {type: 'Hair brushes', category: 'Changing Room / Shower', countable: true, aliases: ['hair brush', 'hair brushes', 'hairbrush']},
  {type: 'Shower dispensers', category: 'Changing Room / Shower', countable: true, aliases: ['shampoo dispenser', 'soap dispenser', 'shower dispenser', 'body wash dispenser']},
  {type: 'Hooks', category: 'Changing Room / Shower', countable: true, aliases: ['wall hook', 'changing room hook', 'hooks']},
  {type: 'Hot water', category: 'Changing Room / Shower', aliases: ['hot water', 'geyser', 'water heater']},

  {type: 'Cleaning standards', category: 'Housekeeping', aliases: ['cleaning standards']},
  {type: 'Storage areas', category: 'Housekeeping', aliases: ['storage area', 'store room', 'storeroom']},
  {type: 'Waste bins', category: 'Housekeeping', countable: true, aliases: ['dustbin', 'waste bin', 'dustbins', 'waste bins']},
  {type: 'Odour', category: 'Housekeeping', aliases: ['bad odour', 'foul smell', 'odour', 'odor']},
  {type: 'Pest control', category: 'Housekeeping', aliases: ['pest control', 'cockroach', 'cockroaches', 'rodent', 'rats']},
  {type: 'Consumables', category: 'Housekeeping', aliases: ['consumables', 'toilet paper', 'tissue box']},

  {type: 'Reception furniture', category: 'Reception', aliases: ['reception furniture', 'reception sofa', 'reception chair']},
  {type: 'POS terminal', category: 'Reception', aliases: ['pos terminal', 'pos machine', 'card machine']},
  {type: 'Reception lighting', category: 'Reception', aliases: ['reception lighting', 'reception light']},
];

export const EQUIPMENT_TYPES = EQUIPMENT_CATALOGUE.map((e) => e.type);
export const EQUIPMENT_CATEGORIES = [...new Set(EQUIPMENT_CATALOGUE.map((e) => e.category))];
export const EQUIPMENT_BY_TYPE = new Map(EQUIPMENT_CATALOGUE.map((e) => [e.type, e]));

/** What state a piece of equipment is in, beyond whether it is usable. */
export const EQUIPMENT_CONDITIONS = ['new', 'good', 'fair', 'worn', 'needs replacement'] as const;
