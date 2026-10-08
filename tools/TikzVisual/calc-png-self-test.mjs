import assert from 'node:assert/strict';
import {decodeCalcPng,encodeCalcPng} from './calc-png.mjs';
const controls=[];
for(const channels of[3,4])for(const filter of[0,1,2,3,4]){
  const rgba=Uint8Array.from({length:7*5*4},(_,i)=>i%4===3?(channels===3?255:(i*19)%256):(i*37+11)%256);
  const decoded=decodeCalcPng(encodeCalcPng(7,5,rgba,{channels,filters:[filter]}));
  assert.equal(decoded.width,7);assert.equal(decoded.height,5);assert.deepEqual(decoded.rgba,rgba);controls.push({channels,filter,passed:true});
}
const sample=encodeCalcPng(1,1,Uint8Array.from([19,37,53,0]));
assert.deepEqual([...decodeCalcPng(sample).rgba],[19,37,53,0]);
for(const[name,bytes]of[['bad signature',Buffer.alloc(50)],['truncated stream',sample.subarray(0,-2)],['trailing data',Buffer.concat([sample,Buffer.from([0])])],
  ['bad CRC',Buffer.from(sample)]]){if(name==='bad CRC')bytes[bytes.length-1]^=1;assert.throws(()=>decodeCalcPng(bytes));controls.push({name,passed:true});}
console.log(JSON.stringify({passed:true,roundTrips:10,hiddenTransparentRgbPreserved:true,rejections:4,controls}));
