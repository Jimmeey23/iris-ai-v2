/**
 * The line a ticket is known by.
 *
 * Titles used to be built from the taxonomy: subcategory, class format and studio joined
 * with separators, giving rows like "Waitlist Concerns · Studio Barre 57 · Kwality House".
 * That says which drawer the ticket was filed in. It does not say what happened, so a list
 * of twenty tickets in one subcategory read as twenty copies of the same line and the only
 * way to tell them apart was to open each one.
 *
 * A label here answers "what is this about?" in one glance, taken from what the reporter
 * actually said. Classification still exists — it is shown as chips beside the label — so
 * nothing is lost by no longer repeating it in the title.
 */

/** Openers that carry no information. Stripped before the first sentence is taken. */
const OPENERS = [
  // A salutation is the greeting plus at most a short address ("Hi team,", "Hey Shifa,").
  // Matching everything up to the first full stop instead swallowed the whole sentence.
  /^(hi|hiya|hello|hey|dear)\b(\s+(team|all|there|guys|folks|everyone|ops|support|[A-Z][a-z]+)){0,2}\s*[,!.:;—–-]*\s*/i,
  /^(good\s+(morning|afternoon|evening))\b(\s+(team|all|everyone))?\s*[,!.:;—–-]*\s*/i,
  // The subject is optional: once "Hi team," is removed, what remains is "just wanted to
  // report that ...", with no "I" left to anchor on.
  /^((i|we)\s+)?(just\s+)?(wanted|want|would like|need)\s+to\s+(report|raise|flag|log|mention|share|say|let\s+you\s+know)\b(\s+that)?[,:]?\s*/i,
  /^just\s+(reporting|flagging|logging|raising)\b[,:]?\s*/i,
  /^(this is|i am|i'm)\s+(reporting|raising|flagging|writing)\s+(about|regarding|to report)?\s*/i,
  /^(please\s+(be\s+advised|note)( that)?|kindly\s+note( that)?|fyi)\b[,:]?\s*/i,
  /^(there\s+(is|was|has been)\s+(an?\s+)?(issue|problem|complaint)\s+with)\s+/i,
  /^(reporting|raising|logging|flagging)\s*[:-]\s*/i,
  /^(issue|problem|complaint|request|feedback)\s*[:-]\s*/i,
  /^(the\s+)?(member|client|guest)\s+(has\s+)?(reported|said|mentioned|complained)\s+(that\s+)?/i,
  /^that\s+/i,
];

/** Punctuation left stranded once an opener in front of it is removed. */
const STRANDED_PUNCTUATION = /^\s*[,!.:;—–-]+\s*/;

/**
 * Subcategory names are Title Case drawer labels: "Waitlist Concerns", "TFA Malfunction".
 * They are what the filing cabinet calls the drawer, not what happened, and lowercasing one
 * does not fix that — "waitlist concerns" still has to be translated by whoever reads it.
 *
 * These are the translations, used whenever the reporter left nothing usable of their own to
 * quote. Each one is written as the clause it would occupy in a sentence, so the fallback
 * label reads as a statement ("Microphone not working at Kwality House") rather than as a
 * category heading. Only the subcategories where the drawer label genuinely misleads or
 * reads as jargon are listed; a name that already says what happened ("Plumbing Leaks",
 * "Locker Theft") is left to the lowercasing path below.
 */
const SUBCATEGORY_PHRASES: Record<string, string> = {
  // Scheduling — the drawer names are all nouns; the member's problem is a verb.
  'Time Change': 'class time changed',
  'Level Change': 'class level changed',
  'Additional Classes': 'request for more classes',
  'Trainer Preferences': 'request for a specific trainer',
  'Class Capacity Issues': 'class is full',
  'Waitlist Concerns': 'waitlist did not clear',
  'Studio Timings': 'studio opening hours',
  'Session Length': 'class length',
  'Cancellation Policy': 'cancellation policy query',
  'Booking Restrictions': 'cannot book — restriction applied',
  'Class Substitutions': 'class was substituted',
  'Trainer Substitutions': 'trainer was substituted',
  'Last-minute Cancellations': 'class cancelled at short notice',
  'Late Arrival Policy': 'late arrival policy query',
  'Rescheduling Flexibility': 'wants to reschedule',
  'Booking Confirmation Issues': 'no booking confirmation received',
  'Class Overbooking / Unregistered Attendance': 'class overbooked — unregistered attendance',
  'Class Schedule Delay / Internal Follow-up': 'class schedule delayed',
  'Private Group Booking / Guestlist Management': 'private group booking',
  'Class Capacity & Schedule Gaps': 'gaps in the class schedule',
  'Workshop / Event Capacity & Planning': 'workshop capacity and planning',
  'Holiday and Festival Class Planning': 'holiday class schedule',
  'Early Morning/Late Night Class Availability': 'no early or late classes available',
  'Weekend vs. Weekday Class Balance': 'weekend and weekday class balance',
  'Special Request Accommodations': 'special request from a member',

  // Class experience — what the member felt in the room.
  'Bad Odour': 'bad smell in the studio',
  'Audio Issues': 'audio problem in class',
  'Studio Temperature Too Hot/Cold': 'studio too hot or too cold',
  'Overcrowding in Class': 'class too crowded',
  'Class Flow and Pacing': 'class pacing',
  'Modifications in Routine': 'routine modifications',
  'Engagement with Clients': 'trainer engagement with the room',
  'Hands-on Adjustments': 'hands-on adjustments',
  'Demonstration and Visual Cues': 'demonstration and cueing',
  'Knowledge and Competence': 'trainer knowledge',
  'Brand Language Usage': 'brand language in class',
  'Grooming and Appearance': 'grooming and appearance',
  'Class Format Satisfaction': 'class format feedback',
  'Class Duration Suitability': 'class length does not suit',
  'Instructor Energy and Motivation': 'trainer energy in class',
  'Class Variety and Themes': 'wants more class variety',
  'Adjustments for Different Fitness Levels': 'class not adjusted for fitness level',
  'Challenges in Following Instructor': 'hard to follow the trainer',
  'Member Injury During Class': 'member injured during class',
  'Physical Discomfort During Class (cramping / dizziness)': 'member felt unwell in class',
  'Class Frequency and Format Preference': 'class frequency and format preference',

  // Trainer feedback.
  'Trainer Forgot Names': 'trainer did not know members by name',
  'Class Intensity Too High/Low': 'class intensity too high or too low',
  'Trainer Hygiene': 'trainer hygiene',
  'Trainer Punctuality Issues': 'trainer not on time',
  'Trainer Behaviour': 'trainer conduct',
  'Pre and Post-Class Outreach': 'no outreach before or after class',
  'Trainer Availability': 'trainer availability',
  'Feedback Handling': 'how feedback was handled',
  'Emergency Preparedness': 'emergency preparedness',
  'Trainer Focus on Individual Needs': 'trainer did not attend to individual needs',
  'Class Ending on Time': 'class did not end on time',
  'Trainer Encouragement': 'trainer encouragement',
  'Injury Prevention and Safety': 'injury prevention and safety',
  'Too Many Corrections vs. Too Few': 'too many or too few corrections',
  'Trainer No-Show / Late Arrival': 'trainer did not turn up',
  'Instructor Music Balance & Schedule Fit': 'music balance in class',
  'Trainer Experience and Intensity Consistency': 'inconsistent class intensity between trainers',

  // Repair and maintenance — the drawer names here are the most jargon-heavy in the taxonomy.
  'AC and HVAC Issues': 'air conditioning not working',
  'TFA Malfunction': 'fresh-air unit (TFA) not working',
  'Lighting Issues': 'lighting not working',
  'Studio System Malfunction': 'studio system not working',
  'Pest Control Needed': 'pest control needed',
  'Staff Uniforms Not Clean': 'staff uniforms not clean',
  'Toiletries and Supplies Low': 'toiletries running low',
  'Towel Availability Issues': 'not enough clean towels',
  'General Maintenance Delays': 'maintenance job still not done',
  'Uncomfortable Lounge Seating': 'lounge seating uncomfortable',
  'Air Fresheners Too Strong': 'air freshener too strong',
  'Music System Too Loud/Low': 'music system too loud or too quiet',
  'Vending Machine Out of Stock': 'vending machine empty',
  'Additional Waiting Area Seating': 'more seating needed in the waiting area',
  'Door Lock Issues': 'door lock not working',
  'Fire Safety Compliance': 'fire safety compliance',
  'Water Dispenser Issues': 'water dispenser not working',
  'Dust and Mold in Corners': 'dust and mould in the corners',
  'Broken Equipment Not Repaired': 'broken equipment still not repaired',
  'PowerCycle Bike Fault (Stages SC3)': 'PowerCycle bike fault',
  'Standard Operating Procedure (SOP) — create / update': 'SOP to write or update',
  'Vendor / AMC Management': 'vendor and AMC management',
  'Retail & Boutique Stock Replenishment': 'boutique stock needs replenishing',
  'Attendance / Check-in Discrepancy': 'check-in record does not match',

  // Amenities and facilities.
  'Studio Odour and Aroma': 'smell in the studio',
  'Cleanliness and Hygiene': 'cleanliness needs attention',
  'Ventilation Poor': 'poor ventilation',
  'Air Quality Poor': 'poor air quality',
  'Ventilation and Air Quality': 'ventilation and air quality',
  'Valet Issues': 'problem with valet parking',
  'Locker Availability': 'not enough lockers free',
  'Shower Water Pressure': 'low shower water pressure',
  'Steam Room Not Working': 'steam room out of order',
  'Boutique Availability Issues': 'boutique stock not available',
  'Wi-Fi Slow': 'Wi-Fi slow',
  'Integration Issues': 'systems not talking to each other',
  'Lost and Found Disorganization': 'lost and found needs sorting',
  'Availability of Gym Accessories': 'gym accessories not available',
  'Member Lounge Cleanliness': 'member lounge needs cleaning',
  'Smoothie Bar and Refreshments': 'smoothie bar and refreshments',
  'Equipment Layout / Weights Arrangement': 'equipment and weights left badly arranged',
  'Community Events and Social Engagement': 'community events and engagement',
  'Sustainable and Eco-Friendly Practices': 'sustainability practices',
  'Additional Membership Perks': 'request for more membership perks',
  'Fitness Challenges and Rewards': 'fitness challenges and rewards',

  // Operating systems and tech — product names mean nothing on their own in a list.
  'Moments Notice': 'Momence app problem',
  'Stripe and Razorpay': 'payment gateway problem (Stripe / Razorpay)',
  'Yellow Messenger': 'Yellow Messenger chatbot problem',
  'Website Glitches': 'website not working properly',
  'Router Connectivity': 'router dropping connection',
  'iPad Functionality': 'front-desk iPad not working',
  'Cash Counting Machine Issues': 'cash counting machine not working',
  'POS System Malfunctions': 'card machine / POS not working',
  'CRM System Errors': 'CRM throwing errors',
  'Data Security Issues': 'data security concern',
  'Technical Assistance': 'needs technical help',
  'Difficulty Tracking Sessions': 'sessions not tracking correctly',
  'System Delays': 'system running slow',
  'Software Bugs': 'software bug',
  'Mobile App UI/UX Issues': 'app hard to use',
  'Attendance Record Discrepancies': 'attendance records do not match',
  'Missed Sessions Not Recorded': 'missed sessions not recorded',
  'Mobile App Freezing': 'app freezing',
  'Delayed Notifications': 'notifications arriving late',
  'Error in Class Listings': 'class listing shows the wrong detail',
  'Laptops Not Functioning': 'front-desk laptop not working',
  'Speakers Static Noise': 'speakers crackling',
  'Mic Not Working': 'microphone not working',
  'Phones Not Working': 'studio phone not working',
  'App Performance Bugs': 'app running badly',
  'Booking System Errors': 'booking system error',
  'Password and Login Issues': 'cannot sign in',
  'Payment Processing Delays': 'payment did not go through',
  'Online Class Streaming Buffering': 'online class keeps buffering',
  'Notifications Not Received': 'notifications not arriving',
  'Auto-Debit Incorrect Charges': 'auto-debit charged the wrong amount',
  'Social Media Glitches': 'social media page not working',
  'Wrong Class Bookings': 'booked into the wrong class',
  'Incorrect Charges on Account': 'incorrect charge on the account',
  'Camera Surveillance Issues': 'CCTV camera not working',
  'Digital Receipts and Invoices': 'receipt or invoice not received',
  'Website Navigation Difficulties': 'cannot find things on the website',
  'Virtual Class Video Quality': 'poor video quality in a virtual class',
  'Studio Wi-Fi Not Working': 'studio Wi-Fi down',
  'Studio Music Preferences': 'music choice in the studio',

  // Pricing and memberships.
  'Price Transparency': 'pricing not clear',
  'Membership Flexibility': 'wants a more flexible membership',
  'Discounts and Offers Confusion': 'confusion about an offer',
  'Refund and Cancellation Policy Issue': 'refund or cancellation dispute',
  'Auto-Renewal Concerns': 'membership auto-renewed',
  'Transparency in TandC/': 'terms and conditions not clear',
  'Add-on Services Pricing Clarity': 'add-on pricing not clear',
  'Class Pack Expiry Confusion': 'class pack expiry dispute',
  'Private Session Pricing': 'private session pricing',
  'Membership Upgrade/Downgrade': 'wants to change membership plan',
  'Lack of Payment Plan Options': 'wants a payment plan',
  'Referral Discount Issues': 'referral discount not applied',
  'Holiday and Special Pricing Clarity': 'holiday pricing not clear',
  'Corporate Wellness Program Pricing': 'corporate wellness pricing',
  'Pricing for International Clients': 'pricing for an international member',
  'Membership Pause and Freeze Policy': 'wants to pause the membership',
  'Loyalty Program Issues': 'loyalty programme problem',
  'Policy Non-Compliance / Unauthorised Refunds': 'refund given outside policy',
  'Studio Location & Pricing Preference': 'studio location and pricing preference',

  // Customer service.
  'Delay in Response': 'nobody responded in time',
  'Unresolved Complaints': 'complaint still unresolved',
  'Front Desk Attitude': 'front desk attitude',
  'Miscommunication on Offers': 'an offer was explained wrongly',
  'Response Time to Queries': 'slow to answer a query',
  'Follow-up Post Inquiry': 'no follow-up after an enquiry',
  'Friendliness and Approachability': 'staff approachability',
  'Call Handling Etiquette': 'how a call was handled',
  'Clarity in Policies': 'policy not explained clearly',
  'Late Response to Complaints': 'complaint answered late',
  'Handling of Complaints': 'how a complaint was handled',
  'Feedback Follow-up Process': 'feedback never followed up',
  'Compensation for Service Issues': 'asking for compensation',
  'Over-promising and Under-delivery': 'promised more than was delivered',
  'Response to Negative Reviews': 'response to a negative review',
  'Knowledge of Membership Policies': 'staff unsure of membership policy',
  'Proactive Client Engagement': 'proactive member engagement',
  'Competitor Solicitation / Client Poaching': 'competitor approaching our members',
  'Lead Conversion / Engagement Strategy': 'lead conversion',
  'Lead Management / Sales Tracking': 'lead tracking',
  'Lead Follow-up / Missing Contact Details': 'lead has no contact details',
  'Customer Retention Strategies': 'member retention',
  'Training of Customer Service Team': 'customer service team training',
  'Training of Sales Team': 'sales team training',

  // Safety and security — these must read as the hazard, not as a policy area.
  'Emergency Exits Blocked': 'emergency exit blocked',
  'Panic Button Malfunction': 'panic button not working',
  'Unlocked Doors': 'door left unlocked',
  'CCTV Malfunction': 'CCTV not working',
  'Security Guard Issues': 'problem with the security guard',
  'Client Harassment Reports': 'member reported harassment',
  'Harassment Reports': 'harassment reported',
  'Fire Drills Not Conducted': 'fire drill overdue',
  'Suspicious Individuals Inside Studio': 'suspicious person in the studio',
  'Front Desk Not Checking IDs': 'front desk not checking IDs',
  'Unregistered Walk-ins': 'unregistered walk-in',
  'Trespassing Concerns': 'trespassing',
  'Personal Safety Concerns': 'personal safety concern',
  'Data Breach Concerns': 'possible data breach',
  'Employee Security Training': 'staff security training',
  'Reporting Suspicious Activity': 'suspicious activity reported',
  'Staff Security Concerns': 'staff safety concern',
  'Handling of Medical Emergencies': 'how a medical emergency was handled',
  'First Aid Kit Availability': 'first aid kit missing or incomplete',
  'Unauthorized Use of Equipment': 'equipment used without permission',

  // Theft and lost items.
  'Stolen Personal Items': 'personal belongings stolen',
  'Misplaced Valuables': 'valuables missing',
  'Items Taken from Boutique': 'items taken from the boutique',
  'Items Left Behind by Clients': 'member left belongings behind',
  'Studio Lost and Found Management': 'lost and found management',
  'Reporting Stolen Items': 'theft reported',
  'Theft Prevention Measures': 'theft prevention',
  'Theft Investigation Process': 'theft investigation',
  'Personal Items Taken from Trainer Area': 'items taken from the trainer area',
  'Issues with Valet Theft': 'theft involving valet parking',
  'Theft by Other Members': 'theft by another member',
  'Lost Shoes/Workout Gear': 'lost shoes or workout gear',
  'Safe Storage for Client Bags': 'no safe storage for member bags',
  'Clients Forgetting Items in Studio': 'member forgot something in the studio',
  'Missing Towels': 'towels missing',
  'Theft During Busy Hours': 'theft during a busy class',
  'Members Taking Extra Equipment': 'members taking extra equipment',
  'Coffee and Refreshments Options': 'coffee and refreshment options',

  // Brand.
  'Brand Identity Consistency': 'brand identity used inconsistently',
  'Marketing Message Accuracy': 'marketing message is inaccurate',
  'Brand Tone Consistency': 'brand tone inconsistent',
  'Staff Wearing Incorrect Branding': 'staff in the wrong branding',
  'Merchandise Display Issues': 'merchandise display',
  'Merchandise Quality': 'merchandise quality',
  'Newsletter Effectiveness': 'newsletter not landing',
  'Perception of Pricing Value': 'value for money perception',
  'Marketing Collateral Production & Review': 'marketing collateral to produce or review',
  'Partnership / Collab Approval': 'partnership approval needed',
  'Post-Event Lead Reporting': 'post-event lead report',
  'Client Testimonials Management': 'member testimonials',
  'Client Loyalty Recognition': 'recognising loyal members',
  'Member Recognition Efforts': 'recognising members',
  'Member Recognition Events': 'member recognition event',

  // Miscellaneous — the drawer name is the least informative in the taxonomy, so these matter.
  'Music Volume Issues': 'music too loud or too quiet',
  'Studio Decor and Ambience': 'studio decor and ambience',
  'Mobile Charging Stations': 'wants somewhere to charge a phone',
  'Late-Night Class Safety': 'safety after a late class',
  'Noise Complaints from Neighbors': 'noise complaint from a neighbour',
  'Misplaced Equipment': 'equipment not where it should be',
  'Temperature Control Inconsistency': 'temperature keeps changing',
  'Scent Sensitivities': 'sensitive to the studio scent',
  'Lighting Preferences': 'lighting preference',
  'Cold Air Drafts': 'cold draught in the studio',
  'Overcrowding in Lobby': 'lobby too crowded',
  'Construction Noise Nearby': 'construction noise nearby',
  'Child-Friendly Facilities': 'wants child-friendly facilities',
  'Outdoor Signage Visibility': 'outdoor signage hard to see',
  'Feedback Fatigue': 'too many feedback requests',
  'Personal Storage Lockers Needed': 'wants a personal storage locker',
  'Background Music Selection': 'background music choice',
  'Social Media Response Time': 'slow to reply on social media',
  'Customer Flow Management': 'managing member flow through the studio',

  // Internal operations — written for the person who has to action them.
  'Internal Operations Memo / Escalation': 'internal escalation',
  'SOP & Policy Governance (issue, version, publish)': 'SOP or policy to publish',
  'Quality Assurance Audit / Checklist Sign-off': 'QA audit sign-off',
  'Post-Class Session Reporting & Feedback Loop': 'post-class reporting',
  'Hosted Class / Event Lead Capture & Tracking': 'event lead capture',
  'Performance Review / Payroll / Leave (HR-Admin)': 'HR admin — review, payroll or leave',
  'HRIS & Shift Tooling Access (Zoho Shift)': 'shift tool access (Zoho)',
  'Handover / Shift Reporting Gap': 'shift handover missed',
  'Internal Communication Gap / Workflow Approval': 'internal approval or communication gap',
  'Business Intelligence & Report Request': 'report request',
  'B2B / Corporate Wellness Ops Feedback': 'corporate wellness operations feedback',
  'Studio Operations / Class Feedback (grid review)': 'studio operations review',
};

const FILLER_TAIL = /\s*(please advise|please help|kindly help|thanks?( you)?|regards|asap)\s*[.!]*$/i;

const clean = (v: string) => v.replace(/\s+/g, ' ').trim();

/** Trim to a word boundary rather than mid-word, and only add the ellipsis if we cut. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–—-]+$/, '') + '…';
}

/** Leaves acronyms and proper nouns alone — only the first character is touched. */
const sentenceCase = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);

