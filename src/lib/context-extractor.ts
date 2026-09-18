/**
 * Context Extraction & Smart Dialogue Engine
 * Extracts studio (with colloquial slangs), category, subcategory, class format,
 * trainer, area, timing, and urgency right from the first user message.
 */

import { STUDIOS, TRAINERS, STUDIO_AREAS, CLASS_FORMATS, CATEGORY_MAP } from "./constants";

/** Map studio aliases and slangs to canonical studio names */
const STUDIO_ALIASES: Array<[string, RegExp]> = [
  // Kwality House, Kemps Corner (Mumbai)
  ["Kwality House, Kemps Corner", /\b(kemps|kemp's|kwality|kemps\s*corner|kempscorner|khkc|\bkh\b|kwality\s*house)\b/i],

  // Supreme HQ, Bandra (Mumbai)
  ["Supreme HQ, Bandra", /\b(bandra|shq|s\.h\.q|supreme|supreme\s*hq|supreme\s*bandra)\b/i],

  // Kenkere House, Bengaluru (Indiranagar)
  ["Kenkere House, Bengaluru", /\b(kenkere|kenkere\s*house|indiranagar|indira\s*nagar|bangalore|bengaluru|blr\s*kenkere|\bblr\b)\b/i],

  // Courtside, Mumbai
  ["Courtside, Mumbai", /\b(courtside|court\s*side)\b/i],

  // the Studio by Copper & Cloves, Bengaluru
  ["the Studio by Copper & Cloves, Bengaluru", /\b(copper|cloves|copper\s*&\s*cloves|copper\s*and\s*cloves|c&c|cnc|the\s*studio\s*by\s*copper)\b/i],
];

export function extractStudio(text: string): string | undefined {
  if (!text) return undefined;

  for (const [canonical, regex] of STUDIO_ALIASES) {
    if (regex.test(text)) return canonical;
  }

  // Canonical name substring matching
  const lower = text.toLowerCase();
  for (const studio of STUDIOS) {
    if (lower.includes(studio.name.toLowerCase())) return studio.name;
  }

  return undefined;
}

/** Extract trainer by full name or first name match */
export function extractTrainer(text: string): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();

  // Try full name exact match first
  for (const trainer of TRAINERS) {
    if (lower.includes(trainer.toLowerCase())) return trainer;
  }

  // Try first name matching (e.g. "Rohan's class", "with Atulan", "Kajol teaching")
  for (const trainer of TRAINERS) {
    const firstName = trainer.split(" ")[0].toLowerCase();
    const pattern = new RegExp(`\\b${firstName}('s|s)?\\b`, "i");
    if (pattern.test(lower)) return trainer;
  }

  return undefined;
}

/** Extract studio room or area (e.g. Studio 1, Locker room, Washroom) */
export function extractArea(text: string): string | undefined {
  if (!text) return undefined;

  // Specific room patterns
  if (/\b(studio\s*1|studio\s*one|main\s*(studio|floor)|barre\s*(studio|room))\b/i.test(text)) return "Main studio floor";
  if (/\b(studio\s*2|studio\s*two|studio\s*3|strength\s*(studio|floor|lab)|strength\s*room)\b/i.test(text)) return "Strength Lab floor";
  if (/\b(cycle\s*(studio|room)|spin\s*room|powercycle\s*(studio|room)|bike\s*room)\b/i.test(text)) return "Cycle studio";
  if (/\b(locker|locker\s*room|changing\s*room|change\s*room)\b/i.test(text)) return "Locker room";
  if (/\b(shower|showers|washroom|washrooms|bathroom|bathrooms|restroom|restrooms|toilet|toilets|loo)\b/i.test(text)) return "Showers / washroom";
  if (/\b(reception|lobby|front\s*desk|entrance)\b/i.test(text)) return "Reception / lobby";
  if (/\b(lounge|member\s*lounge|waiting\s*area|cafe)\b/i.test(text)) return "Member lounge";
  if (/\b(boutique|retail|merch|merchandise\s*display)\b/i.test(text)) return "Boutique";
  if (/\b(valet|parking|car\s*park)\b/i.test(text)) return "Parking / valet";
  if (/\b(back\s*office|staff\s*room|office)\b/i.test(text)) return "Back office";
  if (/\b(staircase|stairs|corridor|hallway)\b/i.test(text)) return "Staircase / corridor";

  // Check canonical STUDIO_AREAS
  const lower = text.toLowerCase();
  for (const area of STUDIO_AREAS) {
    if (lower.includes(area.toLowerCase())) return area;
  }

  return undefined;
}

/** Extract class format and session details */
export function extractClassContext(text: string): {
  className?: string;
  classFormat?: string;
  trainer?: string;
  sessionType?: string;
} {
  if (!text) return {};
  const lower = text.toLowerCase();
  const result: { className?: string; classFormat?: string; trainer?: string; sessionType?: string } = {};

  // Trainer
  const trainerHit = extractTrainer(text);
  if (trainerHit) result.trainer = trainerHit;

  // Session type
  if (/\b(private|pt|personal\s*training|1\s*on\s*1)\b/i.test(lower)) result.sessionType = "Private";
  else if (/\b(semi-private|duet)\b/i.test(lower)) result.sessionType = "Semi-Private";
  else if (/\b(group|class)\b/i.test(lower)) result.sessionType = "Group";

  // Specific class formats
  if (/\b(barre\s*57|barre)\b/i.test(lower)) result.classFormat = "Studio Barre 57";
  else if (/\b(powercycle|cycle|spin)\b/i.test(lower)) result.classFormat = "Studio PowerCycle";
  else if (/\b(strength\s*lab|strength)\b/i.test(lower)) result.classFormat = "Studio Strength Lab";
  else if (/\b(studio\s*fit|fit)\b/i.test(lower)) result.classFormat = "Studio FIT";
  else if (/\b(hiit)\b/i.test(lower)) result.classFormat = "Studio HIIT";
  else if (/\b(sweat\s*in\s*30|sweat)\b/i.test(lower)) result.classFormat = "Studio SWEAT In 30";
  else if (/\b(mat\s*57|mat)\b/i.test(lower)) result.classFormat = "Studio Mat 57";
  else if (/\b(cardio\s*barre)\b/i.test(lower)) result.classFormat = "Studio Cardio Barre";
  else if (/\b(back\s*body\s*blaze)\b/i.test(lower)) result.classFormat = "Studio Back Body Blaze";
  else if (/\b(foundations)\b/i.test(lower)) result.classFormat = "Studio Foundations";
  else if (/\b(recovery)\b/i.test(lower)) result.classFormat = "Studio Recovery";
  else if (/\b(pre\/?post\s*natal|prenatal|postnatal)\b/i.test(lower)) result.classFormat = "Studio Pre/Post Natal";

  return result;
}

/** Extract category and subcategory based on strong operational signals */
export function extractCategory(
  text: string
): { category?: string; subcategory?: string; confidence?: number } {
  if (!text) return {};
  const lower = text.toLowerCase();

  const rules: Array<{
    category: string;
    subcategories: Array<{ name: string; triggers: string[] }>;
  }> = [
    {
      category: "Safety and Security",
      subcategories: [
        { name: "Emergency Response", triggers: ["fire", "smoke", "flames", "burning", "alarm", "emergency"] },
        { name: "First Aid Kit", triggers: ["first aid", "bandage", "medical", "bleeding"] },
        { name: "Slip and Fall", triggers: ["slip", "slipped", "fell", "tripped", "slippery", "hazard"] },
        { name: "Incident Reports", triggers: ["injury", "hurt", "injured", "sprain", "fracture"] },
        { name: "Security Breach", triggers: ["break in", "broken lock", "trespass", "unauthorized", "suspicious"] },
      ],
    },
    {
      category: "Repair and Maintenance",
      subcategories: [
        { name: "Plumbing Leaks", triggers: ["leak", "leaking", "water leak", "tap", "faucet", "flush", "pipe", "drain", "clogged", "overflow", "shower head"] },
        { name: "AC and HVAC Issues", triggers: ["ac", "a/c", "air condition", "air con", "hvac", "cooling", "warm air", "not cooling", "compressor"] },
        { name: "Lighting Issues", triggers: ["light bulb", "light flickering", "lights out", "dark", "lighting", "electricity", "switchboard"] },
        { name: "Broken Equipment Not Repaired", triggers: ["broken bike", "reformer broken", "spring broken", "pedal broken", "mat torn", "equipment not working", "malfunctioning", "broken"] },
        { name: "Door Lock Issues", triggers: ["door lock", "lock broken", "jammed door", "keypad"] },
        { name: "Water Dispenser Issues", triggers: ["water dispenser", "water filter", "drinking water"] },
      ],
    },
    {
      category: "Tech Issues",
      subcategories: [
        { name: "Mic Not Working", triggers: ["mic", "microphone", "audio cut", "mic not working", "headset"] },
        { name: "Speakers Static Noise", triggers: ["speaker", "sound system", "static", "speaker buzzing"] },
        { name: "Studio Wi-Fi Not Working", triggers: ["wifi", "wi-fi", "internet down", "no connection", "network down", "router"] },
        { name: "Booking System Errors", triggers: ["booking error", "momence down", "check in sync", "cannot book", "app crash"] },
      ],
    },
    {
      category: "Operating Systems",
      subcategories: [
        { name: "iPad Functionality", triggers: ["ipad", "tablet", "screen frozen", "front desk ipad"] },
        { name: "POS System Malfunctions", triggers: ["pos", "card machine", "payment terminal", "swipe machine"] },
        { name: "Router Connectivity", triggers: ["router down", "router connectivity", "wi-fi router"] },
      ],
    },
    {
      category: "Studio Amenities and Facilities",
      subcategories: [
        { name: "Studio Odour and Aroma", triggers: ["smell", "odour", "odor", "stink", "smells bad", "aroma"] },
        { name: "Cleanliness and Hygiene", triggers: ["dirty", "unhygienic", "cleanliness", "dust", "garbage", "trash"] },
        { name: "Locker Availability", triggers: ["locker", "locker jammed", "locker lock", "locker stuck", "broken locker"] },
        { name: "Shower Water Pressure", triggers: ["shower water", "low pressure", "cold shower", "no hot water"] },
      ],
    },
    {
      category: "Theft and Lost Items",
      subcategories: [
        { name: "Missing Member Item", triggers: ["lost", "missing", "misplaced", "left behind", "forgot my", "stolen", "theft", "valuable"] },
      ],
    },
    {
      category: "Class Experience",
      subcategories: [
        { name: "Bad Odour", triggers: ["bad odour in class", "smells bad in studio", "sweat odour"] },
        { name: "Audio Issues", triggers: ["music too loud", "can't hear music", "sound distorted"] },
        { name: "Studio Temperature Too Hot/Cold", triggers: ["too hot in class", "too cold in class", "freezing in class", "sweating buckets"] },
        { name: "Overcrowding in Class", triggers: ["overcrowded", "no space between mats", "too packed"] },
      ],
    },
    {
      category: "Trainer Feedback",
      subcategories: [
        { name: "Trainer Punctuality Issues", triggers: ["trainer late", "class started late", "trainer delayed"] },
        { name: "Trainer Behaviour", triggers: ["rude trainer", "unprofessional", "trainer attitude", "behaviour"] },
        { name: "Trainer Forgot Names", triggers: ["forgot names", "doesn't know name"] },
        { name: "Class Intensity Too High/Low", triggers: ["too intense", "too difficult", "too easy", "intensity"] },
      ],
    },
    {
      category: "Scheduling",
      subcategories: [
        { name: "Time Change", triggers: ["change time", "reschedule class", "move class time"] },
        { name: "Cancellation Policy", triggers: ["cancellation fee", "late cancel", "cancel class"] },
        { name: "Waitlist Concerns", triggers: ["waitlist", "wait list", "spot opened"] },
      ],
    },
  ];

  let best = { score: 0, category: "", subcategory: "" };

  for (const rule of rules) {
    for (const sub of rule.subcategories) {
      const matches = sub.triggers.filter((t) => lower.includes(t)).length;
      if (matches > best.score) {
        best = { score: matches, category: rule.category, subcategory: sub.name };
      }
    }
  }

  // Cross check with CATEGORY_MAP to ensure valid canonical subcategory
  if (best.score > 0 && best.category && CATEGORY_MAP[best.category]) {
    const validSubs = CATEGORY_MAP[best.category];
    // Find closest matching subcategory if not exact
    const exact = validSubs.find((s) => s.toLowerCase() === best.subcategory.toLowerCase());
    const matchedSub = exact || validSubs.find((s) => lower.includes(s.toLowerCase())) || validSubs[0];
    return {
      category: best.category,
      subcategory: matchedSub,
      confidence: best.score,
    };
  }

  return {};
}

/** Extract timing / incidentAt from message */
export function extractIncidentTime(text: string): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();

  if (/\b(just now|right now|moment ago|a second ago|fresh)\b/i.test(lower)) return "Just now";
  if (/\b(this morning|earlier today|this afternoon|this evening|today)\b/i.test(lower)) return "Earlier today";
  if (/\b(yesterday)\b/i.test(lower)) return "Yesterday";
  if (/\b(this week|earlier this week)\b/i.test(lower)) return "Earlier this week";
  if (/\b(last week)\b/i.test(lower)) return "Last week";
  if (/\b(ongoing|recurring|keeps happening|always|every day)\b/i.test(lower)) return "Ongoing / recurring";

  return undefined;
}

