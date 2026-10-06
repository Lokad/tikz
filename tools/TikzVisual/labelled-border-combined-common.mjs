// Explicit frozen independent inputs for prospective public combined trials.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256,outputPath} from './shape-oracle-bundle.mjs';
import {loadLabelledPdfQualification} from './labelled-border-pdf-calibration-common.mjs';
import {validateLabelledPdfCalibration} from './labelled-border-pdf-calibration-coverage.mjs';
import {validateLabelledInkCalibration} from './labelled-border-coverage.mjs';

export const labelledCombinedInputs={
  primary:{file:'artifacts/labelled-border-ink-calibration/run-9659d888-ca86-420d-9c7e-118bc5fbf3ba/report.json',
    sha256:'f1b55ed5e68d79c9e09d1951c485bf97d39034c2544b6ea77801e7bf49411f38'},
  pdf:{file:'artifacts/labelled-border-pdf-calibration/run-c361dde0-c601-4d62-85ff-77eb141c44f9/report.json',
    sha256:'cca54b5e96f84dc4629917397a15bfa4e4311f06c65f8290815b0f2302fd33e5'},
  guardChecks:{file:'artifacts/labelled-border-pdf-page-guard-controls/run-2f62969e-84a2-43e4-a1a5-ca2326071f35/report.json',
    sha256:'6ccc08ce743376feb0b96ed721060eefe0b0d3d54f9d202df27ef0aebce143c8'}
};
export const canonical=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
export async function verifyLabelledSourceHashes(hashes){
  for(const[p,h]of Object.entries(hashes)){
    assert.ok(/^(src\/Lokad.TikZ\/|tools\/)/.test(p)&&!p.includes('..')&&!p.includes('\\'));
    assert.equal(sha256(canonical(await readFile(path.join(root,p)))),h,p);
  }
}
export async function loadLabelledCombinedInputs(){
  const loaded={};
  for(const[key,pin]of Object.entries(labelledCombinedInputs)){
    const bytes=await readFile(path.join(root,pin.file));assert.equal(sha256(bytes),pin.sha256);
    const report=JSON.parse(bytes),folder=path.dirname(path.join(root,pin.file));assert.equal(report.completed,true);
    const read=async p=>readFile(await outputPath(folder,p));
    for(const[p,h]of Object.entries(report.artifacts))assert.equal(sha256(await read(p)),h,p);
    await verifyLabelledSourceHashes(report.toolHashes);
    loaded[key]={bytes,report,folder,read};
  }
  const primary=loaded.primary.report,pdf=loaded.pdf.report,proof=loaded.guardChecks.report;
  const qualification=await loadLabelledPdfQualification();
  validateLabelledPdfCalibration(pdf,qualification.report);
  validateLabelledInkCalibration(primary,pdf.cases.map(c=>c.frame));
  assert.deepEqual(primary.renderer,pdf.renderer);
  for(let i=0;i<3;i++){
    assert.deepEqual(primary.cases[i].ink,pdf.cases[i].ink);
    assert.deepEqual(primary.cases[i].rootChecks,pdf.cases[i].rootChecks);
    assert.equal(primary.artifacts[primary.cases[i].svg],pdf.artifacts[pdf.cases[i].svg.native]);
  }
  assert.equal(proof.passed,true);assert.equal(proof.converterInvoked,false);
  assert.equal(proof.approvedImagePolicy,false);assert.equal(proof.imageConformanceClaim,false);
  assert.equal(proof.calibrationSha256,labelledCombinedInputs.pdf.sha256);
  assert.equal(proof.controls.length,52);assert.ok(proof.controls.every(c=>c.passed));
  assert.equal(proof.pagesRecomputed,138);assert.equal(proof.metricsRecomputed,7392);
  return loaded;
}
export async function copyLabelledCombinedInputs(inputs,save){
  for(const[key,input]of Object.entries(inputs)){
    await save('calibration/'+key+'/report.json',input.bytes);
    for(const p of Object.keys(input.report.artifacts))await save('calibration/'+key+'/'+p,await input.read(p));
  }
}
export async function captureLabelledCombinedSources(save,own){
  const files=[own,'labelled-border-combined-common.mjs','labelled-border-combined-coverage.mjs',
    'labelled-border-coverage.mjs','labelled-border-evidence.mjs','labelled-border-frame.mjs',
    'labelled-border-research.mjs','labelled-border-log.mjs','labelled-border-image-defects.mjs',
    'labelled-border-pdf-page-guard.mjs','labelled-border-pdf-calibration-common.mjs',
    'labelled-border-pdf-calibration-coverage.mjs','labelled-border-pdf-viewport.mjs',
    'shape-primary-trial-policy.mjs','shape-pdf-trial-policy.mjs','shape-pdf-image-pair.mjs',
    'shape-pdf-camera.mjs','shape-frame-math.mjs','shape-image-pair.mjs','shape-raster-metrics.mjs',
    'shape-oracle-bundle.mjs','compare.mjs','browser-profile.json','package-lock.json'];
  const hashes={};
  for(const file of new Set(files)){
    const p='tools/TikzVisual/'+file,b=canonical(await readFile(path.join(root,p)));
    hashes[p]=sha256(b);await save('tool-sources/'+p,b);
  }
  return hashes;
}
