import type {AdvancedDraft} from './ticket-contract';
export type IrisMessage={role:'user'|'assistant';content:string};
export type IrisTurn={sessionId:string;message:string;phase:'welcome'|'collect'|'draft'|'complete';fieldKey?:string;lookup?:'members'|'sessions';/** Narrows a session lookup to one studio, a set of Momence session types, and — when the
 *  class has not started yet — the upcoming schedule rather than the recent one. */lookupFilters?:{studio?:string;sessionTypes?:string[];upcoming?:boolean};options?:{label:string;value:string}[];collected:Record<string,unknown>;draft?:AdvancedDraft;progress:{done:number;total:number};engine:'openai'|'guided';notice?:string;ticket?:{id:number;ticketNumber:string};history?:IrisMessage[]};
