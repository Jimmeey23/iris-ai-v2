import { CATEGORY_MAP, CLASS_FORMATS, MEMBERSHIPS, STUDIOS, TRAINERS } from "./constants";
import type { CollectedTicket, TicketPriority } from "./types";

type Hit = { category: string; subcategory: string; score: number };

/** Colloquial names staff actually use for each studio. Order matters — more specific first. */
const STUDIO_ALIASES: Array<[string, string[]]> = [
  ["Kwality House, Kemps Corner", ["kwality", "kemps", "kemp's", "kempscorner", "kemps corner", "kh ", " kh", "khkc", "kwality house"]],
  ["Supreme HQ, Bandra", ["supreme", "shq", "s.h.q", "bandra", "supreme hq"]],
  ["Kenkere House, Bengaluru", ["kenkere", "kenkere house", "indiranagar", "blr kenkere"]],
  ["Courtside, Mumbai", ["courtside", "court side"]],
  ["the Studio by Copper & Cloves, Bengaluru", ["copper", "cloves", "copper & cloves", "copper and cloves", "c&c", "cnc studio", "cc studio"]],
];
export function matchStudio(text: string): string | undefined {
  const lower = " " + text.toLowerCase().replace(/[^a-z0-9&'. ]+/g, " ") + " ";
  for (const [name, aliases] of STUDIO_ALIASES) {
    for (const a of aliases) {
      const needle = a.startsWith(" ") || a.endsWith(" ") ? a : " " + a + " ";
      if (lower.includes(needle) || lower.replace(/\s+/g, " ").includes(a)) return name;
    }
  }
  // "studio 1 / studio 2" style references default to the flagship if nothing else given
  return undefined;
}
const SYSTEM_ALIASES: Array<[string, RegExp]> = [
  ["Momence", /\bmomence\b/i], ["POS / card machine", /\b(pos|card machine|swipe|payment terminal)\b/i], ["Wi-Fi / router", /\b(wi-?fi|wifi|router|internet|network)\b/i],
  ["Front desk iPad", /\b(ipad|tablet)\b/i], ["Website / mobile app", /\b(website|mobile app|the app|app crash)\b/i], ["Payment gateway (Stripe / Razorpay)", /\b(stripe|razorpay|gateway)\b/i],
  ["Audio / mic system", /\b(mic|microphone|headset|speaker|speakers|audio|sound system)\b/i], ["CCTV / surveillance", /\b(cctv|camera)\b/i], ["Access control / door lock", /\b(door lock|access control|keypad)\b/i],
  ["Cash counting machine", /\bcash (counting|machine)\b/i], ["Yellow Messenger", /\byellow messenger\b/i],
  ["Air conditioning / HVAC", /\b(a\.?c\.?|ac|air ?con|hvac|cooling|warm air)\b/i], ["Steam room", /\bsteam\b/i], ["Shower / plumbing", /\b(shower|tap|plumb|leak)/i], ["Lighting", /\b(light|lights|lighting)\b/i], ["PowerCycle bike", /\b(bike|bikes|flywheel|pedal)\b/i],
];
export function matchSystem(text: string): string | undefined {
  for (const [name, re] of SYSTEM_ALIASES) if (re.test(text)) return name;
  return undefined;
}
const AREA_ALIASES: Array<[string, RegExp]> = [
  ["Cycle studio", /\b(cycle studio|spin room|powercycle studio)\b/i], ["Strength Lab floor", /\bstrength lab\b/i],
  ["Main studio floor", /\b(studio ?1|studio one|main (studio|floor)|barre (studio|room)|the floor)\b/i], ["Reception / lobby", /\b(reception|lobby|front desk|entrance)\b/i],
  ["Locker room", /\b(locker|changing room|change room)\b/i], ["Showers / washroom", /\b(shower|washroom|bathroom|toilet|restroom|loo)\b/i], ["Member lounge", /\b(lounge|waiting area|cafe)\b/i],
  ["Boutique", /\b(boutique|retail|merch)\b/i], ["Parking / valet", /\b(parking|valet|car park)\b/i], ["Back office", /\b(back office|office|staff room)\b/i], ["Staircase / corridor", /\b(stairs|staircase|corridor|hallway)\b/i],
];
export function matchArea(text: string): string | undefined {
  for (const [name, re] of AREA_ALIASES) if (re.test(text)) return name;
  return undefined;
}

const EXTRA_KEYWORDS: Record<string, string[]> = {
  "Time Change": ["reschedule", "different time", "change the time", "move my class", "slot"],
  "Level Change": ["too advanced", "too beginner", "level", "foundations", "intermediate"],
  "Additional Classes": ["more classes", "add a class", "extra class", "need another"],
  "Trainer Preferences": ["prefer trainer", "only with", "favourite trainer", "request trainer"],
  "Class Capacity Issues": ["full class", "overcapacity", "no spots", "packed", "capacity"],
  "Waitlist Concerns": ["waitlist", "wait list", "spot opened", "next in line"],
  "Studio Timings": ["opening hours", "close early", "studio timing", "too late to open"],
  "Session Length": ["too short", "too long", "45 min", "57 minutes", "session length"],
  "Cancellation Policy": ["cancel policy", "late cancel", "cancellation fee", "window"],
  "Booking Restrictions": ["can't book", "cannot book", "restricted", "not allowed to book"],
  "Class Substitutions": ["class replaced", "format changed", "substituted class"],
  "Trainer Substitutions": ["sub trainer", "different instructor", "cover teacher", "subbed"],
  "Last-minute Cancellations": ["cancelled last minute", "class cancelled", "called off"],
  "Late Arrival Policy": ["late arrival", "arrived late", "cut off", "door closed"],
  "Special Request Accommodations": ["injury modify", "special request", "accommodate", "pregnant"],
  "Early Morning/Late Night Class Availability": [
    "early morning",
    "late night",
    "6am",
    "7am",
    "9pm",
  ],
  "Weekend vs. Weekday Class Balance": ["weekend classes", "weekday", "saturday", "sunday"],
  "Rescheduling Flexibility": ["flex reschedule", "move booking", "change date"],
  "Booking Confirmation Issues": ["didn't get confirmation", "no confirmation", "booking email"],
  "Holiday and Festival Class Planning": ["diwali", "holi", "holiday schedule", "festival"],
  "Bad Odour": ["smell", "odour", "odor", "stink", "musty"],
  "Audio Issues": ["can't hear", "audio", "sound system", "music cutting"],
  "Studio Temperature Too Hot/Cold": ["too hot", "too cold", "ac blasting", "sweating buckets", "freezing"],
  "Overcrowding in Class": ["overcrowded", "no space", "cramped", "too many people"],
  "Class Flow and Pacing": ["pacing", "too fast", "too slow", "flow felt off"],
  "Grooming and Appearance": ["grooming", "uniform messy", "appearance"],
  "Attendance for Workshops": ["workshop attendance", "missed workshop"],
  "Attendance for Meetings": ["staff meeting", "trainer meeting"],
  "Class Format Satisfaction": ["didn't like the format", "format wasn't"],
  "Class Duration Suitability": ["duration", "ended early", "ran over"],
  "Instructor Energy and Motivation": ["low energy", "unmotivated", "flat class"],
  "Class Variety and Themes": ["same class", "more variety", "theme"],
  "Adjustments for Different Fitness Levels": ["no regression", "too hard for beginners", "levels"],
  "Challenges in Following Instructor": ["couldn't follow", "hard to follow", "lost in choreography"],
  "Trainer Forgot Names": ["forgot my name", "doesn't remember names"],
  "Class Intensity Too High/Low": ["too intense", "too easy", "intensity"],
  "Trainer Hygiene": ["hygiene", "body odour", "unwashed"],
  "Trainer Punctuality Issues": ["trainer late", "started late", "punctual"],
  "Trainer Behaviour": ["rude", "unprofessional", "attitude", "behaviour", "behavior"],
  "Pre and Post-Class Outreach": ["no follow up", "didn't check in after"],
  "Trainer Availability": ["trainer not available", "can't book with"],
  "Feedback Handling": ["ignored my feedback", "didn't take feedback"],
  "Emergency Preparedness": ["didn't know first aid", "emergency unprepared"],
  "Trainer Focus on Individual Needs": ["ignored me", "no individual attention"],
  "Class Ending on Time": ["overtime", "class ran over", "ended late", "couldn't leave"],
  "Trainer Encouragement": ["not encouraging", "no motivation from trainer"],
  "Injury Prevention and Safety": ["injury", "unsafe move", "hurt my", "knee", "back pain"],
  "Too Many Corrections vs. Too Few": ["too many corrections", "no corrections", "overcorrected"],
  "AC and HVAC Issues": ["ac not working", "air conditioning", "hvac", "no cooling"],
  "TFA Malfunction": ["tfa", "tower", "platform"],
  "Lighting Issues": ["lights flickering", "too dark", "lighting"],
  "Studio System Malfunction": ["studio system", "control panel"],
  "Pest Control Needed": ["cockroach", "lizard", "pest", "insects", "mice"],
  "Staff Uniforms Not Clean": ["uniform dirty", "staff clothes"],
  "Toiletries and Supplies Low": ["no soap", "toiletries", "tissue", "sanitizer empty"],
  "Towel Availability Issues": ["no towels", "towel"],
  "Plumbing Leaks": ["leak", "dripping", "flood", "plumbing"],
  "General Maintenance Delays": ["still not fixed", "maintenance delay"],
  "Uncomfortable Lounge Seating": ["sofa", "lounge seat", "uncomfortable chair"],
  "Air Fresheners Too Strong": ["air freshener", "perfume too strong", "chemical smell"],
  "Music System Too Loud/Low": ["music too loud", "music too low"],
  "Vending Machine Out of Stock": ["vending", "out of stock"],
  "Additional Waiting Area Seating": ["no place to sit", "waiting area"],
  "Door Lock Issues": ["door lock", "can't lock", "lock broken"],
  "Fire Safety Compliance": ["fire extinguisher", "fire exit", "fire safety"],
  "Water Dispenser Issues": ["water dispenser", "no drinking water"],
  "Dust and Mold in Corners": ["mold", "mould", "dusty corners", "dust"],
  "Broken Equipment Not Repaired": ["broken barre", "broken equipment", "still broken"],
  "Studio Odour and Aroma": ["aroma", "scent", "fragrance"],
  "Cleanliness and Hygiene": ["dirty", "unclean", "hygiene", "not cleaned"],
  "Ventilation Poor": ["stuffy", "no ventilation", "airless"],
  "Air Quality Poor": ["air quality", "can't breathe", "stale air"],
  "Valet Issues": ["valet", "car parking", "parking attendant"],
  "Locker Availability": ["no locker", "lockers full"],
  "Shower Water Pressure": ["shower", "water pressure"],
  "Steam Room Not Working": ["steam room", "steam not working"],
  "Boutique Availability Issues": ["boutique", "out of size", "merchandise available"],
  "Wi-Fi Slow": ["wifi slow", "wi-fi slow", "internet slow"],
  "Integration Issues": ["integration", "sync", "not connected"],
  "Lost and Found Disorganization": ["lost and found messy", "lost & found"],
  "Availability of Gym Accessories": ["ankle weights", "bands", "accessories"],
  "Fitness Challenges and Rewards": ["challenge", "rewards program"],
  "Additional Membership Perks": ["perks", "benefits missing"],
  "Smoothie Bar and Refreshments": ["smoothie", "juice bar", "refreshment"],
  "Member Lounge Cleanliness": ["lounge dirty", "lounge cleanliness"],
  "Community Events and Social Engagement": ["community event", "member event", "social"],
  "Holiday-Themed Classes": ["themed class", "holiday class"],
  "Sustainable and Eco-Friendly Practices": ["plastic", "eco", "sustainable"],
  "Moments Notice": ["momence", "moments notice", "momence app"],
  "Stripe and Razorpay": ["stripe", "razorpay", "payment gateway"],
  "Yellow Messenger": ["yellow messenger", "chatbot ym"],
  "Website Glitches": ["website bug", "site glitch", "webpage"],
  "Router Connectivity": ["router", "wifi down", "network drop"],
  "iPad Functionality": ["ipad", "front desk ipad"],
  "Cash Counting Machine Issues": ["cash counting", "note counter"],
  "POS System Malfunctions": ["pos", "point of sale"],
  "CRM System Errors": ["crm", "customer record"],
  "Data Security Issues": ["data leak", "privacy", "security of data"],
  "Technical Assistance": ["need tech help", "technical assistance"],
  "Difficulty Tracking Sessions": ["session count", "classes remaining", "tracking sessions"],
  "System Delays": ["system slow", "lag", "spinning"],
  "Software Bugs": ["software bug", "error message"],
  "Mobile App UI/UX Issues": ["app ui", "confusing app", "ux"],
  "Attendance Record Discrepancies": ["attendance wrong", "marked absent", "not marked present"],
  "Missed Sessions Not Recorded": ["missed session not recorded", "no-show not captured"],
  "Mobile App Freezing": ["app freeze", "app crashed", "app hanging"],
  "Delayed Notifications": ["notification late", "didn't notify in time"],
  "Error in Class Listings": ["wrong class listed", "listing error", "schedule wrong"],
  "Laptops Not Functioning": ["laptop", "macbook", "computer not working"],
  "Speakers Static Noise": ["static", "speaker crackle", "hiss"],
  "Mic Not Working": ["mic", "microphone", "headset"],
  "Phones Not Working": ["studio phone", "landline", "phone dead"],
  "App Performance Bugs": ["app slow", "app bug"],
  "Booking System Errors": ["can't checkout", "booking error", "failed to book"],
  "Password and Login Issues": ["password", "login", "otp", "can't sign in"],
  "Payment Processing Delays": ["payment pending", "payment delayed"],
  "Online Class Streaming Buffering": ["buffering", "stream lag", "zoom lag"],
  "Notifications Not Received": ["no notification", "didn't receive reminder"],
  "Auto-Debit Incorrect Charges": ["auto debit", "auto-debit", "wrong deduction"],
  "Social Media Glitches": ["instagram story", "social glitch"],
  "Wrong Class Bookings": ["booked into wrong", "wrong class booked"],
  "Incorrect Charges on Account": ["wrong charge", "overcharged", "charged twice"],
  "Studio Music Preferences": ["playlist", "song choice", "music preference"],
  "Camera Surveillance Issues": ["cctv not recording", "camera down", "surveillance"],
  "Digital Receipts and Invoices": ["invoice", "receipt", "gst invoice"],
  "Website Navigation Difficulties": ["can't find on website", "navigation"],
  "Virtual Class Video Quality": ["video quality", "pixelated", "virtual class"],
  "Studio Wi-Fi Not Working": ["wifi not working", "wi-fi down", "no internet"],
  "Price Transparency": ["hidden fee", "price not clear", "transparent pricing"],
  "Membership Flexibility": ["inflexible membership", "can't change plan"],
  "Discounts and Offers Confusion": ["discount confusion", "offer not applied", "promo code"],
  "Refund and Cancellation Policy Issue": ["refund", "want my money back"],
  "Auto-Renewal Concerns": ["auto renew", "auto-renewal", "renewed without asking"],
  "Transparency in TandC/": ["terms and conditions", "t&c", "tandc", "fine print"],
  "Add-on Services Pricing Clarity": ["addon", "add-on price", "private add on"],
  "Class Pack Expiry Confusion": ["pack expired", "credits expired", "expiry"],
  "Private Session Pricing": ["private price", "privates cost"],
  "Membership Upgrade/Downgrade": ["upgrade", "downgrade", "switch plan"],
  "Lack of Payment Plan Options": ["emi", "payment plan", "instalment", "installment"],
  "Referral Discount Issues": ["referral", "refer a friend"],
  "Holiday and Special Pricing Clarity": ["festive price", "holiday offer"],
  "Corporate Wellness Program Pricing": ["corporate wellness", "company package"],
  "Pricing for International Clients": ["nri", "international price", "usd", "foreign"],
  "Membership Pause and Freeze Policy": ["freeze membership", "pause membership", "hold my pack"],
  "Special Group Discounts": ["group discount", "bring a friend price"],
  "Loyalty Program Issues": ["loyalty", "points", "rewards not credited"],
  "Delay in Response": ["no reply", "waiting for a response", "slow reply"],
  "Unresolved Complaints": ["still not resolved", "open complaint"],
  "Front Desk Attitude": ["front desk rude", "receptionist", "desk attitude"],
  "Miscommunication on Offers": ["told something else", "offer mismatch"],
  "Response Time to Queries": ["response time", "took days to reply"],
  "Follow-up Post Inquiry": ["nobody followed up", "no follow-up"],
  "Friendliness and Approachability": ["unfriendly", "not approachable", "cold staff"],
  "Call Handling Etiquette": ["call etiquette", "hung up", "phone manner"],
  "Clarity in Policies": ["policy unclear", "nobody can explain"],
  "Late Response to Complaints": ["complaint ignored", "late to complaints"],
  "Handling of Complaints": ["poor complaint handling", "dismissed my issue"],
  "Feedback Follow-up Process": ["feedback vanished", "no closure on feedback"],
  "Compensation for Service Issues": ["compensate", "make good", "gesture"],
  "Customer Retention Strategies": ["thinking of cancelling", "want to leave", "retention"],
  "Over-promising and Under-delivery": ["overpromised", "not as promised"],
  "Response to Negative Reviews": ["google review", "negative review"],
  "Training of Customer Service Team": ["cs team untrained", "doesn't know process"],
  "Training of Sales Team": ["sales untrained", "hard sell"],
  "Knowledge of Membership Policies": ["staff doesn't know policy", "wrong policy info"],
  "Proactive Client Engagement": ["nobody checks in", "no proactive"],
  "Brand Positioning": ["brand positioning", "doesn't feel premium"],
  "Brand Identity Consistency": ["inconsistent branding", "off brand"],
  "Marketing Message Accuracy": ["ad doesn't match", "marketing inaccurate"],
  "Brand Tone Consistency": ["tone of voice", "caption tone"],
  "Social Media Engagement": ["instagram not responding", "social engagement"],
  "Advertising Consistency": ["ads look different", "campaign mismatch"],
  "Collaborations and Partnerships": ["collaboration", "partnership", "collab"],
  "Merchandise Quality": ["merch quality", "tshirt faded", "quality of merch"],
  "Member Recognition Efforts": ["never recognised", "member recognition"],
  "Influencer Engagement": ["influencer", "creator"],
  "Staff Wearing Incorrect Branding": ["wrong logo", "incorrect branding", "kit"],
  "Merchandise Display Issues": ["display messy", "boutique display"],
  "Branded Content Guidelines": ["content guidelines", "off-brief"],
  "Member Recognition Events": ["anniversary class", "recognition event"],
  "Newsletter Effectiveness": ["newsletter", "mailer"],
  "Brand Perception in Market": ["reputation", "what people say"],
  "Perception of Pricing Value": ["not worth the price", "value for money"],
  "Client Testimonials Management": ["testimonial", "review request"],
  "Client Loyalty Recognition": ["loyal member ignored", "long-time member"],
  "Brand Event Participation": ["brand event", "activation"],
  "Emergency Exits Blocked": ["exit blocked", "fire exit", "emergency exit"],
  "Panic Button Malfunction": ["panic button"],
  "Unlocked Doors": ["door unlocked", "open door after hours"],
  "CCTV Malfunction": ["cctv", "camera not working"],
  "Security Guard Issues": ["security guard", "guard missing"],
  "Client Harassment Reports": ["harassed", "harassment", "inappropriate"],
  "Fire Drills Not Conducted": ["fire drill"],
  "Suspicious Individuals Inside Studio": ["suspicious person", "stranger in studio"],
  "Front Desk Not Checking IDs": ["no id check", "didn't check id"],
  "Unregistered Walk-ins": ["walk-in", "not registered"],
  "Trespassing Concerns": ["trespass", "someone wandered in"],
  "Personal Safety Concerns": ["felt unsafe", "personal safety"],
  "Harassment Reports": ["sexual harassment", "made me uncomfortable"],
  "Data Breach Concerns": ["data breach", "personal data leaked"],
  "Employee Security Training": ["security training"],
  "Reporting Suspicious Activity": ["report suspicious"],
  "Staff Security Concerns": ["staff safety", "trainer felt unsafe"],
  "Handling of Medical Emergencies": ["fainted", "medical emergency", "ambulance", "first aid response"],
  "First Aid Kit Availability": ["first aid kit", "no bandages"],
  "Unauthorized Use of Equipment": ["using equipment without", "unauthorized"],
  "Locker Theft": ["stolen from locker", "locker theft"],
  "Stolen Personal Items": ["stolen", "my bag is gone", "phone stolen"],
  "Misplaced Valuables": ["misplaced", "lost jewellery", "lost jewelry", "lost watch"],
  "Items Taken from Boutique": ["taken from boutique", "unpaid merch"],
  "Items Left Behind by Clients": ["left behind", "forgot in class"],
  "Studio Lost and Found Management": ["lost and found"],
  "Staff Theft": ["staff stole", "employee theft"],
  "Reporting Stolen Items": ["report stolen", "file theft"],
  "Theft Prevention Measures": ["better locks", "theft prevention"],
  "Theft Investigation Process": ["investigate theft"],
  "Personal Items Taken from Trainer Area": ["trainer area", "staff room missing"],
  "Issues with Valet Theft": ["valet stole", "car ransacked"],
  "Theft by Other Members": ["another member took"],
  "Lost Shoes/Workout Gear": ["lost shoes", "grip socks", "workout gear missing"],
  "Safe Storage for Client Bags": ["bag storage", "no safe place for bag"],
  "Clients Forgetting Items in Studio": ["forgot my", "left my water bottle"],
  "Missing Towels": ["towels missing", "towel count"],
  "Theft During Busy Hours": ["stolen during rush", "busy hours"],
  "Members Taking Extra Equipment": ["took extra weights", "extra equipment"],
  "Coffee and Refreshments Options": ["coffee", "tea options", "better drinks"],
  "Music Volume Issues": ["volume too loud", "volume too soft"],
  "Studio Decor and Ambience": ["decor", "ambience", "ambiance", "looks tired"],
  "Mobile Charging Stations": ["charging point", "charge my phone"],
  "Late-Night Class Safety": ["late class safety", "leaving at night"],
  "Noise Complaints from Neighbors": ["neighbor", "neighbour", "noise complaint"],
  "Misplaced Equipment": ["weights missing", "equipment misplaced"],
  "Temperature Control Inconsistency": ["temperature swings", "hot then cold"],
  "Scent Sensitivities": ["allergic to scent", "fragrance sensitivity", "asthma smell"],
  "Lighting Preferences": ["prefer warmer lights", "lighting mood"],
  "Cold Air Drafts": ["draft", "ac on my neck", "cold air blowing"],
  "Overcrowding in Lobby": ["lobby packed", "reception crowded"],
  "Construction Noise Nearby": ["construction", "drilling next door"],
  "Child-Friendly Facilities": ["kids", "child", "babysitting"],
  "Outdoor Signage Visibility": ["signage", "can't find the studio", "board outside"],
  "Feedback Fatigue": ["too many surveys", "feedback fatigue"],
  "Personal Storage Lockers Needed": ["need more lockers", "storage locker"],
  "Background Music Selection": ["playlist", "background music"],
  "Social Media Response Time": ["dm not answered", "instagram reply"],
  "Customer Flow Management": ["queue", "check-in bottleneck", "flow management"],
};

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9/+&\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

const GENERIC_TOKENS = new Set([
  "studio", "studios", "issue", "issues", "not", "working", "problem", "problems", "class", "classes",
  "member", "members", "client", "clients", "and", "the", "for", "with", "too", "low", "high", "poor",
  "general", "other", "system", "systems", "availability", "concerns", "policy", "management", "process",
  "options", "preferences", "items", "staff", "trainer", "trainers", "instructor", "front", "desk", "time",
]);
/** Strong, unambiguous phrases that should dominate classification regardless of other token noise. */
const DOMINANT_PHRASES: Array<[RegExp, string, string, number]> = [
  [/\b(a\.?c\.?|ac|acs|air ?con(ditioning|ditioner)?|hvac|cooling|warm air|hot air|not cooling|no cooling|blowing warm|blowing hot)\b/i, "Repair and Maintenance", "AC and HVAC Issues", 30],
  [/\b(bike|bikes|spin bike|flywheel|pedal|pedals|resistance knob|cycle seat)\b/i, "Repair and Maintenance", "Broken Equipment Not Repaired", 26],
  [/\b(leak|leaking|leakage|dripping|flooded|flooding|water on the floor)\b/i, "Repair and Maintenance", "Plumbing Leaks", 28],
  [/\b(steam room|steam)\b/i, "Studio Amenities and Facilities", "Steam Room Not Working", 26],
  [/\b(shower|showers|water pressure)\b/i, "Studio Amenities and Facilities", "Shower Water Pressure", 22],
  [/\b(locker|lockers)\b(?!.*(stolen|theft|missing))/i, "Studio Amenities and Facilities", "Locker Availability", 18],
  [/\b(wi-?fi|wifi|internet|router|network)\b/i, "Tech Issues", "Studio Wi-Fi Not Working", 26],
  [/\b(mic|mics|microphone|headset)\b/i, "Tech Issues", "Mic Not Working", 26],
  [/\b(speaker|speakers|static|crackl)/i, "Tech Issues", "Speakers Static Noise", 24],
  [/\b(momence)\b/i, "Operating Systems", "Moments Notice", 22],
  [/\b(pos|card machine|swipe machine|payment terminal)\b/i, "Operating Systems", "POS System Malfunctions", 24],
  [/\b(ipad|i-pad|tablet)\b/i, "Operating Systems", "iPad Functionality", 24],
  [/\b(cctv|camera|surveillance)\b/i, "Safety and Security", "CCTV Malfunction", 24],
  [/\b(fire exit|emergency exit|exit blocked)\b/i, "Safety and Security", "Emergency Exits Blocked", 30],
  [/\b(harass|harassed|harassment|inappropriate)\b/i, "Safety and Security", "Harassment Reports", 30],
  [/\b(stolen|theft|stole|missing (bag|phone|wallet|watch|airpods|jewell?ery))\b/i, "Theft and Lost Items", "Stolen Personal Items", 28],
  [/\b(lost (my|a|her|his)|left behind|misplaced)\b/i, "Theft and Lost Items", "Misplaced Valuables", 22],
  [/\b(smell|smells|odou?r|stink|stinks|musty)\b/i, "Class Experience", "Bad Odour", 24],
  [/\b(cockroach|lizard|pest|pests|insects|rat|mice)\b/i, "Repair and Maintenance", "Pest Control Needed", 28],
  [/\b(towel|towels)\b/i, "Repair and Maintenance", "Towel Availability Issues", 22],
  [/\b(soap|sanitizer|tissue|toiletries|shampoo)\b/i, "Repair and Maintenance", "Toiletries and Supplies Low", 22],
  [/\b(light|lights|lighting|bulb|flicker)/i, "Repair and Maintenance", "Lighting Issues", 20],
  [/\b(door lock|lock (is )?broken|can'?t lock)\b/i, "Repair and Maintenance", "Door Lock Issues", 26],
  [/\b(water dispenser|drinking water|water cooler)\b/i, "Repair and Maintenance", "Water Dispenser Issues", 26],
  [/\b(valet|parking)\b/i, "Studio Amenities and Facilities", "Valet Issues", 22],
  [/\b(waitlist|wait list|waitlisted)\b/i, "Scheduling", "Waitlist Concerns", 26],
  [/\b(late|punctual|started late|on time)\b.*\b(trainer|instructor|teacher)\b|\b(trainer|instructor|teacher)\b.*\b(late|punctual|started late)\b/i, "Trainer Feedback", "Trainer Punctuality Issues", 26],
  [/\b(refund|charged twice|double charged|overcharged|wrong charge)\b/i, "Pricing and Memberships", "Refund and Cancellation Policy Issue", 26],
  [/\b(freeze|pause|hold)\b.*\b(membership|pack)\b/i, "Pricing and Memberships", "Membership Pause and Freeze Policy", 26],
  [/\b(rude|attitude|unprofessional)\b.*\b(front desk|reception)\b|\b(front desk|reception)\b.*\b(rude|attitude|unprofessional)\b/i, "Customer Service and Communication", "Front Desk Attitude", 26],
  [/\b(too (hot|cold|warm|chilly)|freezing|sweating buckets)\b/i, "Class Experience", "Studio Temperature Too Hot/Cold", 20],
  [/\b(loved|amazing|fantastic|brilliant|wonderful|compliment|shout ?out)\b/i, "Class Experience", "Instructor Energy and Motivation", 14],
];

export function classifyIssue(text: string): Hit[] {
  const hay = text.toLowerCase();
  const tokens = new Set(tokenize(text));
  const scores = new Map<string, Hit>();
  const bump = (category: string, subcategory: string, n: number) => {
    const key = `${category}::${subcategory}`;
    const cur = scores.get(key) ?? { category, subcategory, score: 0 };
    cur.score += n;
    scores.set(key, cur);
  };

  for (const [re, category, subcategory, weight] of DOMINANT_PHRASES) {
    if (re.test(text)) bump(category, subcategory, weight);
  }

  for (const [category, subs] of Object.entries(CATEGORY_MAP)) {
    for (const subcategory of subs) {
      let score = 0;
      const subLower = subcategory.toLowerCase();
      if (hay.includes(subLower)) score += 12;
      for (const needle of EXTRA_KEYWORDS[subcategory] ?? []) {
        if (needle.length >= 3 && hay.includes(needle)) score += needle.split(" ").length > 1 ? 7 : 4;
      }
      for (const token of subLower.split(/\W+/)) {
        if (token.length > 3 && !GENERIC_TOKENS.has(token) && tokens.has(token)) score += 2;
      }
      if (score > 0) bump(category, subcategory, score);
    }
  }

  return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 5);
}

export function extractEntities(text: string): Partial<CollectedTicket> {
  const extracted: Partial<CollectedTicket> = {};
  const lower = text.toLowerCase();

  const studioHit = matchStudio(text);
  if (studioHit) extracted.studio = studioHit;

  const sys = matchSystem(text);
  if (sys) extracted.systemName = sys;
  const area = matchArea(text);
  if (area) extracted.area = area;
  if (/\b(blocking|can'?t (run|teach|hold) (the )?class|class (had to|was) (stop|cancel|move))/i.test(text)) extracted.isClassImpacted = "Yes, blocking now";

  const trainerHit = TRAINERS.find((trainer) => lower.includes(trainer.toLowerCase()));
  if (trainerHit) extracted.trainer = trainerHit;

  const formatHit = [...CLASS_FORMATS]
    .sort((a, b) => b.length - a.length)
    .find((format) => lower.includes(format.toLowerCase()) || lower.includes(format.replace(/^Studio\s+/i, "").toLowerCase()));
  if (formatHit) extracted.classFormat = formatHit;

  const membershipHit = [...MEMBERSHIPS]
    .sort((a, b) => b.length - a.length)
    .find((m) => lower.includes(m.toLowerCase()));
  if (membershipHit) extracted.membership = membershipHit;

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) extracted.memberEmail = email[0];

  const phone = text.match(/(\+91[\s-]?)?[6-9]\d{9}/);
  if (phone) extracted.memberPhone = phone[0].replace(/\s+/g, "");

  if (/\btoday\b/i.test(text)) extracted.incidentAt = "Today";
  else if (/\byesterday\b/i.test(text)) extracted.incidentAt = "Yesterday";
  else if (/\blast week\b/i.test(text)) extracted.incidentAt = "Last week";
  else if (/\bthis week\b/i.test(text)) extracted.incidentAt = "Earlier this week";

  if (/(whatsapp|wa)\b/i.test(text)) extracted.preferredContact = "WhatsApp";
  else if (/\bemail\b/i.test(text)) extracted.preferredContact = "Email";
  else if (/\bcall me\b|\bphone\b/i.test(text)) extracted.preferredContact = "Phone call";

  const nameMatch = text.match(/(?:i am|i'm|this is|my name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
  if (nameMatch) extracted.memberName = nameMatch[1].replace(/\b\w/g, (m) => m.toUpperCase());

  // Never infer that a safety concern is not immediate; ask explicitly.
  if (/(blocking class|can't take class|class cancelled|no mic)/i.test(text)) {
    extracted.isClassImpacted = "Yes";
  }

  const hits = classifyIssue(text);
  if (hits[0] && hits[0].score >= 5) {
    extracted.category = hits[0].category;
    extracted.subcategory = hits[0].subcategory;
  } else if (hits[0] && hits[0].score >= 3) {
    extracted.category = hits[0].category;
  }

  extracted.sentiment = inferSentiment(text);
  return extracted;
}

export function inferSentiment(text: string) {
  const lower = text.toLowerCase();
  if (/(furious|angry|unacceptable|disgusted|unsafe|stolen|harass)/.test(lower)) return "negative";
  if (/(disappointed|frustrated|annoyed|unhappy|issue|problem)/.test(lower)) return "frustrated";
  if (/(thank you|grateful|love|amazing|appreciate)/.test(lower)) return "positive";
  return "neutral";
}

export function inferPriorityHint(text: string): TicketPriority | undefined {
  if (/(emergency|unsafe|stolen|harass|data breach|fire)/i.test(text)) return "critical";
  if (/(overcharged|can't book|ac not|mic not|wifi down)/i.test(text)) return "high";
  return undefined;
}

export function topCategoryOptions(text: string) {
  const hits = classifyIssue(text);
  const cats = Array.from(new Set(hits.map((h) => h.category))).slice(0, 4);
  return cats;
}
