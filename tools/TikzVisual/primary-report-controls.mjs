// Shared report/JSON overlays. Native ownership and policy semantics stay in callers.
import assert from 'node:assert/strict';
import {calcHash} from './calc-saved-images.mjs';
export function primaryReportCorruptions(policyFile,editPolicy){
 return[
  ['candidate-fed-calibration',r=>r.converterInvoked=true],
  ['missing-native-view',r=>r.records.pop()],
  ['duplicate-native-view',r=>r.records[1]=structuredClone(r.records[0])],
  ['missing-label-control',r=>r.controls.pop()],
  ['rehashed-native-policy',(r,json)=>json(policyFile,editPolicy)],
  ['rehashed-false-pixel-metric',(r,json)=>json(r.records[0].file,p=>p.metrics.rawChangedPixels++)]
 ];
}
export function runPrimaryReportControls(original,verify,defects){
 const controls=[];
 for(const [name,edit]of defects){
  const report=structuredClone(original.report),files=new Map(original.files);
  const json=(file,change)=>{const value=JSON.parse(files.get(file));change(value);
   const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');files.set(file,bytes);report.artifacts[file]=calcHash(bytes);};
  const artifact=(file,change)=>{assert.ok(files.has(file));const bytes=Buffer.from(change(files.get(file)));
   files.set(file,bytes);report.artifacts[file]=calcHash(bytes);};
  edit(report,json,artifact,file=>JSON.parse(files.get(file)));
  assert.notEqual(JSON.stringify(report),JSON.stringify(original.report),'Control made no change: '+name);
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');
  for(const [file,digest]of Object.entries(report.artifacts))assert.equal(calcHash(files.get(file)),digest);
  const altered={...original,report,files,bytes,sha256:calcHash(bytes),json:file=>JSON.parse(files.get(file))};
  assert.throws(()=>verify(altered),undefined,'Corruption accepted: '+name);controls.push(name);
 }
 return controls;
}