/**
 * Main extraction function: extract all context from message
 * Automatically extracts: studio, category, subcategory, area, class format,
 * trainer, timing, class impact, reportedBy, and member details.
 */
export function extractContext(message: string): Record<string, unknown> {
  if (!message) return {};
  const extracted: Record<string, unknown> = {};

  const studio = extractStudio(message);
  if (studio) extracted.studio = studio;

  const { category, subcategory, confidence } = extractCategory(message);
  if (category) extracted.category = category;
  if (subcategory) extracted.subcategory = subcategory;
  if (confidence && confidence >= 1) {
    extracted._categoryInferred = true;
    if (confidence >= 2) extracted._categoryConfirmed = true;
  }

  const { className, classFormat, trainer, sessionType } = extractClassContext(message);
  if (className) extracted.className = className;
  if (classFormat) extracted.classFormat = classFormat;
  if (trainer) extracted.trainer = trainer;
  if (sessionType && !extracted.classFormat) extracted.classFormat = sessionType;

  const area = extractArea(message);
  if (area) extracted.area = area;

  const incidentAt = extractIncidentTime(message);
  if (incidentAt) extracted.incidentAt = incidentAt;

  // Class impact signals directly from natural language
  if (/\b(during class|in class|mid-class|middle of class|class in progress|while teaching|during a session|blocking class)\b/i.test(message)) {
    extracted.isClassImpacted = "Yes, blocking now";
  } else if (/\b(before class|upcoming class|next class|will be in class|about to start)\b/i.test(message)) {
    extracted.isClassImpacted = "Not yet, but it will be";
  }

  // Immediate danger / safety signals
  if (/\b(danger|emergency|fire|smoke|injured|bleeding|severe)\b/i.test(message)) {
    extracted.isImmediateDanger = "Yes — happening now";
  }

  // Reporter source detection
  if (/\b(colleague|coworker|co-worker|team(?:mate| member)?|associate|staff)\b.*\b(flagged|told|reported|mentioned|raised|said)\b|\b(flagged|told|reported|mentioned|raised|said)\b.*\bby (?:a |my )?(colleague|coworker|associate|staff)\b/i.test(message)) {
    extracted.reportedBy = "A colleague flagged it to me";
    extracted.memberLookupDone = true;
    extracted.memberName = "Studio team observation";
    extracted.memberEmail = "";
    extracted.studioReport = true;
  } else if (/\b(member|client|community member|guest)\b.*\b(told|said|reported|mentioned|shared|asked|complained)\b/i.test(message)) {
    extracted.reportedBy = "A member told me about it";
    const nameMatch = message.match(/(?:member|client|guest|named?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch) extracted.memberName = nameMatch[1];
  } else if (/\b(i |we )(noticed|saw|found|spotted|observed|checked)\b/i.test(message)) {
    extracted.reportedBy = "I noticed this myself";
    extracted.memberLookupDone = true;
    extracted.memberName = "Studio team observation";
    extracted.memberEmail = "";
    extracted.studioReport = true;
  }

  return extracted;
}

/**
 * Determine which fields are already known and can be skipped
 */
export function determineSkippableFields(
  collected: Record<string, unknown>
): string[] {
  const skippable: string[] = [];

  if (collected.studio) skippable.push("studio");
  if (collected.category && collected.subcategory) {
    skippable.push("category");
    skippable.push("subcategory");
    skippable.push("confirmCategory");
  }
  if (collected.trainer) skippable.push("trainer");
  if (collected.classFormat) skippable.push("classFormat");
  if (collected.area) skippable.push("area");
  if (collected.incidentAt) skippable.push("incidentAt");
  if (collected.memberLookupDone || collected.studioReport) skippable.push("memberLookup");

  return skippable;
}
