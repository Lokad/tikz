// Recheck the entire pinned primary bundle at the source/PDF boundary.
import assert from 'node:assert/strict';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {captureArrowPublicPrimaryControl,arrowPublicPrimaryBaseline,arrowPublicPrimaryDelta,summarizeArrowPublicPrimaryControls} from './arrow-public-primary-controls.mjs';
import {arrowPrimaryRegions} from './arrow-primary-contract.mjs';
import {arrowMetrics} from './arrow-native-contract.mjs';
import {decodeEdgeOraclePngPair} from './edge-oracle-png-pair.mjs';

export async function verifyArrowPublicPdfPrimary(renderer,e,primary,progress=()=>{}){
  const records=[];let measurements=0,images=0,deltas=0;
  for(const record of primary.records){
    progress(record.view);const capture=await captureArrowPublicPrimaryControl(renderer,e,primary.input,record.view);
    assert.equal(capture.reference,primary.read(record.files.reference).toString());assert.equal(capture.actual,primary.read(record.files.actual).toString());
    assertNativeEqual(capture.record.sourceFrame,record.sourceFrame);assertNativeEqual(capture.record.attribution,record.attribution);assertNativeEqual(capture.numbers,record.numbers);
    for(const[name,image]of Object.entries(capture.images))assert.ok(primary.read(record.files.images[name]).equals(Buffer.from(image,'base64')),'Bound public primary image: '+record.view.id+'/'+name);
    for(const[i,crop]of capture.crops.entries())for(const[name,image]of Object.entries({...crop.paired,sheet:crop.sheet}))assert.ok(primary.read(record.files.crops[i].images[name]).equals(Buffer.from(image,'base64')));
    const view=record.view,frame=capture.frame,regions=arrowPrimaryRegions(frame),size={width:frame.camera.width*view.scale,height:frame.camera.height*view.scale};
    const decoded=await decodeEdgeOraclePngPair(renderer,[primary.read(record.files.images.reference),primary.read(record.files.images.actual)],size,
      regions.map(r=>Object.fromEntries(Object.entries(r.rectangle).map(([k,n])=>[k,n*view.scale]))),view.scale,view.background);
    assertNativeEqual(decoded.metrics[0],record.numbers.metrics);assert.equal(decoded.metrics.length,record.numbers.regions.length);
    for(const[i,row]of record.numbers.regions.entries()){for(const[k,value]of Object.entries(regions[i]))assertNativeEqual(row[k],value);assertNativeEqual(arrowMetrics(row),decoded.metrics[i]);}
    measurements+=decoded.metrics.length;images+=Object.keys(capture.images).length+capture.crops.reduce((n,c)=>n+Object.keys(c.paired).length+1,0);
    if(['defect','visibility-missing'].includes(view.kind)){
      const baseline=arrowPublicPrimaryBaseline(records,view);assertNativeEqual(record.delta,await arrowPublicPrimaryDelta(renderer,frame,view,primary.read(baseline.files.images.actual),primary.read(record.files.images.actual)));deltas++;
    }
    records.push(record);
  }
  assertNativeEqual(summarizeArrowPublicPrimaryControls(e,records).summary,primary.report.summary);assertNativeEqual([records.length,measurements,images,deltas],[306,39528,3057,210]);
  return{views:records.length,measurements,images,deltas};
}
