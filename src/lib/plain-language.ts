/** Presentation only: saved taxonomy keys, member statements and historical evidence stay intact. */
export function simpleLanguage(value:string):string {
  return value.replace(/^Trainer Punctuality Issues$/i,'Instructor late for class').replace(/^Trainer No-Show \/ Late Arrival$/i,'Instructor absent or late').replace(/community members/gi,'members').replace(/community member/gi,'member')
    .replace(/signature partnership experiences?/gi,'hosted class')
    .replace(/signature experiences?|brand experiences?|studio sessions?/gi,'class')
    .replace(/newcomers to the method/gi,'new members').replace(/studio tools|method equipment/gi,'equipment')
    .replace(/transformation journey|progress journey/gi,'progress').replace(/member voice/gi,'member feedback')
    .replace(/touchpoints?/gi,'interaction').replace(/studio family|studio community/gi,'members');
}
