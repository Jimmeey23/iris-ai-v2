/**
 * Equipment and studio-system failures are operational repair work, even when they
 * happen during a class. Keep this rule independent of the intake surface so chat,
 * forms and history imports cannot disagree about ownership.
 */
const FAULT = /\b(broken|break(?:ing)?|fault(?:y)?|fail(?:ed|ing|ure)?|malfunction(?:ed|ing)?|not working|won['’]?t (?:work|turn on|connect|pair)|stopped working|dead|damaged|repair(?:ed|ing)?|replace(?:d|ment)?|cut(?:ting)? out|drop[ -]?outs?|crackl(?:e|ing)|static|no (?:signal|sound|power|audio)|loose|torn|jammed|leak(?:ing)?|flicker(?:ing)?|out of order)\b/i;
const AUDIO_HARDWARE = /\b(wireless mic(?:rophone)?|mic(?:rophone)?|head(?:phone|set|phones|sets)|earphone|audio system|sound system|music system|speaker|receiver|transmitter|amplifier|mixer|aux cable|bluetooth)\b/i;
const ALWAYS_REPAIR_AUDIO = /\b(wireless mic(?:rophone)?|head(?:phone|set|phones|sets)|earphone)\b/i;
const EQUIPMENT = /\b(equipment|apparatus|machine|device|system|console|control panel|bike|reformer|barre|spring|pedal|weight|band|ball|mat|laptop|ipad|tablet|printer|phone|landline|router|wi-?fi|camera|cctv|pos|card machine|biometric|tfa|lighting|light|air condition(?:er|ing)?|hvac|washing machine|dispenser|locker|door|lock|plumbing|shower)\b/i;

export type EquipmentRepairRoute = {
  category: 'Repair and Maintenance';
  subcategory: 'Studio System Malfunction' | 'Broken Equipment Not Repaired';
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
  const equipmentFault = EQUIPMENT.test(text) && (FAULT.test(text) || explicitlyRepair);
  if (!audioFault && !equipmentFault) return null;
  return {
    category: 'Repair and Maintenance',
    subcategory: audioFault || /\b(system|console|control panel|router|wi-?fi|camera|cctv|pos|biometric|tfa|laptop|ipad|tablet|printer|phone)\b/i.test(text)
      ? 'Studio System Malfunction'
      : 'Broken Equipment Not Repaired',
  };
}
