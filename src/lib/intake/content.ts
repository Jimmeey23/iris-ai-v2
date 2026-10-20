/** Central presentation for built-in fields, also applied to previously published plans. */
export const FIELD_COPY: Record<string,{label:string;desc?:string;options?:string[]}> = {
  reporter_type:{label:'Feedback source',desc:'Who communicated the feedback. The staff member logging it is recorded automatically.'},
  report_channel:{label:'Feedback channel',desc:'How the member or partner communicated this information.'},
  reporter_name:{label:'Logged by'},reporter_contact:{label:'Staff contact'},
  preferred_contact:{label:"Member's preferred follow-up channel",desc:'Select only a preference the member stated.',options:['Not provided','Phone call','Email','WhatsApp','In person','No follow-up requested']},
  occurred_at:{label:'When it happened',desc:'Enter the known time or use the linked studio session. Leave blank if unknown.'},
  class_date:{label:'Studio session'},class_format:{label:'Session format'},trainer:{label:'Session instructor'},
  trainer_under_review:{label:'Instructor the feedback concerns',desc:'Identify the instructor named in the feedback; this may differ from the session instructor.'},
  summary:{label:'What was reported',desc:'Document what the member communicated or what staff observed. Separate reported facts from assumptions.'},
  member_verbatim:{label:"Member's exact words",desc:'Use a direct quote only when the wording is known.'},
  requested_outcome:{label:'Requested action',desc:'Record what the member or reporting team requested.'},
  member_impact:{label:'Reported impact',desc:'Record the disruption described by the member or observed by staff.'},immediate_danger:{label:'Is anyone in immediate danger?',desc:'If yes, take immediate safety action and notify the studio manager. The ticket will be marked Critical.'},
  class_impacted:{label:'Was a studio session disrupted?'},sentiment:{label:"Member's expressed sentiment",desc:'Use what the member expressed. Leave blank if not discussed.'},
  member_name:{label:'Member',desc:'Link the member or enter their name if a record is unavailable.'},
  class_host_notes:{label:'Feedback about the host or instructor'},
  class_booking_friction:{label:'Booking difficulties reported'},
  class_rebooking_intent:{label:"Member's stated intention to return",options:['Stated they will return','Stated they may return','Stated they will not return','Undecided','Not discussed']},
  error_text:{label:'Error message'},repro_steps:{label:'Steps that led to the issue'},
  feedback_nature:{label:'Feedback topic'},coaching_status:{label:'Previous follow-up documented'},
  asset_condition:{label:'Reported equipment condition'},usable:{label:'Is the equipment available for use?'},
  desk_owner:{label:'Previous staff contact'},goodwill_offered:{label:'Resolution offered'},
};

export const GLOBAL_FIELD_IDS = new Set(['reporter_type','report_channel','reporter_name','reporter_contact','preferred_contact','studio','occurred_at','member_name','class_date','class_format','trainer','affected_count','is_repeat','linked_ticket','member_impact','class_impacted','immediate_danger','sentiment']);
export const OBSERVATION_FIELDS = new Set(['churn_risk','trainer_rating','trainer_sentiment','class_compatibility_notes','class_audience_notes','trainer_review_cycle','trainer_method_reference']);
/** Broad enrichments are opt-in modules; never automatically inherited by unrelated forms. */
export function enrichmentRelevant(id:string,enrich:string|undefined,category:string,sub:string) {
  if(!enrich||enrich==='universal')return true;
  if(enrich==='class')return ['Class Experience','Trainer Feedback','Scheduling'].includes(category)&&['class_disruption','class_experience_effect','class_booking_friction','class_rebooking_intent'].includes(id);
  if(enrich==='roster')return ['Class Experience','Trainer Feedback'].includes(category)&&['attendees_affected','attendee_actions_taken'].includes(id);
  if(enrich==='trainer')return category==='Trainer Feedback'&&['trainer_feedback_type','trainer_action_now'].includes(id);
  if(enrich==='asset')return /Repair|Tech Issues|Operating Systems/.test(category)&&['asset_count_affected','asset_took_out_of_service','asset_workaround'].includes(id);
  if(enrich==='payment')return /payment|charge|billing|refund/i.test(sub)&&['payment_charge_state','payment_receipt_shared'].includes(id);
  if(enrich==='vendor')return false; // Vendor follow-up belongs to the resolution workspace.
  return true;
}
