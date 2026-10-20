import {writeFileSync} from 'node:fs';
import {planFields,visibleFields,isVisible,missingFields,composeWriteup} from '../../../src/lib/intake/plan';
import {CATEGORY_MAP,STUDIOS,CLASS_FORMATS} from '../../../src/lib/constants';
import {equipmentRepairRoute} from '../../../src/lib/equipment-routing';
import {cityOf} from '../../../src/lib/routing';
const ctx={studios:STUDIOS.map(s=>s.name),formats:[...CLASS_FORMATS],trainers:['Example instructor']};
const data={reporter_type:'Front desk / associate',_involves_member:'No',_involves_class:'No',studio:ctx.studios[0]};
const forms=Object.entries(CATEGORY_MAP).flatMap(([category,subs])=>subs.map(subcategory=>{
 const fields=planFields(category,subcategory,ctx);const visible=visibleFields(fields,data);
 return {category,subcategory,total:fields.length,visible:visible.length,required:fields.filter(f=>f.required).length,visibleRequired:visible.filter(f=>f.required).length,textarea:fields.filter(f=>f.type==='textarea').length,fields:fields.map(f=>({id:f.id,label:f.label,type:f.type,required:!!f.required,section:f.section,dep:f.dep,conditional:f.conditional,visible:isVisible(f,data)}))};
}));
const specific=planFields('Studio Amenities and Facilities','Community Events and Social Engagement',ctx);
const probes={
  positiveHeadset:equipmentRepairRoute({category:'Class Experience',subcategory:'Music Quality',description:'Member complimented the wireless microphone and the instructor.'}),
  cleanlinessCompliment:equipmentRepairRoute({category:'Brand Feedback',subcategory:'General Feedback',description:'Member praised the cleanliness of the studio.'}),
  historicalFaultMention:equipmentRepairRoute({category:'Trainer Feedback',subcategory:'Trainer Behaviour',description:'The microphone was not broken. Member reported rude behaviour.'}),
  cities:['Mumbai','Bengaluru','Bandra','Unknown location','Delhi'].map(s=>[s,cityOf(s)]),
  skipAll:missingFields(specific,Object.fromEntries(specific.map(f=>['_skip_'+f.id,'Yes']))).map(f=>f.id),
  eventFieldsWithSessionOff:visibleFields(specific,data).filter(f=>f.enrich).map(f=>f.label),
  sentimentWriteup:composeWriteup({sub:{category:'Class Experience',name:'Music Quality'},fields:planFields('Class Experience','Music Quality',ctx),data:{...data,sentiment:'negative',churn_risk:'High'}}),
};
const result={scope:'Local default CATEGORY_MAP and generated plans; excludes database-published overrides',forms:forms.length,totalFieldOccurrences:forms.reduce((a,f)=>a+f.total,0),minFields:Math.min(...forms.map(f=>f.total)),maxFields:Math.max(...forms.map(f=>f.total)),averageFields:forms.reduce((a,f)=>a+f.total,0)/forms.length,moreThan35:forms.filter(f=>f.total>35).length,moreThan4Textareas:forms.filter(f=>f.textarea>4).length,probes,inventory:forms};
writeFileSync(new URL('./generated-form-inventory.json', import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,inventory:undefined},null,2));
