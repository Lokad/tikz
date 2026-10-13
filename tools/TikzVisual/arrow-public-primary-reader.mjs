import {requireRenderer} from './shape-primary-trial-policy.mjs';
// Validate complete owned controls before trusting saved outcomes or pixels.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256,outputPath} from './shape-oracle-bundle.mjs';
import {arrowCachePath} from './arrow-image-cache-codec.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowPublicMeetBindings} from './arrow-public-meet-contract.mjs';
import {loadArrowPublicControlInput,arrowPublicControlSources,arrowPublicPrimaryPending,arrowPublicControlQualification,arrowPublicControlReports} from './arrow-public-controls-contract.mjs';
import {arrowPublicPrimaryControlPlan,arrowPublicPrimaryExpected,summarizeArrowPublicPrimaryControls} from './arrow-public-primary-controls.mjs';
import {arrowMeetFiles} from './arrow-meet-source-contract.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';

export const arrowPublicPrimarySourceEntries=['trial-arrow-primary-controls.mjs','arrow-public-controls-contract.mjs'];

export async function validateArrowPublicPrimaryBundle(reportBytes,manifestBytes,assets,e) {
  assert.ok(Buffer.isBuffer(reportBytes)&&reportBytes.length<=100000&&Buffer.isBuffer(manifestBytes)&&manifestBytes.length<=3000000);
  const report=JSON.parse(reportBytes),manifest=JSON.parse(manifestBytes);
  assertNativeEqual(Object.keys(report).sort(),['schemaVersion','completed','phase','comparisonKind','converterInvoked','nativeToolInvoked',
    'numericGatesBypassedForMutations','approvedImagePolicy','imageConformanceClaim','imageAdmission','renderer','inputBindings','sourceHashes','summary','records','nativeBindings','viewer','manifest','pendingGates'].sort());
  assertNativeEqual([report.schemaVersion,report.completed,report.phase,report.comparisonKind],[1,true,'complete','public-arrow-primary-image-controls']);
  assertNativeEqual([report.converterInvoked,report.nativeToolInvoked,report.numericGatesBypassedForMutations,report.approvedImagePolicy,report.imageConformanceClaim,report.imageAdmission],[false,false,true,false,false,'pending']);
  assertNativeEqual(report.pendingGates,arrowPublicPrimaryPending);
  assertNativeEqual(report.inputBindings,{qualification:arrowPublicControlQualification,reports:arrowPublicControlReports});
  assertNativeEqual([report.records,report.nativeBindings,report.viewer],['record-index.json','native-limit-bindings.json','index.html']);
  assertNativeEqual(report.manifest,{file:'manifest.json',sha256:sha256(manifestBytes),files:assets.size});
  assert.equal(manifest.schemaVersion,1);assertNativeEqual(Object.keys(manifest).sort(),['artifacts','schemaVersion']);
  assertNativeEqual(Object.keys(manifest.artifacts),[...assets.keys()]);
  for(const [name,digest]of Object.entries(manifest.artifacts)){arrowCachePath(name);assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(sha256(assets.get(name)),digest,'Changed public control artifact: '+name);}
  const read=name=>{arrowCachePath(name);assert.ok(assets.has(name),'Missing public control artifact: '+name);return assets.get(name);},json=name=>JSON.parse(read(name));
  const input=await loadArrowPublicControlInput(e,read),sources=await arrowPublicControlSources(e,arrowPublicPrimarySourceEntries);
  requireRenderer(report.renderer, input.bundle.report.renderer);
  assertNativeEqual(report.sourceHashes,Object.fromEntries([...sources].map(([name,s])=>[name,s.sha256])));
  const expected=new Set(input.files.keys());
  for(const [name,s]of sources){const file='source-captures/'+name;assert.ok(read(file).equals(s.bytes),'Changed public control source: '+name);expected.add(file);}
  for(const name of ['native-limit-bindings.json','record-index.json','summary.json','index.html'])expected.add(name);
  assertNativeEqual(json('native-limit-bindings.json'),arrowPublicMeetBindings(e));
  const plan=arrowPublicPrimaryControlPlan();assertNativeEqual(json(report.records),plan.map(v=>'views/'+v.id+'/record.json'));
  const records=[];
  for(const view of plan){
    const file='views/'+view.id+'/record.json',record=json(file),numbers=json(record.files.numbers);
    assertNativeEqual(record.view,view);assertNativeEqual(Object.keys(record).sort(),['view','files','sourceFrame','attribution','delta'].sort());
    const frame=e.frames.find(f=>f.caseId===view.caseId),files=arrowMeetFiles(view,arrowPrimaryRegions(frame));assertNativeEqual(record.files,files);
    const svg=arrowPublicPrimaryExpected(e,input,view);assert.equal(read(files.reference).toString(),svg.reference);assert.equal(read(files.actual).toString(),svg.actual);
    assertNativeEqual(record.attribution,svg.attribution);
    assert.equal(['defect','visibility-missing'].includes(view.kind),record.delta!==null);
    for(const name of [files.reference,files.actual,files.numbers,files.record,'views/'+view.id+'/gates.json',...Object.values(files.images),...files.crops.flatMap(c=>Object.values(c.images))]){
      read(name);expected.add(name);
    }
    records.push({...record,numbers});
  }
  const model=summarizeArrowPublicPrimaryControls(e,records);assertNativeEqual(model.summary,report.summary);assertNativeEqual(json('summary.json'),model.summary);
  for(const row of model.evaluations)assertNativeEqual(json('views/'+row.view.id+'/gates.json'),row);
  assertNativeEqual([...assets.keys()].sort(),[...expected].sort(),'Incomplete public control artifact coverage.');
  return {report,manifest,assets,read,json,input,sources,records,model};
}

export async function loadArrowPublicPrimaryOwned(file,e) {
  assert.match(file,/^artifacts\/arrow-public-primary-controls\/run-[a-f0-9-]+\/report\.json$/);
  const folder=path.dirname(path.join(root,file));await outputPath(folder);
  const read=async(name,bound)=>{arrowCachePath(name);const full=await outputPath(folder,name);assert.ok((await stat(full)).size<=bound);return readFile(full);};
  const reportBytes=await read('report.json',100000),report=JSON.parse(reportBytes);assert.equal(report.manifest.file,'manifest.json');
  const manifestBytes=await read('manifest.json',3000000),manifest=JSON.parse(manifestBytes),names=Object.keys(manifest.artifacts);
  assert.ok(names.length>0&&names.length<=12000);const assets=new Map();let total=0;
  for(const name of names){const bytes=await read(name,64000000);total+=bytes.length;assert.ok(total<=1024000000,'Public controls exceed total artifact bound.');assets.set(name,bytes);}
  const bundle=await validateArrowPublicPrimaryBundle(reportBytes,manifestBytes,assets,e);
  return {...bundle,folder,reportBytes,manifestBytes,inputReportSha256:sha256(reportBytes)};
}
