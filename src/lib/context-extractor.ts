/**
 * PHASE 1: Context Extraction & Smart Conversation
 * Extracts studio, category, subcategory, class, trainer, area from first message
 * Skips asking for fields that are already known
 */

import { STUDIOS } from "./constants";

/** Map studio aliases to canonical studio names */
const STUDIO_ALIASES: Record<string, string> = {
  // Kwality House, Kemps Corner (Mumbai)
  kemps: "Kwality House, Kemps Corner",
  kwality: "Kwality House, Kemps Corner",
  "kemps corner": "Kwality House, Kemps Corner",

  // Supreme HQ, Bandra (Mumbai)
  bandra: "Supreme HQ, Bandra",
  shq: "Supreme HQ, Bandra",
  supreme: "Supreme HQ, Bandra",
  "supreme hq": "Supreme HQ, Bandra",

  // Kenkere House, Bengaluru
  kenkere: "Kenkere House, Bengaluru",
  bangalore: "Kenkere House, Bengaluru",
  bengaluru: "Kenkere House, Bengaluru",

  // Courtside, Mumbai
  courtside: "Courtside, Mumbai",

  // Copper & Cloves, Bengaluru
  copper: "the Studio by Copper & Cloves, Bengaluru",
  cloves: "the Studio by Copper & Cloves, Bengaluru",
  "c&c": "the Studio by Copper & Cloves, Bengaluru",
  "copper & cloves": "the Studio by Copper & Cloves, Bengaluru",

  // Indiranagar
  indiranagar: "Indiranagar Studio",
  "indiranagar studio": "Indiranagar Studio",
};

export function extractStudio(text: string): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();

  // Try exact alias matches first
  for (const [alias, canonical] of Object.entries(STUDIO_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }

  // If no alias, check if it's already a canonical studio name
  for (const studio of STUDIOS) {
    if (lower.includes(studio.name.toLowerCase())) return studio.name;
  }

  return undefined;
}

/**
 * Extract category and subcategory based on keywords in the message
 * Returns high-confidence matches to skip confirmation step
 */
export function extractCategory(
  text: string
): { category?: string; subcategory?: string; confidence?: number } {
  if (!text) return {};

  const lower = text.toLowerCase();
  const keywords: Record<string, { category: string; subcategories: Record<string, string[]> }> =
    {
      safety: {
        category: "Safety and Security",
        subcategories: {
          "Fire Hazard": ["fire", "burning", "caught fire", "flames", "smoke"],
          "Security Breach": ["break-in", "broken lock", "unlock", "trespasser"],
          "Hazardous Material": ["chemical", "spill", "leak", "toxic", "hazard"],
          "Slip and Fall": ["slippery", "wet floor", "tripped", "fell"],
        },
      },
      maintenance: {
        category: "Repair and Maintenance",
        subcategories: {
          "Equipment Malfunction": [
            "washing machine",
            "equipment",
            "broken",
            "not working",
            "malfunction",
            "faulty",
          ],
          "Structural Damage": ["ceiling", "wall", "floor", "damaged", "crack"],
          "Plumbing Issue": ["water", "drain", "leak", "pipe", "plumbing"],
          "Electrical Issue": ["electricity", "power", "light", "electrical"],
        },
      },
      tech: {
        category: "Tech Issues",
        subcategories: {
          "System Down": ["system down", "app crash", "server", "not working", "offline"],
          "Device Issue": ["mic", "microphone", "speaker", "camera", "device", "monitor"],
          "Network Problem": ["wifi", "internet", "connection", "network", "online"],
        },
      },
      theft: {
        category: "Theft and Lost Items",
        subcategories: {
          "Missing Member Item": ["lost", "missing", "can't find", "where is"],
        },
      },
      class: {
        category: "Class Operations and Booking",
        subcategories: {
          "Class Disruption": [
            "class disrupted",
            "cancelled",
            "interrupted",
            "member complaint",
            "trainer issue",
          ],
        },
      },
    };

  // Score each possibility
  let best = { score: 0, category: "", subcategory: "" };

  for (const [catKey, catData] of Object.entries(keywords)) {
    for (const [subcat, triggers] of Object.entries(catData.subcategories)) {
      const matches = triggers.filter((t) => lower.includes(t)).length;
      if (matches > best.score) {
        best = { score: matches, category: catData.category, subcategory: subcat };
      }
    }
  }

  return best.score > 0
    ? { category: best.category, subcategory: best.subcategory, confidence: best.score }
    : {};
}

