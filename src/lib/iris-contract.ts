import type {AdvancedDraft} from './ticket-contract';
export type IrisMessage={role:'user'|'assistant';content:string};
export type IrisTurn={sessionId:string;message:string;phase:'welcome'|'collect'|'draft'|'complete';fieldKey?:string;lookup?:'members'|'sessions';options:{label:string;value:string}[];collected:Record<string,unknown>;draft?:AdvancedDraft;progress:{done:number;total:number};engine:'openai'|'guided';notice?:string;ticket?:{id:number;ticketNumber:string};history?:IrisMessage[];};
