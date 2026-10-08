import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256,outputPath} from './shape-oracle-bundle.mjs';
import {arrowCachePath} from './arrow-image-cache-codec.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowPublicMeetBindings} from './arrow-public-meet-contract.mjs';
import {loadArrowPublicPdfInput,arrowPublicPdfSources,arrowPublicPdfPending,arrowPublicPdfQualification,arrowPublicPdfReports} from './arrow-public-pdf-contract.mjs';
import {arrowPublicPdfControlPlan,arrowPublicPdfFocus,arrowPublicPdfIndex,summarizeArrowPublicPdfControls} from './arrow-public-pdf-controls.mjs';
import {arrowPublicControlCase,arrowPublicControlAttribution} from './arrow-public-control-svg.mjs';
import {arrowSourcePdfControl} from './arrow-source-pdf-model.mjs';
import {arrowPrimaryVisibility} from './arrow-primary-defects.mjs';

export async function validateArrowPublicPdfBundle(reportBytes,manifestBytes,assets,e){
  assert.ok(Buffer.isBuffer(reportBytes)&&reportBytes.length<=100000&&Buffer.isBuffer(manifestBytes)&&manifestBytes.length<=5000000);
  const report=JSON.parse(reportBytes),manifest=JSON.parse(manifestBytes);
  assertNativeEqual(Object.keys(report).sort(),['schemaVersion','completed','phase','comparisonKind','converterInvoked','nativeToolInvoked',
    'numericGatesBypassedForMutations','approvedImagePolicy','imageConformanceClaim','imageAdmission','renderer','inputBindings','sourceHashes','summary','records','focus','nativeBindings','viewer','manifest','pendingGates'].sort());
  assertNativeEqual([report.schemaVersion,report.completed,report.phase,report.comparisonKind],[1,true,'complete','public-arrow-PDF-image-controls']);
  assertNativeEqual([report.converterInvoked,report.nativeToolInvoked,report.numericGatesBypassedForMutations,report.approvedImagePolicy,report.imageConformanceClaim,report.imageAdmission],[false,false,true,false,false,'pending']);
  assertNativeEqual(report.pendingGates,arrowPublicPdfPending);assertNativeEqual(report.inputBindings,{qualification:arrowPublicPdfQualification,reports:arrowPublicPdfReports});
  assertNativeEqual([report.records,report.focus,report.nativeBindings,report.viewer],['record-index.json','focus.json','native-limit-bindings.json','index.html']);
  assertNativeEqual(report.manifest,{file:'manifest.json',sha256:sha256(manifestBytes),files:assets.size});
  assert.equal(manifest.schemaVersion,1);assertNativeEqual(Object.keys(manifest).sort(),['artifacts','schemaVersion']);assertNativeEqual(Object.keys(manifest.artifacts),[...assets.keys()]);
  for(const[name,digest]of Object.entries(manifest.artifacts)){arrowCachePath(name);assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(sha256(assets.get(name)),digest,'Changed public PDF artifact: '+name);}
  const read=name=>{arrowCachePath(name);assert.ok(assets.has(name),'Missing public PDF artifact: '+name);return assets.get(name);},json=name=>JSON.parse(read(name));
  const input=await loadArrowPublicPdfInput(e,read),sources=await arrowPublicPdfSources(e);assertNativeEqual(report.renderer,input.primary.report.renderer);
  assertNativeEqual(report.sourceHashes,Object.fromEntries([...sources].map(([name,s])=>[name,s.sha256])));const expected=new Set(input.files.keys());
  for(const[name,s]of sources){const file='source-captures/'+name;assert.ok(read(file).equals(s.bytes));expected.add(file);}
  for(const name of ['record-index.json','focus.json','native-limit-bindings.json','summary.json','index.html'])expected.add(name);
  assertNativeEqual(json(report.nativeBindings),arrowPublicMeetBindings(e));
  const plan=arrowPublicPdfControlPlan();assertNativeEqual(json(report.records),plan.map(v=>'views/'+v.id+'/record.json'));const records=[];
  for(const view of plan){
    const name='views/'+view.id+'/record.json',record=json(name),native=e.pdfRecords.find(r=>r.view.id===view.id);assert.ok(native);
    assertNativeEqual(Object.keys(record).sort(),['view','publicSource','sourceFrame','normalization','extra','attribution','files','sourceDelta','sceneDelta'].sort());
    assertNativeEqual(record.view,view);assert.equal(record.publicSource,view.route==='native-source');assertNativeEqual(record.files,native.files);assertNativeEqual(record.extra,native.extra);
    const control=arrowSourcePdfControl(view)??(view.kind==='visibility-calibration'?arrowPrimaryVisibility.find(c=>c.name===view.name):null);
    const attribution=record.publicSource&&control?.target.startsWith('paint-')?arrowPublicControlAttribution(arrowPublicControlCase(input.input,view.caseId),control):null;
    assertNativeEqual(record.attribution,attribution);assert.ok(read(record.files.pdf).equals(e.getRole('pdf',native.files.pdf)));
    for(const type of ['source','scene']){
      const files=record.files[type];assert.equal(!['calibration','visibility-calibration'].includes(view.kind),record[type+'Delta']!==null);
      for(const file of [files.svg,files.numbers,...Object.values(files.images)]){read(file);expected.add(file);}record[type]=json(files.numbers);
    }
    expected.add(name);expected.add(record.files.pdf);expected.add('views/'+view.id+'/gates.json');records.push(record);
  }
  const model=summarizeArrowPublicPdfControls(e,records);assertNativeEqual(model.summary,report.summary);assertNativeEqual(json('summary.json'),model.summary);
  for(const row of model.evaluations)assertNativeEqual(json('views/'+row.view.id+'/gates.json'),row);
  const focus=arrowPublicPdfFocus(e,input.input,records);assertNativeEqual(json(report.focus),focus);assert.equal(read(report.viewer).toString(),arrowPublicPdfIndex(model.summary,records,focus));
  for(const p of focus)for(const file of Object.values(p.images)){read(file);expected.add(file);}
  assertNativeEqual([...assets.keys()].sort(),[...expected].sort(),'Incomplete public PDF coverage.');
  return{report,manifest,assets,read,json,input,sources,records,model,focus};
}
export async function loadArrowPublicPdfOwned(file,e){
  assert.match(file,/^artifacts\/arrow-public-pdf-controls\/run-[a-f0-9-]+\/report\.json$/);const folder=path.dirname(path.join(root,file));await outputPath(folder);
  const read=async(name,bound)=>{arrowCachePath(name);const full=await outputPath(folder,name);assert.ok((await stat(full)).size<=bound);return readFile(full);};
  const reportBytes=await read('report.json',100000),report=JSON.parse(reportBytes);assert.equal(report.manifest.file,'manifest.json');
  const manifestBytes=await read('manifest.json',5000000),manifest=JSON.parse(manifestBytes),names=Object.keys(manifest.artifacts);assert.ok(names.length>0&&names.length<=20000);
  const assets=new Map();let total=0;for(const name of names){const bytes=await read(name,64000000);total+=bytes.length;assert.ok(total<=1024000000);assets.set(name,bytes);}
  return{...await validateArrowPublicPdfBundle(reportBytes,manifestBytes,assets,e),folder,reportBytes,manifestBytes,inputReportSha256:sha256(reportBytes)};
}
