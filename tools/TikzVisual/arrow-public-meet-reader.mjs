// Validate the completed public baseline bundle before trusting any saved verdict.
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {root, sha256, outputPath} from './shape-oracle-bundle.mjs';
import {validateArrowPublicNumeric} from './arrow-public-source-contract.mjs';
import {arrowPublicMeetSources, arrowPublicMeetBindings} from './arrow-public-meet-contract.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowMeetImageCacheSha256} from './arrow-meet-image-cache-pin.mjs';
import {arrowPublicPrimaryPlan, arrowPublicPdfPlan, evaluateArrowPublicPrimary, evaluateArrowPublicPdf, finishArrowPublicBaselines} from './arrow-public-source-policy.mjs';
import {arrowImageCacheSha256} from './arrow-image-cache.mjs';
import {arrowViewportFrameCheck} from './arrow-viewport-model.mjs';

const pending = ['public-image-only-defect-and-visibility-controls','independent-public-trial-reader','fixed-family-image-admission'];
const safe = p => {
  assert.equal(typeof p,'string');
  assert.match(p,/^[a-zA-Z0-9_.\/-]+$/);
  assert.ok(!p.startsWith('/') && !p.split('/').some(s => !s || s === '.' || s === '..'));
};
export function validateArrowPublicMeetBaselineBundle(reportBytes, manifestBytes, assets, e, sources) {
  const report=JSON.parse(reportBytes), manifest=JSON.parse(manifestBytes);
  assertNativeEqual(Object.keys(report).sort(),['schemaVersion','comparisonKind','completed','phase','converterInvoked','approvedImagePolicy','imageConformanceClaim','overallVerdict','cache','baseCache','renderer','sourceHashes','numericReport','frames','primary','pdf','combined','pendingGates','viewer','manifest'].sort());
  assertNativeEqual([report.schemaVersion,report.comparisonKind,report.completed,report.phase,report.converterInvoked,report.approvedImagePolicy,report.imageConformanceClaim,report.overallVerdict],
    [1,'public-arrow-meet-baseline-trial',true,'complete',true,false,false,'pending']);
  assertNativeEqual(report.pendingGates,pending);
  assertNativeEqual(report.cache,{file:'native-meet-cache.bin.gz',sha256:arrowMeetImageCacheSha256});
  assertNativeEqual(report.baseCache,{file:'native-base-cache.bin.gz',sha256:arrowImageCacheSha256});
  assertNativeEqual(report.renderer,e.reports.primary.renderer);
  assertNativeEqual(report.sourceHashes,Object.fromEntries([...sources].map(([p,s]) => [p,s.sha256])));
  assertNativeEqual([report.numericReport,report.frames,report.primary,report.pdf,report.viewer],['numeric/report.json','frames.json','primary.json','pdf.json','index.html']);
  assertNativeEqual(report.manifest,{file:'manifest.json',sha256:sha256(manifestBytes),files:assets.size});
  assertNativeEqual(Object.keys(manifest).sort(),['artifacts','schemaVersion']); assert.equal(manifest.schemaVersion,1);
  assertNativeEqual(new Set(Object.keys(manifest.artifacts)),new Set(assets.keys()));
  for(const [p,h] of Object.entries(manifest.artifacts)){safe(p);assert.match(h,/^[a-f0-9]{64}$/);assert.equal(sha256(assets.get(p)),h,'Changed baseline artifact: '+p);}
  const read=p=>{safe(p);assert.ok(assets.has(p),'Missing baseline artifact: '+p);return assets.get(p);}, json=p=>JSON.parse(read(p));
  assert.equal(sha256(read(report.cache.file)),arrowMeetImageCacheSha256);
  assert.equal(sha256(read(report.baseCache.file)),arrowImageCacheSha256);
  const bindings=arrowPublicMeetBindings(e);
  assertNativeEqual(json('native-limit-bindings.json'),bindings);
  const expected=new Set(['native-meet-cache.bin.gz','native-base-cache.bin.gz','native-limit-bindings.json','numeric-command.log','numeric/report.json','frames.json','primary.json','pdf.json','combined.json','index.html']);
  for(const [p,s] of sources){const name='source-captures/'+p;assert.ok(read(name).equals(s.bytes));expected.add(name);}
  const numeric=json(report.numericReport),frames=json(report.frames),primary=json(report.primary),pdf=json(report.pdf);
  assertNativeEqual(frames.map(f=>f.caseId),e.frames.map(f=>f.caseId));
  for(const [i,f] of frames.entries()){
    assertNativeEqual(f.sourceFrame,arrowViewportFrameCheck(f.normalization.sourceFrame,e.frames[i].sourceEnvelope.root));
    assert.equal(f.normalization.bodyUnchanged,true);assert.equal(f.normalization.rootPaintUnchanged,true);
  }
  for(const [p,h] of Object.entries(numeric.artifacts)){const name='numeric/'+p;assert.equal(sha256(read(name)),h);expected.add(name);}
  assertNativeEqual(primary.map(r=>r.view),arrowPublicPrimaryPlan());assertNativeEqual(pdf.map(r=>r.view),arrowPublicPdfPlan());
  for(const r of primary){
    const folder='views/'+r.view.id;
    assertNativeEqual([r.files.reference,r.files.actual,r.files.numbers],[folder+'/reference.svg',folder+'/actual.svg',folder+'/numbers.json']);
    assertNativeEqual(json(r.files.numbers),r.numbers);assertNativeEqual(json(folder+'/record.json'),r);expected.add(folder+'/record.json');
    for(const p of [r.files.reference,r.files.actual,r.files.numbers])expected.add(p);
    assertNativeEqual(Object.keys(r.files.images),['reference','actual','difference','alpha-difference','amplified','overlay',...(r.view.scale===1&&r.view.background==='white'?['comparison']:[])]);
    for(const [k,p] of Object.entries(r.files.images)){assert.equal(p,folder+'/'+k+'.png');expected.add(p);}
    assert.ok(r.files.crops.length <= 4);assert.equal(new Set(r.files.crops.map(c=>c.id)).size,r.files.crops.length);
    if(r.view.scale!==1||r.view.background!=='white')assert.equal(r.files.crops.length,0);
    for(const c of r.files.crops){
      assertNativeEqual(Object.keys(c.images),['reference','actual','difference','amplified','sheet']);
      for(const [k,p] of Object.entries(c.images)){assert.equal(p,folder+'/crop-'+c.id+'-'+k+'.png');expected.add(p);}
    }
    assertNativeEqual(r.evaluation,evaluateArrowPublicPrimary(e,r));
  }
  for(const r of pdf){
    const folder='views/'+r.view.id;assert.equal(r.pdf,'reference/'+r.view.caseId+'/pdf-page-'+r.view.scale+'x.png');expected.add(r.pdf);
    assertNativeEqual(json(folder+'/record.json'),r);expected.add(folder+'/record.json');
    for(const type of ['source','scene']){
      const t=r[type];assertNativeEqual([t.files.svg,t.files.numbers],[folder+'/'+type+'.svg',folder+'/'+type+'-numbers.json']);
      expected.add(t.files.svg);expected.add(t.files.numbers);assertNativeEqual(json(t.files.numbers),t.numbers);
      assertNativeEqual(Object.keys(t.files.images),['svg-page','pdf','svg','difference','amplified','overlay',...(r.view.scale===1?['sheet']:[])]);
      for(const [k,p] of Object.entries(t.files.images)){assert.equal(p,folder+'/'+type+'-'+k+'.png');expected.add(p);}
      assertNativeEqual(t.evaluation,evaluateArrowPublicPdf(e,r.view,type,t.numbers));
    }
  }
  assertNativeEqual(new Set(assets.keys()),expected,'Incomplete baseline artifact coverage.');
  const combined=finishArrowPublicBaselines(numeric,frames,primary,pdf);
  assertNativeEqual(json('combined.json'),combined);assertNativeEqual(report.combined,combined);
  return {report,manifest,assets,numeric,frames,primary,pdf,combined,read,json};
}

