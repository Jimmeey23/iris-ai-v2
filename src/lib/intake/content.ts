/** Central presentation for built-in fields, also applied to previously published plans. */
export const FIELD_COPY: Record<string,{label:string;desc?:string;options?:string[]}> = {
  // Shared block. Plain words: member, studio, associate, trainer, class.
  reporter_type:{label:'Who raised this?',desc:'Who told us about it. Your own name is saved automatically.'},
  report_channel:{label:'How did it reach us?',desc:'Where the member or colleague told us.'},
  reporter_name:{label:'Logged by'},reporter_contact:{label:'Staff contact'},
  preferred_contact:{label:'How the member wants a reply',desc:'Pick only what the member asked for.',options:['Not provided','Phone call','Email','WhatsApp','In person','No follow-up requested']},
  studio:{label:'Studio'},
  area:{label:'Room or area',desc:'Pick the room. The list shows only rooms at the chosen studio.'},
  specific_area:{label:'Exact spot',desc:'For example: bike 3, mirror wall, left of the front desk.'},
  occurred_at:{label:'When did it happen?',desc:'Leave blank if you do not know. Linking the class fills this in.'},
  class_date:{label:'Class'},class_format:{label:'Class type'},trainer:{label:'Trainer'},
  trainer_under_review:{label:'Trainer this is about',desc:'Can be different from the trainer who taught the class.'},
  summary:{label:'What happened?',desc:'Write what the member said or what you saw. Keep facts and guesses apart.'},
  member_verbatim:{label:"Member's exact words",desc:'Only if you know the exact words.'},
  requested_outcome:{label:'What was asked for?',desc:'What the member or team wants us to do.'},
  member_impact:{label:'Effect on members',desc:'What the member said, or what you saw.'},
  affected_count:{label:'How many members were affected?'},
  is_repeat:{label:'Has this happened before?'},linked_ticket:{label:'Earlier ticket'},
  immediate_danger:{label:'Is anyone in danger right now?',desc:'If yes, make everyone safe first and tell the studio manager. The ticket is marked Critical.'},
  class_impacted:{label:'Was a class affected?'},
  sentiment:{label:'How did the member feel?',desc:'Only what the member showed or said. Leave blank if unsure.'},
  member_name:{label:'Member',desc:'Pick the member from Momence, or type their name if they are not listed.'},
  // Class and trainer
  class_host_notes:{label:'Feedback about the host or trainer'},
  class_booking_friction:{label:'Booking problems reported'},
  class_rebooking_intent:{label:'Will the member come back?',options:['Stated they will return','Stated they may return','Stated they will not return','Undecided','Not discussed']},
  class_disruption:{label:'What happened to the class?'},class_experience_effect:{label:'Effect on the class'},
  attendees_affected:{label:'Members in this class it is about'},attendee_actions_taken:{label:'What was offered?'},
  experience_dimension:{label:'What was the problem?'},session_point:{label:'When in the class?'},
  feedback_nature:{label:'What is the feedback about?'},coaching_status:{label:'Raised with the trainer before?'},
  method_conformance:{label:'Did the trainer follow the method?'},conflict_of_interest:{label:'Is this trainer your manager?'},
  // Equipment and building
  asset_type:{label:'Equipment'},asset_id:{label:'Unit or bike number'},
  asset_condition:{label:'Condition of the equipment'},usable:{label:'Can it still be used?'},downtime:{label:'How long will it be out?'},
  vendor_amc:{label:'Covered by AMC or warranty?'},immediate_fix:{label:'Was it fixed before you filed this?'},
  isolation:{label:'Water turned off?'},reading_now:{label:'Reading now (for example 27°C)'},light_circuit:{label:'Light or fitting number'},
  amenity:{label:'Which amenity?'},temp_reading:{label:'Temperature (°C)'},valet_ticket:{label:'Valet token'},
  supply_count:{label:'How many are short?'},par_level:{label:'Usual stock level'},housekeeping_log:{label:'Housekeeping log reference'},
  vendor_needed:{label:'Does a vendor need to visit?'},sku:{label:'Product'},stock_on_hand:{label:'Stock now vs needed'},
  guest_count:{label:'How many guests?'},
  audio_source:{label:'Where was the music playing from?'},music_action:{label:'What should happen to the music?'},
  // Systems
  system:{label:'Which system?'},device:{label:'Device or terminal'},failure_mode:{label:'What is wrong with it?'},
  scope:{label:'How widespread is it?'},workaround:{label:'What are we doing meanwhile?'},change_window:{label:'When can it be fixed?'},
  error_text:{label:'Error message'},repro_steps:{label:'Can you make it happen again?'},user_type:{label:'Who cannot use it?'},
  last_restart:{label:'What has been tried?'},backdated:{label:'Does a record need correcting?'},
  data_impact:{label:'Is member or payment data affected?'},momence_record:{label:'Momence record ID'},
  fallback_entry:{label:'Is manual check-in running?'},login_user:{label:'Account or login affected'},
  bandwidth_check:{label:'Wi-Fi status'},ticket_vendor:{label:'Ticket raised with the vendor'},
  // Money
  membership:{label:'Membership'},entitlement_state:{label:'Membership status now'},city_rate:{label:'Which city price list?'},
  accounts_action:{label:'What should Accounts do?'},approval_ref:{label:'Who approved it?'},
  // Service
  desk_owner:{label:'Associate who handled it before'},goodwill_offered:{label:'What have we offered?'},
  complaint_nature:{label:'What is the complaint about?'},service_channel:{label:'How did the member contact us?'},
  response_waited:{label:'How long has the member waited?'},contact_attempted:{label:'Did we try to reach the member?'},
  reply_deadline:{label:'Reply promised by'},review_or_public:{label:'Is it posted publicly?'},
  // Brand
  brand_topic:{label:'What is it about?'},asset_link:{label:'Link to the post or file'},pr_speaker:{label:'Who can speak publicly?'},
  rights_used:{label:'Member photos or videos used?'},platform:{label:'Where was it posted?'},
  // Safety and lost items
  incident_type:{label:'What kind of incident?'},injury_occurred:{label:'Was anyone hurt?'},injury_risk:{label:'Did anyone get hurt, or nearly?'},
  member_notified:{label:'Member or family told?'},police_escalation:{label:'Police or legal step'},
  regulatory_note:{label:'Note for compliance'},followup_due:{label:'Welfare check-in due'},
  cctv_retention:{label:'CCTV footage saved?'},cctv_time:{label:'CCTV time to check'},statement_taken:{label:'Written statement taken?'},
  item_category:{label:'What was lost?'},item_desc:{label:'Describe the item'},item_value:{label:'Value (INR)'},
  lost_or_stolen:{label:'What happened to it?'},last_seen:{label:'Where and when was it last seen?'},
  staff_implicated:{label:'Is a staff member suspected?'},compensation:{label:'Compensation asked for'},time_window:{label:'Likely time it happened'},
  // Scheduling
  schedule_action:{label:'What change is asked for?'},requested_slot:{label:'Requested time'},current_slot:{label:'Current time'},
  weekly_impact:{label:'For how long?'},demand_evidence:{label:'Proof of demand',desc:'For example waitlist numbers or how many members asked.'},
  grid_impact:{label:'Change to the timetable'},notified_members:{label:'Have booked members been told?'},
  roster_alternates:{label:'Other trainers who can cover'},
  // Miscellaneous and internal
  misc_bucket:{label:'What kind of issue?'},idea_type:{label:'Who should act on this?'},
  internal_type:{label:'Type of request'},decision_needed:{label:'Who needs to decide?'},affected_studios:{label:'Which studios?'},
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
