/**
 * Audit 2026-10-20 §4, §16 and §17: saved routing wins in one fixed order, the server's
 * required-field check follows the form's own visibility, and an internal ticket never
 * shows a stand-in member.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {configuredOwners,departmentForTicket} from '../../src/lib/routing';
import {memberLabel,PLACEHOLDER_MEMBER} from '../../src/lib/display';
import {planFields,fieldsForKind,missingFields,type IntakeField} from '../../src/lib/intake/plan';

const cfg={categoryDepartments:{Scheduling:'customer-service'},routingOwners:{Scheduling:7,'Scheduling::Kenkere House':5},subcategoryRouting:{'Scheduling|||Time Change':{departmentId:'operations',ownerId:3}}};

test('saved department routes win over defaults, subcategory first',()=>{
  assert.equal(departmentForTicket(cfg,'Scheduling','Time Change'),'operations');
  assert.equal(departmentForTicket(cfg,'Scheduling','Waitlist Concerns'),'customer-service');
  assert.equal(departmentForTicket(cfg,'Unmapped','Anything'),'management');
});
test('owner overrides run subcategory, then studio/category, then category',()=>{
  assert.deepEqual(configuredOwners(cfg,'Scheduling','Kenkere House','Time Change').map(c=>c.id),[3,5,7]);
  assert.deepEqual(configuredOwners(cfg,'Scheduling','Kwality House','Waitlist Concerns').map(c=>c.id),[7]);
  assert.equal(configuredOwners(cfg,'Scheduling','Kenkere House','Time Change')[0].rule,'subcategory:Scheduling|||Time Change');
  assert.deepEqual(configuredOwners({routingOwners:{},subcategoryRouting:{'Scheduling|||Time Change':{departmentId:'operations',ownerId:null}}},'Scheduling','Kenkere House','Time Change'),[]);
});

const ctx={studios:['Kwality House, Kemps Corner'],formats:['Barre 57'],trainers:['Instructor']};
const field=(f:Partial<IntakeField>&{id:string}):Omit<IntakeField,'dep'>=>({label:f.id,type:'text',section:'Details',...f});
test('server validation requires visible required fields only, on the published plan',()=>{
  const configured=[field({id:'studio',required:true}),field({id:'summary',required:true}),field({id:'reason',type:'select',options:['Other','Late']}),field({id:'reason_detail',required:true,conditional:true,dependsOn:'reason',when:'^other'})];
  const fields=fieldsForKind(planFields('Scheduling','Time Change',ctx,configured),'request','Scheduling');
  const missing=(answers:Record<string,string>)=>missingFields(fields,answers).map(f=>f.id);
  assert.deepEqual(missing({studio:ctx.studios[0],summary:'Requested a later class.',reason:'Late'}),[]);
  assert.deepEqual(missing({studio:ctx.studios[0],summary:'Requested a later class.',reason:'Other'}),['reason_detail']);
  assert.deepEqual(missing({studio:ctx.studios[0],summary:' ',_skip_summary:'Yes'}),['summary']);
});

test('internal tickets show the subject type, never a stand-in member',()=>{
  for(const n of ['','  ',null,undefined,'Studio team observation','Member (not named)','Fillout assessment','Internal'])assert.equal(memberLabel(n),'Internal observation',String(n));
  assert.equal(memberLabel('Priya Mehta'),'Priya Mehta');
  assert.ok(!PLACEHOLDER_MEMBER.test('Imran Shaikh'));
});
