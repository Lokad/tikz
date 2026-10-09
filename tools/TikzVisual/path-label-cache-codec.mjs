// Small metadata adapter over the existing lossless codec; its bounds/blob checks stay shared.
import assert from 'node:assert/strict';
import {calcEqual} from './calc-saved-images.mjs';
import {encodeCalcTrialCache,decodeCalcTrialCache,calcTrialCacheBounds,calcTrialCacheMetadata} from './calc-trial-cache-codec.mjs';

export const pathLabelCacheBounds=calcTrialCacheBounds;
const nativeMagic=Buffer.from('LTZPL01\n'),calcMagic=Buffer.from('LTZCC01\n');
const metadata=fixture=>{assert.ok(['placement','interactions','flowchart-basic','network-bent','flowchart-transformed','flowchart-parameterized','style-contract'].includes(fixture));return{schemaVersion:1,role:'path-label-native-image-cache',fixture,
 scope:'Frozen native calibration and sensitivity evidence only; current conversion and final feature conformance remain separate.',
 converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending'};};

function translate(bytes,fromMagic,from,toMagic,to){
 assert.ok(Buffer.isBuffer(bytes)&&bytes.length>=12&&bytes.length<=pathLabelCacheBounds.decoded);
 assert.ok(bytes.subarray(0,8).equals(fromMagic),'Unknown path-label cache format');
 const size=bytes.readUInt32LE(8);assert.ok(size>0&&size<=pathLabelCacheBounds.index&&size<=bytes.length-12);
 const index=bytes.subarray(12,12+size),header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(index));
 assert.ok(index.equals(Buffer.from(JSON.stringify(header)+'\n')),'Noncanonical path-label cache index');
 calcEqual(Object.keys(header),[...Object.keys(from),'assets','blobs']);for(const[k,v]of Object.entries(from))calcEqual(header[k],v,'Changed native cache scope');
 const replacement={...to,assets:header.assets,blobs:header.blobs},next=Buffer.from(JSON.stringify(replacement)+'\n');
 assert.ok(next.length<=pathLabelCacheBounds.index);const prefix=Buffer.alloc(12);toMagic.copy(prefix);prefix.writeUInt32LE(next.length,8);
 const translated=Buffer.concat([prefix,next,bytes.subarray(12+size)]);assert.ok(translated.length<=pathLabelCacheBounds.decoded);
 return{bytes:translated,header};
}
export function encodePathLabelCache(files,fixture){
 return translate(encodeCalcTrialCache(files),calcMagic,calcTrialCacheMetadata,nativeMagic,metadata(fixture)).bytes;
}
export function decodePathLabelCache(bytes,fixture){
 const adapted=translate(bytes,nativeMagic,metadata(fixture),calcMagic,calcTrialCacheMetadata),decoded=decodeCalcTrialCache(adapted.bytes);
 return{...decoded,bytes,header:adapted.header};
}
