import assert from 'node:assert/strict';
import {test} from 'node:test';
import {equipmentRepairRoute,repairVerificationKind} from '../../src/lib/equipment-routing';
import {evaluateTicketPolicy,transitionError,transitionTimestamps} from '../../src/lib/ticket-policy';
import {cityOf} from '../../src/lib/routing';
import {planFields,fieldsForKind,isVisible,missingFields,toTicketInput} from '../../src/lib/intake/plan';

const cfg={responseHours:{critical:12,high:16,medium:48,low:72},subcategoryRouting:{'Brand Feedback|||Partner Complaint':{slaHours:36}}};
const base={category:'Brand Feedback',subcategory:'Partner Complaint',kind:'feedback' as const,customFields:{}};
test('action is explicit and independent of sentiment or named members',()=>{
  assert.equal(evaluateTicketPolicy({...base,resolutionRequired:true},cfg).resolutionRequired,true);
  assert.equal(evaluateTicketPolicy({...base,kind:'compliment',resolutionRequired:false,customFields:{memberImpact:'',memberId:123}},cfg).resolutionRequired,false);
  assert.equal(evaluateTicketPolicy({...base,resolutionRequired:true},cfg).slaHours,36);
  assert.equal(evaluateTicketPolicy({...base,category:'Safety and Security',resolutionRequired:false},cfg).priority,'critical');
});
test('equipment references, praise and negated faults never create repair work',()=>{
  for(const description of ['Member praised the cleanliness of the studio.','Member complimented the wireless microphone and the instructor.','The microphone was not broken. Member reported rude behaviour.','The bike has no faults.','The microphone used to be broken.'])assert.equal(equipmentRepairRoute({description}),null,description);
  assert.equal(equipmentRepairRoute({description:'The wireless microphone keeps cutting out.'})?.subcategory,'Audio, Mic & Headphone Malfunction');
  assert.equal(repairVerificationKind({category:'Trainer Feedback',subcategory:'Class Ending on Time',title:'PowerCycle class started seven minutes late',description:'Instructor assisted two newcomers.'}),null);
  assert.equal(repairVerificationKind({category:'Repair and Maintenance',subcategory:'PowerCycle Bike Malfunction & Repairs',title:'Bike 8 pedal detached',description:'The pedal failed during a session.'}),'bike');
  assert.equal(cityOf('Unknown location'),null);
});
test('resolution timestamps are stable and lifecycle rules reject inconsistent pathways',()=>{
  const first=new Date('2026-10-12T10:00Z');
  assert.equal(transitionTimestamps({status:'resolved',resolvedAt:first,closedAt:null},'resolved').resolvedAt,first);
  assert.equal(transitionTimestamps({status:'resolved',resolvedAt:first,closedAt:null},'closed').resolvedAt,first);
  assert.equal(transitionTimestamps({status:'recorded',resolvedAt:null,closedAt:null},'closed').resolvedAt,null);
  assert.ok(transitionError('resolved','in_progress',true,false));
  assert.ok(transitionError('recorded','in_progress',false,true));
  assert.equal(transitionError('assigned','resolved',true,true),null);
});
const ctx={studios:['Kwality House, Kemps Corner'],formats:['Barre 57'],trainers:['Instructor']};
test('event forms do not inherit session questions and required answers cannot be skipped',()=>{
  const fields=planFields('Studio Amenities and Facilities','Community Events and Social Engagement',ctx);
  assert.ok(!fields.some(f=>f.enrich==='class'||f.enrich==='roster'||f.id==='service_time'||f.id==='churn_risk'));
  assert.equal(fields.filter(f=>f.id==='member_name').length,1);
  assert.equal(fields.find(f=>f.id==='studio')?.section,'Global details');
  assert.ok(missingFields(fields,{_skip_summary:'Yes',summary:'  '}).some(f=>f.id==='summary'));
  const praise=fieldsForKind(fields,'compliment');
  assert.ok(!praise.some(f=>f.id==='is_repeat'));
});
test('unlinked and unavailable records cannot turn stale enrichment into member identity',()=>{
  const fields=planFields('Scheduling','Time Change',ctx);
  const input=toTicketInput({category:'Scheduling',sub:'Time Change',fields,kind:'request',submissionKey:'regression-submission-01',data:{studio:ctx.studios[0],_involves_member:'No',summary:'The reporting team requested a schedule change.'},memberDetail:{email:'old@example.com',phone:'old'},momenceContext:{member:'old'}});
  assert.equal(input.memberName,'');assert.equal(input.memberEmail,'');assert.equal(input.memberPhone,undefined);assert.equal(input.momenceContext,undefined);
  const f=fields.find(f=>f.id==='member_name')!;
  assert.equal(isVisible(f,{_involves_member:'No'}),false);
  assert.equal(isVisible(f,{reporter_type:'A member told me about it'}),true);
});

test('hosted classes are always record-only on every creation surface',()=>{
 for(const [category,subcategory] of [['Brand Feedback','Hosted Class Feedback'],['Internal Operations & Admin','Hosted Class / Event Lead Capture & Tracking']]){
 const p=evaluateTicketPolicy({...base,category,subcategory,kind:'issue',resolutionRequired:true},cfg);
 assert.equal(p.resolutionRequired,false);assert.equal(p.slaHours,0);assert.equal(p.priority,'low');
 }
});
test('late arrival captures incident facts and hides unrelated questions',()=>{
 const fields=planFields('Trainer Feedback','Punctuality',{studios:['Kenkere House'],trainers:['Instructor A'],formats:['Barre']});
 const ids=fields.map(f=>f.id);
 for(const id of ['trainer','studio','scheduled_start_at','arrival_at','advance_notice','first_notice_at','late_reason','actual_start_at','members_affected_flag','service_recovery','class_cancelled'])assert.ok(ids.includes(id),id);
 for(const id of ['housekeeping_log','asset_condition','trainer_rating','coaching_status','member_verbatim','class_rebooking_intent'])assert.ok(!ids.includes(id),id);
 assert.equal(isVisible(fields.find(f=>f.id==='first_notice_at')!,{advance_notice:'No'}),false);
 assert.equal(isVisible(fields.find(f=>f.id==='first_notice_at')!,{advance_notice:'Yes'}),true);
 assert.equal(isVisible(fields.find(f=>f.id==='actual_start_at')!,{class_cancelled:'Yes'}),false);
 assert.equal(isVisible(fields.find(f=>f.id==='service_recovery')!,{members_affected_flag:'No'}),false);
 const input=toTicketInput({category:'Trainer Feedback',sub:'Punctuality',fields,data:{studio:'Kenkere House',trainer:'Instructor A',scheduled_start_at:'2026-10-20T09:00',advance_notice:'No',class_cancelled:'No',members_affected_flag:'No'},kind:'issue',submissionKey:'late-arrival-test-2026'});
 assert.ok(input.description.includes('Scheduled class'));assert.equal(input.trainer,'Instructor A');
});
