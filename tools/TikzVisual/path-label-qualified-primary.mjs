// Reuse frozen qualification; validate current dependencies without recalibrating native images.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from './shape-oracle-bundle.mjs';
import {loadCalcSavedReport} from './calc-saved-images.mjs';
import {loadPathLabelEvidence} from './path-label-evidence.mjs';

export async function loadQualifiedPathLabelPrimary(calibrationFile,checkFile){
 const calibration=await loadCalcSavedReport(path.resolve(root,calibrationFile),'path-label-native-primary-calibration');
 const checked=await loadCalcSavedReport(path.resolve(root,checkFile),'path-label-independent-primary-check');
 assert.equal(checked.report.inputSha256,calibration.sha256);
 assert.equal(checked.report.sourceRecaptures,calibration.report.records.length+calibration.report.controls.length*24);
 assert.equal(calibration.report.converterInvoked,false);assert.equal(calibration.report.nativeToolInvoked,false);
 const native=await loadPathLabelEvidence(calibration.report.fixture);assert.equal(native.sha256,calibration.report.nativeInputSha256);
 for(const [file,bytes]of calibration.files){
  const prefix=file.startsWith('source-captures/')?'source-captures/':file.startsWith('oracle/source-captures/')?'oracle/source-captures/':null;
  if(prefix)assert.ok(bytes.equals(await readFile(path.join(root,file.slice(prefix.length)))),'Changed native calibration dependency: '+file);
 }
 return{calibration,checked,native};
}
