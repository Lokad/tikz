// Lossless, bounded development archive; no external artifact references.
import assert from 'node:assert/strict';
import {calcHash,calcEqual} from './calc-saved-images.mjs';
const magic=Buffer.from('LTZCC01\n'),order=(a,b)=>a<b?-1:a>b?1:0;
export const calcTrialCacheBounds={compressed:48000000,decoded:256000000,index:8000000,files:8192,file:16000000,logical:512000000};
export const calcTrialCacheMetadata={schemaVersion:1,role:'calc-public-trial-evidence-cache',scope:'Only the fixed glyph-free CalcCoordinates fixture; historical research, not current converter conformance.',
  approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending'};
export function calcTrialCachePath(file){
  assert.ok(typeof file==='string'&&file.length<=1024&&/^[A-Za-z0-9_./-]+$/.test(file)&&!file.startsWith('/')
    &&!file.split('/').some(part=>!part||part==='.'||part==='..'),'Unsafe calc cache path');return file;
}
export function encodeCalcTrialCache(files){
  assert.ok(files instanceof Map&&files.size>0&&files.size<=calcTrialCacheBounds.files);
  const assets=Object.create(null),blobs=new Map();let logical=0;
  for(const file of [...files.keys()].sort(order)){
    calcTrialCachePath(file);const bytes=files.get(file);assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=calcTrialCacheBounds.file);
    logical+=bytes.length;assert.ok(logical<=calcTrialCacheBounds.logical,'Calc cache logical bound exceeded');
    const digest=calcHash(bytes);assets[file]=digest;if(blobs.has(digest))assert.ok(blobs.get(digest).equals(bytes));else blobs.set(digest,bytes);
  }
  const hashes=[...blobs.keys()].sort(order),header={...calcTrialCacheMetadata,assets,blobs:hashes.map(sha256=>({sha256,bytes:blobs.get(sha256).length}))};
  const index=Buffer.from(JSON.stringify(header)+'\n');assert.ok(index.length<=calcTrialCacheBounds.index);
  const length=12+index.length+hashes.reduce((n,h)=>n+blobs.get(h).length,0);assert.ok(length<=calcTrialCacheBounds.decoded);
  const prefix=Buffer.alloc(12);magic.copy(prefix);prefix.writeUInt32LE(index.length,8);
  return Buffer.concat([prefix,index,...hashes.map(h=>blobs.get(h))],length);
}
export function decodeCalcTrialCache(bytes){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length>=12&&bytes.length<=calcTrialCacheBounds.decoded);
  assert.ok(bytes.subarray(0,8).equals(magic),'Unknown calc cache format');const size=bytes.readUInt32LE(8);
  assert.ok(size>0&&size<=calcTrialCacheBounds.index&&size<=bytes.length-12,'Calc cache index bound exceeded');
  const index=bytes.subarray(12,12+size),header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(index));
  assert.ok(index.equals(Buffer.from(JSON.stringify(header)+'\n')),'Noncanonical calc cache index');
  calcEqual(Object.keys(header),[...Object.keys(calcTrialCacheMetadata),'assets','blobs'],'Calc cache metadata fields differ');
  for(const[key,value]of Object.entries(calcTrialCacheMetadata))calcEqual(header[key],value,'Calc cache scope/claim differs');
  assert.ok(header.assets&&typeof header.assets==='object'&&!Array.isArray(header.assets));const names=Object.keys(header.assets);
  assert.ok(names.length>0&&names.length<=calcTrialCacheBounds.files);calcEqual(names,[...names].sort(order),'Calc cache paths are unordered');
  for(const file of names){calcTrialCachePath(file);assert.match(header.assets[file],/^[a-f0-9]{64}$/);}
  assert.ok(Array.isArray(header.blobs));calcEqual(header.blobs.map(b=>b.sha256),[...new Set(Object.values(header.assets))].sort(order),'Missing/repeated/unused calc cache blob');
  const blobs=new Map();let offset=12+size;
  for(const blob of header.blobs){
    calcEqual(Object.keys(blob),['sha256','bytes']);assert.ok(Number.isSafeInteger(blob.bytes)&&blob.bytes>=0&&blob.bytes<=calcTrialCacheBounds.file&&blob.bytes<=bytes.length-offset);
    const item=bytes.subarray(offset,offset+blob.bytes);assert.equal(calcHash(item),blob.sha256,'Changed calc cache artifact');blobs.set(blob.sha256,item);offset+=blob.bytes;
  }
  assert.equal(offset,bytes.length,'Trailing calc cache bytes');const files=new Map();let logicalBytes=0;
  for(const file of names){const item=blobs.get(header.assets[file]);logicalBytes+=item.length;assert.ok(logicalBytes<=calcTrialCacheBounds.logical);files.set(file,item);}
  return{bytes,header,files,blobs,logicalBytes};
}
