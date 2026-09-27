/**
 * Equipment and studio-system failures are operational repair work, even when they
 * happen during a class. Keep this rule independent of the intake surface so chat,
 * forms and history imports cannot disagree about ownership.
 */
const FAULT = /\b(broken|break(?:ing)?|fault(?:y)?|fail(?:ed|ing|ure)?|malfunction(?:ed|ing)?|not working|won['’]?t (?:work|turn on|connect|pair)|stopped working|dead|damaged|repair(?:ed|ing)?|replace(?:d|ment)?|cut(?:ting)? out|drop[ -]?outs?|crackl(?:e|ing)|static|no (?:signal|sound|power|audio)|loose|torn|jammed|leak(?:ing)?|flicker(?:ing)?|out of order)\b/i;
const AUDIO_HARDWARE = /\b(wireless mic(?:rophone)?|mic(?:rophone)?|head(?:phone|set|phones|sets)|earphone|audio system|sound system|music system|speaker|receiver|transmitter|amplifier|mixer|aux cable|bluetooth)\b/i;
const ALWAYS_REPAIR_AUDIO = /\b(wireless mic(?:rophone)?|head(?:phone|set|phones|sets)|earphone)\b/i;
const EQUIPMENT = /\b(equipment|apparatus|machine|device|system|console|control panel|bike|reformer|barre|spring|pedal|weight|band|ball|mat|laptop|ipad|tablet|printer|phone|landline|router|wi-?fi|camera|cctv|pos|card machine|biometric|tfa|lighting|lights?|air condition(?:er|ing)?|hvac|washing machine|dispenser|locker|door|lock|plumbing|shower|washroom|toilet|pipe|tap|faucet|drain)\b/i;
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
  const text = [input.title, input.summary, input.description, input.subcategory, input.systemName, input.itemDescription]
    .filter(Boolean)
    .join(' ');
  const explicitlyRepair = /\brepair|maintenance\b/i.test(`${input.category || ''} ${input.subcategory || ''}`);
  const audioFault = ALWAYS_REPAIR_AUDIO.test(text) || AUDIO_HARDWARE.test(text) && (FAULT.test(text) || /\bmic not working\b/i.test(text));
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
  else if (/\b(ac|a\/c|air condition(?:er|ing)?|hvac|ventilation|cooling)\b/i.test(text)) subcategory='AC & Ventilation Repairs';
  else if (/\b(electric(?:al|ity)?|power|socket|switchboard|wiring|circuit|breaker)\b/i.test(text)) subcategory='Electrical & Power Issues';
  else if (/\b(door|lock|locker|fixture|cabinet|shelf|handle|hinge)\b/i.test(text)) subcategory='Doors, Locks & Fixture Repairs';
  else subcategory='General Studio Repairs & Maintenance';
  return {
    category: 'Repair and Maintenance',
    subcategory,
  };
}
