import {CATEGORY_MAP} from './constants';

/** Shape of the CX analyst export (`complaint_category`, `issue_summary`, ...), which
 *  uses its own vocabulary rather than the workspace taxonomy. */
export function isCxExport(r:Record<string,unknown>){return typeof r.complaint_category==='string'&&typeof r.issue_summary==='string';}

/** CX export category → workspace category, with the subcategory used when nothing
 *  in the free-text `complaint_subcategory` matches a real taxonomy entry. */
const CATEGORY_ROUTE:Record<string,[string,string]>={
  'Internal Systems':['Operating Systems','CRM System Errors'],
  'Facility / Hygiene':['Studio Amenities and Facilities','Cleanliness and Hygiene'],
  'Booking / Scheduling':['Scheduling','Booking Confirmation Issues'],
  'Class Quality':['Class Experience','Class Format Satisfaction'],
  'Trainer Conduct':['Trainer Feedback','Trainer Behaviour'],
  'Injury / Safety':['Safety and Security','Personal Safety Concerns'],
  'Communication Gap':['Customer Service and Communication','Delay in Response'],
  'Access / Check-in':['Safety and Security','Front Desk Not Checking IDs'],
  Other:['Miscellaneous','Customer Flow Management'],
};

const STATUS_ROUTE:Record<string,string>={
  awaiting_internal_action:'in_progress',
  partially_resolved:'in_progress',
  escalated:'in_progress',
  awaiting_customer_response:'waiting_on_member',
  resolved:'resolved',
  unresolved:'new',
};

/** Free-text label → taxonomy entry, tried in order against the source subcategory
 *  and summary. Explicit rules beat word-overlap, which mis-fires on generic tokens
 *  like "studio" or "class" that appear in most taxonomy entries. */
const RULES:[RegExp,string,string][]=[
  [/theft|stolen|missing item|lost (and )?found/i,'Theft and Lost Items','Stolen Personal Items'],
  [/injur|medical emergenc|first aid|accident/i,'Safety and Security','Handling of Medical Emergencies'],
  [/harass|safety concern|security/i,'Safety and Security','Personal Safety Concerns'],
  [/crm|momence|data accuracy|data integrity|lead track/i,'Operating Systems','CRM System Errors'],
  [/payroll|performance review|appraisal|hris|zoho/i,'Operating Systems','Difficulty Tracking Sessions'],
  [/payment|reconcil|refund|invoice|billing|upi|razorpay|stripe|auto-debit/i,'Operating Systems','Stripe and Razorpay'],
  [/attendance|check-?in record|missed session/i,'Operating Systems','Attendance Record Discrepancies'],
  [/wi-?fi|router|internet|connectivity/i,'Tech Issues','Studio Wi-Fi Not Working'],
  [/website|app (bug|performance|crash)|software bug|system (error|glitch|delay)/i,'Operating Systems','Software Bugs'],
  [/temperature|hvac|air ?conditioning|\bac\b|too (hot|cold)/i,'Repair and Maintenance','AC and HVAC Issues'],
  [/odour|odor|smell|aroma|fragrance/i,'Studio Amenities and Facilities','Studio Odour and Aroma'],
  [/clean|hygien|washroom|toilet|shower|towel/i,'Studio Amenities and Facilities','Cleanliness and Hygiene'],
  [/locker/i,'Studio Amenities and Facilities','Locker Availability'],
  [/maintenance|repair|broken|malfunction|plumbing|leak|lighting/i,'Repair and Maintenance','General Maintenance Delays'],
  [/music|volume|speaker|audio|sound|mic\b/i,'Class Experience','Audio Issues'],
  [/overcrowd|capacity|full class|waitlist/i,'Scheduling','Class Capacity Issues'],
  [/cancel|no-?show|late (entry|arrival)/i,'Scheduling','Cancellation Policy'],
  [/schedul|timing|slot|class availability|variety/i,'Scheduling','Studio Timings'],
  [/substitut|cover(ing)? class/i,'Scheduling','Trainer Substitutions'],
  [/trainer (performance|conduct|behaviour|behavior)|instructor/i,'Trainer Feedback','Trainer Behaviour'],
  [/punctual|trainer late/i,'Trainer Feedback','Trainer Punctuality Issues'],
  [/intensity|modification|pacing/i,'Trainer Feedback','Class Intensity Too High/Low'],
  [/pricing|package|membership|renewal|discount/i,'Pricing and Memberships','Auto-Renewal Concerns'],
  [/marketing|campaign|influencer|collateral|creative|social media|advertis/i,'Brand Feedback','Marketing Message Accuracy'],
  [/partnership|collaborat|business development/i,'Brand Feedback','Collaborations and Partnerships'],
  [/communication gap|follow-?up|response time|escalat|complaint handling/i,'Customer Service and Communication','Delay in Response'],
  [/front desk|reception|check-?in/i,'Customer Service and Communication','Front Desk Attitude'],
  [/sop|standard operating|process|workflow|handover|shift report|memo|policy|approval|checklist/i,'Operating Systems','Technical Assistance'],
];