/** "Waitlist Concerns" → "waitlist concerns", but "Wi-Fi" and "SLA" keep their shape. */
function lowerSubcategory(subcategory: string): string {
  return subcategory
    .split(' ')
    .map((word) => (/^[A-Z0-9][A-Z0-9-]+$/.test(word) || /-/.test(word) ? word : word.toLowerCase()))
    .join(' ');
}

/** The problem clause, for a label that is describing something that went wrong. */
function humanise(subcategory: string): string {
  return SUBCATEGORY_PHRASES[subcategory] ?? lowerSubcategory(subcategory);
}

/** The competency being scored, for a trainer assessment.
 *
 *  Deliberately *not* the phrase map: those are written as complaints ("trainer knowledge",
 *  "trainer did not turn up"), which is the wrong register for a scored form and reads as a
 *  finding rather than a heading — "Trainer assessment — Anisha Shah · Trainer knowledge"
 *  says the knowledge was the problem, which the score may well not say at all. */
const competency = (subcategory: string) => lowerSubcategory(subcategory);

/** A "Field name: value" line, as produced by every form and template submission. */
const FIELD_LINE = /^([A-Z][A-Za-z0-9 /&'()-]{2,44}):[ \t]*(.*)$/;

/** Values that answer a form field without describing anything. */
const EMPTY_ANSWER = /^(yes|no|n\/?a|none|nil|na|ok|okay|good|fine|-|—|\.)?$/i;

/** Field names that tend to hold the actual account of what happened, best first. */
const NARRATIVE_FIELDS = [
  /^(what happened|description|details?|issue|concern|complaint|problem|summary|comments?|notes?|feedback|observation)/i,
  /^(development areas?|areas? for improvement|key strengths?)/i,
];

/**
 * Splits a form-style description into its fields. Returns an empty array for free prose,
 * which is how the caller tells the two apart.
 */
function formFields(text: string): {name: string; value: string}[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fields: {name: string; value: string}[] = [];
  for (const line of lines) {
    const match = line.match(FIELD_LINE);
    if (match) fields.push({name: match[1].trim(), value: clean(match[2])});
    else if (fields.length) fields[fields.length - 1].value = clean(`${fields[fields.length - 1].value} ${line}`);
  }
  // One field out of six lines is prose that happens to contain a colon, not a form.
  return fields.length >= 1 && fields.length * 2 >= lines.length ? fields : [];
}

/** The most informative thing a form submission actually says. */
function fromForm(fields: {name: string; value: string}[]): string {
  const substantive = fields.filter((f) => f.value.length >= 15 && !EMPTY_ANSWER.test(f.value));
  if (!substantive.length) return '';
  for (const pattern of NARRATIVE_FIELDS) {
    const hit = substantive.find((f) => pattern.test(f.name));
    if (hit) return hit.value;
  }
  return substantive[0].value;
}

/** The first sentence of what was written, with the throat-clearing removed. */
function firstStatement(description: string): string {
  let raw = (description || '').trim();
  if (!raw) return '';

  // Imported conversation threads open with the thread's own subject in brackets:
  // "[Client upset and wants to cancel membership] — Booking / Scheduling: ...".
  // That subject is the single most descriptive line in the record — far better than the
  // taxonomy that follows it — so it is preferred whenever it reads as a phrase rather
  // than an identifier.
  const tagged = raw.match(/^\[([^\]]{3,90})\]\s*[—–-]?\s*/);
  if (tagged) {
    const subject = clean(tagged[1]).replace(/[.\s]+$/, '');
    if (subject.length >= 15 && subject.split(/\s+/).length >= 3) return clip(subject, LABEL_MAX);
    const untagged = raw.slice(tagged[0].length).trim();
    if (untagged.length >= 20) raw = untagged;
  }

  // Imported threads summarise themselves under "Key statements:". The first bullet is the
  // substance; the rest are message counts and dates.
  const bullet = raw.match(/key statements?:\s*\n\s*[•*-]\s*(.+)/i);
  if (bullet) {
    const first = clean(bullet[1]);
    if (first.length >= 15 && !/^thread has \d+ message/i.test(first)) return clip(first, LABEL_MAX);
  }

  // Form submissions are not prose: taking their first sentence yields "Development areas: No".
  const fields = formFields(raw);
  if (fields.length) {
    const value = fromForm(fields);
    if (!value) return '';
    const stop = value.search(/[.!?](\s|$)/);
    return clean((stop > 0 ? value.slice(0, stop) : value).replace(FILLER_TAIL, ''));
  }

  let text = clean(raw);
  let changed = true;
  // Openers stack: "Hi, just wanted to report that the mic is dead."
  while (changed) {
    changed = false;
    for (const opener of OPENERS) {
      const next = text.replace(opener, '').replace(STRANDED_PUNCTUATION, '');
      if (next !== text) { text = next; changed = true; }
    }
  }
  const stop = text.search(/[.!?](\s|$)/);
  let sentence = stop > 0 ? text.slice(0, stop) : text;
  // A very short first sentence ("It broke.") is usually a lead-in; take the next one too.
  if (sentence.length < 25 && stop > 0) {
    const rest = text.slice(stop + 1);
    const nextStop = rest.search(/[.!?](\s|$)/);
    const second = nextStop > 0 ? rest.slice(0, nextStop) : rest;
    if (second.trim()) sentence = `${sentence}. ${second.trim()}`;
  }
  return clean(sentence.replace(FILLER_TAIL, ''));
}

export interface LabelInput {
  description?: string | null;
  memberName?: string | null;
  subcategory?: string | null;
  category?: string | null;
  kind?: string | null;
  studio?: string | null;
  classFormat?: string | null;
  trainer?: string | null;
  sentiment?: string | null;
}

export const LABEL_MAX = 76;

/** Names the intake and the automations file under when no particular person is involved. */
const PLACEHOLDER_NAME = /^(studio team( observation)?|automated follow-up|member|client|n\/?a|none|unknown|internal|staff|-)\b/i;

/**
 * A short, readable description of what the ticket is about: the issue in the reporter's
 * own words first, then who it concerns and where — "Member upset the trainer skipped her
 * modifications — Sanjanaa Aswani · Supreme HQ". The who-and-where tail is what tells two
 * similar complaints apart on a busy board, so it is kept whole and only the issue is clipped.
 *
 * Falls back to a humanised subcategory — never to a bare taxonomy string, because that is
 * the thing this replaces.
 */
export function describeTicket(input: LabelInput, maxLength = LABEL_MAX): string {
  const studioShort = input.studio ? input.studio.split(',')[0].trim() : '';
  const format = input.classFormat ? input.classFormat.split('+')[0].trim() : '';
  const praise = input.kind === 'compliment' || input.sentiment === 'positive';
  const member = input.memberName && !PLACEHOLDER_NAME.test(input.memberName.trim()) ? clean(input.memberName) : '';
  const tail = [member, studioShort].filter(Boolean).join(' · ');
  // The workspace's label length caps the issue, not the names after it: clipping "Sanjanaa
  // Aswani" to "Sanjanaa A…" saves nothing anyone wanted saved.
  const withTail = (issue: string) => tail ? `${clip(issue, maxLength)} — ${tail}` : clip(issue, maxLength);

  // A trainer assessment is a scored form, not an account of an incident. Its free-text
  // fields are fragments ("Development areas: No"), so the readable label is who was
  // assessed and in what — which is also what somebody scanning the list is looking for.
  if (input.kind === 'assessment') {
    const who = input.trainer || input.memberName || '';
    const head = who ? `Trainer assessment — ${who}` : 'Trainer assessment';
    // The competency assessed is what differs between one trainer's assessments; the studio
    // is usually the same for all of them and so tells a reader nothing.
    const qualifier = input.subcategory ? sentenceCase(competency(input.subcategory)) : format || studioShort;
    return clip(qualifier ? `${head} · ${qualifier}` : head, maxLength);
  }

  const statement = firstStatement(input.description || '');
  // Anything shorter than this is not a description, it is a fragment ("broken", "see above").
  if (statement.length >= 14) return withTail(sentenceCase(statement));

  const subject = input.subcategory ? humanise(input.subcategory) : input.category ? humanise(input.category) : 'Studio issue';
  if (praise) {
    const forWhom = input.trainer || format;
    return withTail(forWhom ? `Appreciation for ${forWhom}` : 'Member appreciation');
  }
  // The class format and trainer distinguish a class complaint from its neighbours.
  const context = [format ? `in ${format}` : '', input.trainer ? `with ${input.trainer.split(',')[0].trim()}` : ''].filter(Boolean).join(' ');
  return withTail(sentenceCase(context ? `${subject} ${context}` : subject));
}

/** True when a stored title is one of the old taxonomy-joined strings, or is otherwise
 *  not telling a reader anything. Used to decide which historical rows to relabel. */
export function isGenericLabel(title: string, subcategory?: string | null, category?: string | null): boolean {
  const t = clean(title || '');
  if (!t) return true;
  // The old format: two or more segments joined by a middot.
  if (t.includes(' · ')) return true;
  if (subcategory && t.toLowerCase() === subcategory.toLowerCase()) return true;
  if (category && t.toLowerCase() === category.toLowerCase()) return true;
  // The intake form's old automatic title: "Engagement with Clients — Supreme HQ · Barre Studio".
  if (subcategory && t.toLowerCase().startsWith(subcategory.toLowerCase() + ' — ')) return true;
  if (t.toLowerCase() === 'member appreciation') return true;
  if (t.length < 14) return true;
  return false;
}
