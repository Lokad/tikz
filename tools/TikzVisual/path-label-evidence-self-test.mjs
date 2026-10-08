// Acceptance gap: retained label observations must reject altered records,
// including corruption that has been rehashed by a producer.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcHash} from './calc-saved-images.mjs';
import {loadPathLabelEvidence,verifyPathLabelEvidence} from './path-label-evidence.mjs';

const original=await loadPathLabelEvidence();let controls=0;
function altered(file,change,base=original){
 const files=new Map(base.files);files.set(file,Buffer.from(change(files.get(file).toString('utf8'))));
 const report=structuredClone(base.report);report.artifacts[file]=calcHash(files.get(file));
 const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');
 return{...base,report,bytes,sha256:calcHash(bytes),files,json:name=>JSON.parse(files.get(name).toString('utf8'))};
}
function reject(file,change,base){assert.throws(()=>verifyPathLabelEvidence(altered(file,change,base)));controls++;}
reject('metrics.json',text=>{const m=JSON.parse(text);m.nodes[0].anchors.center.xSp++;return JSON.stringify(m);});
reject('svg-probed.log',text=>text.replace('LOKAD-ANCHOR straight|center|','LOKAD-ANCHOR straight|unknown|'));
reject('svg-probed.log',text=>text.replace('LOKAD-FRAME straight|','LOKAD-FRAME unknown|'));
reject('native-positions.log',text=>text.replace('lokad-edge-path 1','lokad-edge-path 2'));
reject('plain-reference.pdf',text=>text+'changed');
reject('probed-reference.svg',text=>text.replace(/stroke-width='([^']+)'/,"stroke-width='9'"));
const interactions=await loadPathLabelEvidence('interactions');
reject('metrics.json',text=>{const m=JSON.parse(text);m.driverState.paints.find(p=>p.clips.length).clips=[];return JSON.stringify(m);},interactions);
reject('probed-reference.svg',text=>text.replace(/ clip-path='url\(#[^']+\)'/,''),interactions);

// Reuse the shared saved-report validator for generic transport controls.
const directory=path.join(root,'artifacts/path-label-evidence-controls','run-'+randomUUID());await mkdir(directory,{recursive:true});
const bytes=Buffer.from('owned artifact');await writeFile(path.join(directory,'item.log'),bytes);
const report={schemaVersion:1,role:'path-label-control',completed:true,phase:'complete',approvedImagePolicy:false,
 imageConformanceClaim:false,imageAdmission:'pending',artifacts:{'item.log':calcHash(bytes)}};
const target=path.join(directory,'report.json');
async function publish(r){await writeFile(target,JSON.stringify(r,null,2)+'\n');}
await publish(report);await loadCalcSavedReport(target,report.role);
for(const changed of[
 {...report,completed:false},
 {...report,artifacts:{'../item.log':calcHash(bytes)}},
 {...report,artifacts:{'item.log':'0'.repeat(64)}}
]){await publish(changed);await assert.rejects(loadCalcSavedReport(target,report.role));controls++;}
await publish(report);
console.log(JSON.stringify({validated:true,semanticControls:8,genericControls:3,controls}));
