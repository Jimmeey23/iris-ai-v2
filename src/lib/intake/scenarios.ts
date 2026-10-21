import type {IntakeField} from './plan';
export const isLateArrival=(category:string,sub:string)=>category==='Trainer Feedback'&&/punctual|late arrival|arriv.*late/i.test(sub);
/** Curated operational incident, rather than inherited experience/assessment questions. */
export function lateArrivalFields(fields:Omit<IntakeField,'dep'>[],trainers:string[]):Omit<IntakeField,'dep'>[] {
  const common=new Set(['studio','member_name','preferred_contact','report_channel','reporter_type','summary','requested_outcome']);
  const field=(id:string,label:string,type:IntakeField['type'],extra:Partial<IntakeField>={}):Omit<IntakeField,'dep'>=>({id,label,type,section:'Late arrival details',...extra});
  return [
    ...fields.filter(f=>common.has(f.id)).map(f=>f.id==='summary'?{...f,required:false,label:'Anything else to add'}:f),
    field('trainer','Trainer','select',{required:true,options:trainers,allowOther:true,section:'Global details'}),
    field('class_date','Class','lookup',{module:'session',conditional:true,dependsOn:'_involves_class',when:'^yes$',section:'Global details',desc:'Link the class if available. Record its scheduled time below.'}),
    field('scheduled_start_at','Scheduled class start','datetime',{required:true}),
    field('arrival_at','When the trainer arrived','datetime',{desc:'Leave blank if the trainer did not arrive or the time is unknown.'}),
    field('advance_notice','Did the trainer tell the team they would be late?','radio',{required:true,options:['Yes','No','Not known']}),
    field('first_notice_at','When the trainer first told the team','datetime',{conditional:true,dependsOn:'advance_notice',when:'^Yes$',required:true}),
    field('notice_channel','How did the trainer tell the team?','select',{conditional:true,dependsOn:'advance_notice',when:'^Yes$',options:['WhatsApp','Phone','In person','Email','Other','Not known']}),
    field('late_reason','Reason the trainer gave','textarea',{desc:'Record their stated reason. Leave blank if no reason was given.'}),
    field('class_cancelled','Was the class cancelled?','radio',{required:true,options:['Yes','No','Not known']}),
    field('actual_start_at','Actual class start','datetime',{conditional:true,dependsOn:'class_cancelled',when:'^No$',desc:'Leave blank if the class has not started or the time is unknown.'}),
    field('replacement_instructor','Cover trainer, if any','select',{options:trainers,allowOther:true}),
    field('members_affected_flag','Were any members affected?','radio',{required:true,options:['Yes','No','Not known']}),
    field('affected_count','Number of members affected','number',{conditional:true,dependsOn:'members_affected_flag',when:'^Yes$'}),
    field('members_affected','Affected members','lookup',{module:'member',multi:true,conditional:true,dependsOn:'members_affected_flag',when:'^Yes$'}),
    field('member_impact_detail','How were members affected?','textarea',{conditional:true,dependsOn:'members_affected_flag',when:'^Yes$'}),
    field('service_recovery','What we offered members','multiselect',{conditional:true,dependsOn:'members_affected_flag',when:'^Yes$',options:['Apology and update','Cover trainer','Alternative class','Class credit returned','Refund requested','Refund approved','No recovery offered yet','Other']}),
    field('recovery_response','How members responded','select',{conditional:true,dependsOn:'service_recovery',options:['Accepted','Requested another option','Declined','Mixed responses','Awaiting response','Not recorded']}),
  ];
}
