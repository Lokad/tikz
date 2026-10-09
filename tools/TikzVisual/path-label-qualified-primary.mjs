// Reuse frozen qualification; validate current dependencies without recalibrating native images.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport,calcEqual} from './calc-saved-images.mjs';
import {loadLabelImageEvidence} from './diagram-image-evidence.mjs';
import {runCalcChild,readCalcChild} from './calc-admission-child.mjs';

export async function loadQualifiedPathLabelPrimary(calibrationFile,checkFile){
 const calibration=await loadCalcSavedReport(path.resolve(root,calibrationFile),'path-label-native-primary-calibration');
 const checked=await loadCalcSavedReport(path.resolve(root,checkFile),'path-label-independent-primary-check');
 assert.equal(checked.report.inputSha256,calibration.sha256);
 const views=calibration.report.records.length+calibration.report.controls.reduce((n,c)=>n+c.comparisons.length,0);
 assert.equal(checked.report.sourceRecaptures,views);assert.equal(checked.report.pixels.comparisons,views);
 assert.ok(checked.files.get('input-report.json').equals(calibration.bytes),'Changed checked primary input.');
 assert.equal(calibration.report.converterInvoked,false);assert.equal(calibration.report.nativeToolInvoked,false);
 const legacy=['placement','interactions'].includes(calibration.report.fixture);
 const native=await loadLabelImageEvidence(legacy?calibration.report.fixture:path.relative(root,path.join(path.dirname(calibration.file),'native/report.json')));assert.equal(native.sha256,calibration.report.nativeInputSha256);
 let readerChanged=false;
 for(const [file,bytes]of calibration.files){
  const prefix=file.startsWith('source-captures/')?'source-captures/':file.startsWith('oracle/source-captures/')?'oracle/source-captures/':null;
  // Generator scripts are immutable provenance. PDF checking reconstructs the
  // primary frame/encodings with current readers; engine/renderer inputs stay pinned.
  if(prefix&&(prefix.startsWith('oracle/')||!file.endsWith('.mjs'))){const same=bytes.equals(await readFile(path.join(root,file.slice(prefix.length))));
   if(prefix.startsWith('oracle/')&&file.endsWith('.cs'))readerChanged ||= !same;
   else assert.ok(same,'Changed native calibration dependency: '+file);}
 }
 // A changed C# observation reader must prove identical native glyph evidence.
 // Reuse the existing oracle/process/artifact machinery; never regenerate TeX.
 let readerReplay;
 if(readerChanged){
  const output=path.join(root,'artifacts/path-label-reader-replay/run-'+randomUUID()),save=(f,b)=>writeArtifact(output,f,b);
  const handle=await runCalcChild(root,'dotnet',['run','--project','tools/TikzPathLabelOracle','-c','Release','--',
   path.relative(root,path.join(path.dirname(calibration.file),'native/report.json'))],'native-reparse',save);
  readerReplay=await readCalcChild(root,handle,'path-label-native-glyph-oracle');
  await verifyPathLabelReaderReplay(calibration,native,readerReplay);
 }
 return{calibration,checked,native,readerReplay};
}

export async function verifyPathLabelReaderReplay(calibration,native,replay){
 assert.equal(replay.report.converterInvoked,false);assert.equal(replay.report.nativeToolInvoked,false);assert.equal(replay.report.nativeInputSha256,native.sha256);
 assert.ok(replay.report.assemblyReferences.every(n=>n==='System'||n.startsWith('System.')));
 assert.ok(replay.files.get('native-glyphs.json').equals(calibration.files.get('oracle/native-glyphs.json')),'Changed reader produces different native glyph evidence.');
 const captures=[...replay.files.keys()].filter(f=>f.startsWith('source-captures/')).sort();
 calcEqual(captures,[...calibration.files.keys()].filter(f=>f.startsWith('oracle/source-captures/')).map(f=>f.slice(7)).sort(),'Changed native reader source coverage.');
 for(const file of captures)assert.ok(replay.files.get(file).equals(await readFile(path.join(root,file.slice(16)))),'Stale native reader replay.');
}