function matchRule(...text:string[]){const hay=text.filter(Boolean).join(' \n ');for(const[re,cat,sub]of RULES)if(re.test(hay))return[cat,sub]as const;return null;}

/** Best-effort studio from the reporter's email domain and the ownership label; these
 *  records name a team rather than a studio, so an unknown stays explicitly unknown. */
function studioFor(email:string,ownership:string){
  const hay=`${email} ${ownership}`.toLowerCase();
  if(hay.includes('bandra'))return 'Supreme HQ, Bandra';
  if(hay.includes('bengaluru')||hay.includes('bangalore'))return 'Kenkere House, Bengaluru';
  if(hay.includes('courtside'))return 'Courtside, Mumbai';
  if(hay.includes('copper')||hay.includes('cloves'))return 'the Studio by Copper & Cloves, Bengaluru';
  if(hay.includes('mumbai')||hay.includes('kemps')||hay.includes('kwality'))return 'Kwality House, Kemps Corner';
  return 'Not studio specific';
}

const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const list=(v:unknown)=>Array.isArray(v)?v.map(x=>str(x)||String(x)).filter(Boolean):[];

/** Translates one CX export record into the shape `makeDraft` accepts. Everything the
 *  workspace schema has no column for is preserved verbatim under `customFields`. */
export function fromCxExport(r:Record<string,unknown>){
  const rawCategory=str(r.complaint_category);
  const [routedCategory,defaultSub]=CATEGORY_ROUTE[rawCategory]||CATEGORY_ROUTE.Other;
  const rawSub=str(r.complaint_subcategory);
  const ruled=matchRule(rawSub,str(r.issue_summary));
  const [category,subcategory]=ruled&&CATEGORY_MAP[ruled[0]]?.includes(ruled[1])?ruled:[routedCategory,defaultSub];

  const sentiment=(r.sentiment||{}) as Record<string,unknown>;
  const frustration=str(sentiment.frustration_level).toLowerCase();
  const mood=frustration==='high'||frustration==='critical'?'frustrated':frustration==='medium'?'negative':'neutral';

  const statements=list(r.key_customer_statements);
  const description=[str(r.issue_summary),statements.length?`\n\nKey statements:\n${statements.map(s=>`• ${s}`).join('\n')}`:''].join('').trim();

  const email=str(r.customer_email);
  const ownership=str(r.ownership);
  const priority=str(r.priority).toLowerCase();

  return {
    input:{
      description:description.length>=12?description:`${rawCategory} · ${rawSub} — no summary was recorded in the source export.`,
      summary:str(r.issue_summary).slice(0,1000)||undefined,
      title:`${rawSub||rawCategory} · ${str(r.customer_name)||'Internal report'}`.slice(0,240),
      category,subcategory,kind:'issue' as const,
      studio:studioFor(email,ownership),
      memberName:str(r.customer_name)||'Historical report',
      memberEmail:/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)?email:'',
      incidentAt:str(r.date_opened)||'Not recorded',
      requestedResolution:list(r.recommended_actions).join('\n')||undefined,
      impact:list(r.internal_risk_flags).join('\n')||undefined,
      priority:['critical','high','medium','low'].includes(priority)?priority as 'critical'|'high'|'medium'|'low':undefined,
      sentiment:mood as 'neutral'|'negative'|'frustrated',
      source:'history' as const,
      customFields:{
        historicTicketId:r.ticket_id,historicThreadId:r._thread_id,
        originalCategory:rawCategory,originalSubcategory:rawSub,originalStatus:str(r.current_status),
        originalOwner:ownership,emailType:str(r.email_type),
        rootCause:str(r.root_cause),responseStrategy:str(r.response_strategy),suggestedReply:str(r.suggested_reply),
        recommendedActions:list(r.recommended_actions),internalRiskFlags:list(r.internal_risk_flags),
        classificationReasons:list(r.classification_reasons),keyCustomerStatements:statements,
        unknowns:str(r.unknowns),intelligenceBucket:str(r.intelligence_bucket),
        slaAging:r.sla_aging,slaClassification:str(r.sla_classification),
        cxTicketQualified:r.cx_ticket_qualified,cxTicketConfidence:r.cx_ticket_confidence,
        churnLikelihood:str(sentiment.churn_likelihood),emotionalTone:str(sentiment.emotional_tone),
        frustrationLevel:str(sentiment.frustration_level),riskIndicators:str(sentiment.risk_indicators),
        lastResponseDate:str(r.last_response_date),
      },
    },
    sourceRef:'historic:'+(str(r.ticket_id)||str(r._thread_id)),
    status:STATUS_ROUTE[str(r.current_status)]||'new',
    escalated:str(r.current_status)==='escalated',
    createdAt:str(r.date_opened),
    // When the thread last saw traffic. Used as the closure date of a backfilled record:
    // a 2022 email thread did not close today, and dating its closure today would put a
    // four-year resolution time into the analytics.
    resolvedAt:str(r.last_response_date)||str(r.date_opened),
  };
}