/** Extract class/member context (class name, trainer, etc.) */
export function extractClassContext(text: string): {
  class?: string;
  trainer?: string;
  sessionType?: string;
} {
  if (!text) return {};
  const lower = text.toLowerCase();
  const result: { class?: string; trainer?: string; sessionType?: string } = {};

  // Common class names
  const classPatterns = [
    /\b(power|core|reformation|strength|sculpt|cycle|yoga|cardio|bootcamp|pilates)\b/gi,
  ];
  for (const pattern of classPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.class = match[0].toLowerCase();
      break;
    }
  }

  // Session type hints
  if (/private|pt|personal/i.test(lower)) result.sessionType = "Private";
  if (/group|class/i.test(lower)) result.sessionType = "Group";
  if (/semi|semi-private/i.test(lower)) result.sessionType = "Semi-Private";

  return result;
}

/** Extract studio area/location (studio 1/2/3, strength studio, studio floor, boutique, lounge, etc.) */
export function extractArea(text: string): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();

  const studioRoomMatch = text.match(/\b(studio\s*[1-9]|strength\s*(?:studio|lab)|barre\s*studio|main\s*studio(?:\s*floor)?)\b/i);
  if (studioRoomMatch) {
    const raw = studioRoomMatch[0];
    if (/studio\s*1/i.test(raw)) return "Studio 1";
    if (/studio\s*2/i.test(raw)) return "Studio 2";
    if (/studio\s*3/i.test(raw)) return "Studio 3";
    if (/strength/i.test(raw)) return "Strength Studio";
    if (/barre/i.test(raw)) return "Barre Studio";
    if (/main/i.test(raw)) return "Main Studio Floor";
  }

  const areas = [
    "studio floor",
    "main studio floor",
    "lounge",
    "boutique",
    "changing room",
    "locker room",
    "locker",
    "bathroom",
    "restroom",
    "reception",
    "front desk",
    "valet",
  ];
  for (const area of areas) {
    if (lower.includes(area)) {
      return area === "studio floor" || area === "main studio floor"
        ? "Main Studio Floor"
        : area.charAt(0).toUpperCase() + area.slice(1);
    }
  }

  return undefined;
}

/**
 * Main extraction function: extract all context from first message
 * Used by IRIS to skip asking for known fields
 */
export function extractContext(message: string): Record<string, unknown> {
  if (!message) return {};
  const studio = extractStudio(message);
  const { category, subcategory, confidence } = extractCategory(message);
  const { class: cls, trainer, sessionType } = extractClassContext(message);
  const area = extractArea(message);

  const extracted: Record<string, unknown> = {};

  if (studio) extracted.studio = studio;
  if (category) extracted.category = category;
  if (subcategory) extracted.subcategory = subcategory;
  if (confidence && confidence > 1) extracted._categoryInferred = true;
  if (cls) extracted.className = cls;
  if (trainer) extracted.trainer = trainer;
  if (sessionType) extracted.classFormat = sessionType;
  if (area) extracted.area = area;

  // Extract class impact signals directly from prose
  if (/\b(during class|in class|mid-class|middle of class|class in progress|while teaching|during a session)\b/i.test(message)) {
    extracted.isClassImpacted = "Yes, blocking now";
  } else if (/\b(before class|upcoming class|next class|will be in class|about to start)\b/i.test(message)) {
    extracted.isClassImpacted = "Not yet, but it will be";
  }

  return extracted;
}

/**
 * Determine which fields are already known and can be skipped
 * Returns array of field keys that should NOT be asked
 */
export function determineSkippableFields(
  collected: Record<string, unknown>
): string[] {
  const skippable: string[] = [];

  if (collected.studio) skippable.push("area"); // If studio known, location follows
  if (collected.category && collected.subcategory) skippable.push("confirmCategory");
  if (collected.className) skippable.push("class");
  if (collected.sessionType) skippable.push("classFormat");
  if (collected.area) skippable.push("location");

  return skippable;
}