export async function loadArrowPublicMeetBaseline(reportPath,e) {
  assert.match(reportPath,/^artifacts\/arrow-public-meet-baselines\/run-[a-f0-9-]+\/report.json$/);
  const folder=path.dirname(path.join(root,reportPath));
  const read=async(p,bound)=>{const full=await outputPath(folder,p);assert.ok((await stat(full)).size<=bound,'Oversized baseline asset: '+p);return readFile(full);};
  const reportBytes=await read('report.json',100000),report=JSON.parse(reportBytes);assert.equal(report.manifest.file,'manifest.json');
  const manifestBytes=await read('manifest.json',2000000),manifest=JSON.parse(manifestBytes),assets=new Map();
  assert.ok(Object.keys(manifest.artifacts).length>0&&Object.keys(manifest.artifacts).length<=6000);
  for(const p of Object.keys(manifest.artifacts)){safe(p);assets.set(p,await read(p,64000000));}
  const sources=await arrowPublicMeetSources(e),bundle=validateArrowPublicMeetBaselineBundle(reportBytes,manifestBytes,assets,e,sources);
  await validateArrowPublicNumeric(bundle.numeric,p=>bundle.read('numeric/'+p));
  for(const [p,h] of Object.entries(bundle.numeric.sources))assert.equal(sha256(bundle.read('numeric/source-captures/'+p)),h);
  return {...bundle,reportBytes,manifestBytes,sources,inputReportSha256:sha256(reportBytes)};
}
