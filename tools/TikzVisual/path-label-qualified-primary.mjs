// Reuse frozen qualification; validate current dependencies without recalibrating native images.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {loadLabelImageEvidence} from './diagram-image-evidence.mjs';

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
 for(const [file,bytes]of calibration.files){
  const prefix=file.startsWith('source-captures/')?'source-captures/':file.startsWith('oracle/source-captures/')?'oracle/source-captures/':null;
  // Generator scripts are immutable provenance. PDF checking reconstructs the
  // primary frame/encodings with current readers; engine/renderer/C# inputs stay pinned.
  if(prefix&&(prefix.startsWith('oracle/')||!file.endsWith('.mjs')))assert.ok(bytes.equals(await readFile(path.join(root,file.slice(prefix.length)))),'Changed native calibration dependency: '+file);
 }
 return{calibration,checked,native};
}
