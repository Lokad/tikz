// Small metadata adapter over the existing lossless codec; its bounds/blob checks stay shared.
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {calcEqual,calcHash} from './calc-saved-images.mjs';
import {encodeCalcTrialCache,decodeCalcTrialCache,calcTrialCacheBounds,calcTrialCacheMetadata} from './calc-trial-cache-codec.mjs';

export const pathLabelCacheBounds=calcTrialCacheBounds;
const nativeMagic=Buffer.from('LTZPL01\n'),calcMagic=Buffer.from('LTZCC01\n');
const packedMagic=Buffer.from('LTZPL02\n');
const packedFixture=fixture=>['math-functions-contract','math-labels-primary','math-labels-pdf','styled-labels-primary','styled-labels-pdf'].includes(fixture);
// The measured focused corpus compresses to 53.5 MB; existing cases keep 48 MB.
// The fixed combined PDF evidence measures 65.7 MB; other math parts keep 48 MB.
export const pathLabelCompressedLimit=fixture=>fixture==='math-labels-pdf'?80000000:fixture==='math-functions-contract'?64000000:pathLabelCacheBounds.compressed;
const controlRecord=file=>file.includes('/controls/')&&file.endsWith('/record.json');
const metadata=fixture=>{assert.ok(['placement','interactions','flowchart-basic','network-bent','flowchart-transformed','flowchart-parameterized','style-contract','flowchart-foreach','foreach-contract','flowchart-math-macros','math-macro-contract','network-math-functions','math-functions-contract','math-labels-native','math-labels-primary','math-labels-pdf',
 'network-coordinate-plot','coordinate-plot-contract','network-function-plot','function-plot-contract','network-smooth-plot','smooth-plot-contract',
 'styled-labels-native','styled-labels-primary','styled-labels-pdf','flowchart-paint','arrow-color-contract','flowchart-draw-color','definitions-contract','flowchart-definitions','flowchart-arc-order','flowchart-fill-rules'].includes(fixture));return{schemaVersion:1,role:'path-label-native-image-cache',fixture,
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
 if(packedFixture(fixture)){
  const packed=new Map();let logical=0;
  for(const[file,item]of files){assert.ok(Buffer.isBuffer(item)&&item.length<=pathLabelCacheBounds.file);logical+=item.length;assert.ok(logical<=pathLabelCacheBounds.logical);
   packed.set(file,controlRecord(file)?gzipSync(item,{level:9}):item);}
  return translate(encodeCalcTrialCache(packed),calcMagic,calcTrialCacheMetadata,packedMagic,{...metadata(fixture),controlRecords:'gzip-v1'}).bytes;
 }
 return translate(encodeCalcTrialCache(files),calcMagic,calcTrialCacheMetadata,nativeMagic,metadata(fixture)).bytes;
}
export function decodePathLabelCache(bytes,fixture){
 if(packedFixture(fixture)){
  const adapted=translate(bytes,packedMagic,{...metadata(fixture),controlRecords:'gzip-v1'},calcMagic,calcTrialCacheMetadata),decoded=decodeCalcTrialCache(adapted.bytes);
  const files=new Map(),blobs=new Map(),assets=Object.create(null);let logicalBytes=0;
  for(const[file,stored]of decoded.files){const item=controlRecord(file)?gunzipSync(stored,{maxOutputLength:pathLabelCacheBounds.file}):stored;
   logicalBytes+=item.length;assert.ok(item.length<=pathLabelCacheBounds.file&&logicalBytes<=pathLabelCacheBounds.logical);const digest=calcHash(item);
   if(blobs.has(digest))assert.ok(blobs.get(digest).equals(item));else blobs.set(digest,item);files.set(file,item);assets[file]=digest;}
  const header={...adapted.header,assets,blobs:[...blobs].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([sha256,item])=>({sha256,bytes:item.length}))};
  return{bytes,header,packedHeader:adapted.header,files,blobs,logicalBytes};
 }
 const adapted=translate(bytes,nativeMagic,metadata(fixture),calcMagic,calcTrialCacheMetadata),decoded=decodeCalcTrialCache(adapted.bytes);
 return{...decoded,bytes,header:adapted.header};
}
