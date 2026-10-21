/** Presentation only: saved taxonomy keys, member statements and historical evidence stay intact. */
const CATEGORY_DISPLAY: Record<string, string> = {
  'trainer punctuality issues': 'Trainer late for class',
  'trainer no-show / late arrival': 'Trainer absent or late',
};

export function simpleLanguage(value:string):string {
  if(!value)return value;
  const exact=CATEGORY_DISPLAY[value.trim().toLowerCase()];
  if(exact)return exact;
  return value.replace(/community members/gi,'members').replace(/community member/gi,'member')
    .replace(/signature partnership experiences?/gi,'hosted class')
    .replace(/signature experiences?|brand experiences?|studio sessions?/gi,'class')
    .replace(/newcomers to the method/gi,'new members').replace(/studio tools|method equipment/gi,'equipment')
    .replace(/transformation journey|progress journey/gi,'progress').replace(/member journey/gi,'member visits').replace(/member voice/gi,'member feedback')
    .replace(/touchpoints?/gi,'interaction').replace(/studio family|studio community/gi,'members')
    .replace(/hospitality/gi,'service');
}
