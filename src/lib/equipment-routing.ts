/**
 * Equipment and studio-system failures are operational repair work, even when they
 * happen during a class. Keep this rule independent of the intake surface so chat,
 * forms and history imports cannot disagree about ownership.
 */
const FAULT = /\b(broken|break(?:ing)?|fault(?:y)?|fail(?:ed|ing|ure)?|malfunction(?:ed|ing)?|not working|won['’]?t (?:work|turn on|connect|pair)|stopped working|dead|damaged|repair(?:s|ed|ing)?|replace(?:d|ment)?|cut(?:ting)? out|drop[ -]?outs?|crackl(?:e|ing)|static|no (?:signal|sound|power|audio)|loose|torn|jammed|leak(?:ing)?|flicker(?:ing)?|out of order)\b/i;
const AUDIO_HARDWARE = /\b(wireless mic(?:rophone)?|mic(?:rophone)?|head(?:phone|set|phones|sets)|earphone|audio system|sound system|music system|speaker|receiver|transmitter|amplifier|mixer|aux cable|bluetooth)\b/i;
const EQUIPMENT = /\b(equipment|apparatus|machine|device|system|console|control panel|bike|reformer|barre|spring|pedal|weight|band|ball|mat|laptop|ipad|tablet|printer|phone|landline|router|wi-?fi|camera|cctv|pos|card machine|biometric|tfa|lighting|lights?|ac|ventilation|air condition(?:er|ing)?|hvac|washing machine|dispenser|locker|door|lock|plumbing|shower|washroom|toilet|pipe|tap|faucet|drain)\b/i;
const HOUSEKEEPING = /\b(housekeeping|clean(?:ing|liness)?|dirty|dust(?:y)?|mou?ld|hygiene|mop(?:ping)?|sweep(?:ing)?|saniti[sz](?:e|ing|ation))\b/i;

export type EquipmentRepairRoute = {
  category: 'Repair and Maintenance';
  subcategory: 'PowerCycle Bike Malfunction & Repairs' | 'Studio Lighting Malfunction & Repairs' |
    'Resistance Bands & Small Equipment Repairs' | 'Strength Studio Equipment Repairs' |
    'Audio, Mic & Headphone Malfunction' | 'Housekeeping & Cleaning Issues' |
    'Washroom & Plumbing Repairs' | 'AC & Ventilation Repairs' | 'Electrical & Power Issues' |
    'Doors, Locks & Fixture Repairs' | 'General Studio Repairs & Maintenance';
};

export function equipmentRepairRoute(input: {
  category?: string | null;
  subcategory?: string | null;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  systemName?: string | null;
  itemDescription?: string | null;
}): EquipmentRepairRoute | null {
  // Match a current problem in one clause; a mention elsewhere is not a fault.
  const clauses = [input.title, input.summary, input.description, input.subcategory, input.systemName, input.itemDescription]
    .filter(Boolean).flatMap(value => String(value).split(/[.!?;\n]|\b(?:but|however)\b/i))
    .filter(value => !/\b(?:not|never|no longer)\s+(?:(?:actually|currently)\s+)?(?:broken|faulty|damaged|malfunctioning|leaking)|\b(?:no|without)\s+(?:faults?|issues?|problems?)|\b(?:used to|previously|last month)\b/i.test(value));
  const text = clauses.filter(value => (AUDIO_HARDWARE.test(value) || EQUIPMENT.test(value) || HOUSEKEEPING.test(value)) && (FAULT.test(value) || /\b(dirty|dusty|mould|mold|unclean|unhygienic)|did not clean|not cleaned|cleaning missed/i.test(value))).join(' ');
  if (!text) return null;
  const explicitlyRepair = /\brepair|maintenance\b/i.test(`${input.category || ''} ${input.subcategory || ''}`);
  const audioFault = AUDIO_HARDWARE.test(text) && FAULT.test(text);
  const housekeeping = HOUSEKEEPING.test(text);
  const equipmentFault = EQUIPMENT.test(text) && (FAULT.test(text) || explicitlyRepair);
  if (!audioFault && !equipmentFault && !housekeeping) return null;
  let subcategory: EquipmentRepairRoute['subcategory'];
  if (/\b(bike|power\s?cycle|spin bike|flywheel|pedal|resistance knob|sprintshift|fitloc)\b/i.test(text)) subcategory='PowerCycle Bike Malfunction & Repairs';
  else if (/\b(lights?|lighting|bulb|spotlight|strip light|neon|dimmer)\b/i.test(text)) subcategory='Studio Lighting Malfunction & Repairs';
  else if (/\b(resistance band|exercise band|theraband|mini band|loop band)\b/i.test(text)) subcategory='Resistance Bands & Small Equipment Repairs';
  else if (/\b(strength studio|strength lab|weight|dumbbell|kettlebell|bench|rack|barbell)\b/i.test(text)) subcategory='Strength Studio Equipment Repairs';
  else if (audioFault || AUDIO_HARDWARE.test(text)) subcategory='Audio, Mic & Headphone Malfunction';
  else if (housekeeping) subcategory='Housekeeping & Cleaning Issues';
  else if (/\b(washroom|toilet|plumbing|pipe|tap|faucet|flush|drain|shower|leak)\b/i.test(text)) subcategory='Washroom & Plumbing Repairs';
  else if (/\b(ac|a\/c|ac|ventilation|air condition(?:er|ing)?|hvac|ventilation|cooling)\b/i.test(text)) subcategory='AC & Ventilation Repairs';
  else if (/\b(electric(?:al|ity)?|power|socket|switchboard|wiring|circuit|breaker)\b/i.test(text)) subcategory='Electrical & Power Issues';
  else if (/\b(door|lock|locker|fixture|cabinet|shelf|handle|hinge)\b/i.test(text)) subcategory='Doors, Locks & Fixture Repairs';
  else subcategory='General Studio Repairs & Maintenance';
  return {
    category: 'Repair and Maintenance',
    subcategory,
  };
}

/** Verification follows confirmed repair work, never the format of a studio session. */
export function repairVerificationKind(t: {category: string; subcategory: string; title: string; description: string}) {
  if (!['Repair and Maintenance', 'Tech Issues', 'Studio Amenities and Facilities', 'Operating Systems'].includes(t.category)) return null;
  const route = equipmentRepairRoute(t);
  const sub = route?.subcategory || (t.category === 'Repair and Maintenance' ? t.subcategory : '');
  if (/PowerCycle Bike (?:Malfunction|Fault)/i.test(sub)) return 'bike' as const;
  if (/AC & Ventilation Repairs|AC and HVAC Issues/i.test(sub)) return 'ac' as const;
  if (/Audio, Mic & Headphone Malfunction|Mic Not Working/i.test(sub) && /\b(mic|microphone|headset)\b/i.test(t.title + ' ' + t.description + ' ' + t.subcategory)) return 'mic' as const;
  return null;
}
