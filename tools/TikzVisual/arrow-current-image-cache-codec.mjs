// Combined qualification shares only exact bytes from pinned public and native archives.
import assert from 'node:assert/strict';
import {sha256} from './shape-oracle-bundle.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowCachePath,encodeArrowCache,decodeArrowCache} from './arrow-image-cache-codec.mjs';

export const arrowCurrentCacheBounds={compressed:96000000,files:20000,logicalFile:64000000,logicalTotal:1100000000,chunk:16*1024*1024};
const order=(a,b)=>a<b?-1:a>b?1:0;
const digest=/^[a-f0-9]{64}$/;
const roles=['base','meet','public','base-container','meet-container','public-container'];
function externalLocation(location){
  assertNativeEqual(Object.keys(location),['role','file']);assert.ok(roles.includes(location.role));arrowCachePath(location.file);
  if(location.role.endsWith('-container'))assert.equal(location.file,'archive');
  return location;
}
export function arrowCurrentExternalPool(publicCache){
  const e=publicCache.native;
  const pool=new Map();
  const add=(role,file,bytes)=>{const hash=sha256(bytes);if(pool.has(hash))assert.ok(pool.get(hash).bytes.equals(bytes));else pool.set(hash,{role,file,bytes});};
  add('public-container','archive',publicCache.compressed);
  for(const[file,bytes]of publicCache.files)add('public',file,bytes);
  add('base-container','archive',e.base.compressed);add('meet-container','archive',e.compressed);
  for(const file of Object.keys(e.base.header.assets))add('base',file,e.base.get(file));
  for(const[file,bytes]of e.files)add('meet',file,bytes);
  return pool;
}
export function encodeArrowCurrentArchive(metadata,files,pool){
  assert.ok(files instanceof Map&&files.size>0&&files.size<=arrowCurrentCacheBounds.files&&pool instanceof Map);
  for(const key of ['assets','blobs','chunkBytes','logicalAssets','logicalBlobs'])assert.ok(!Object.hasOwn(metadata,key));
  const logicalAssets=Object.create(null),originals=new Map();let total=0;
  for(const file of [...files.keys()].sort(order)){
    arrowCachePath(file);const bytes=files.get(file);assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=arrowCurrentCacheBounds.logicalFile);
    total+=bytes.length;assert.ok(total<=arrowCurrentCacheBounds.logicalTotal);
    const hash=sha256(bytes);logicalAssets[file]=hash;
    if(originals.has(hash))assert.ok(originals.get(hash).equals(bytes));else originals.set(hash,bytes);
  }
  const logicalBlobs=Object.create(null),physical=new Map();
  for(const[hash,bytes]of [...originals].sort(([a],[b])=>order(a,b))){
    const external=pool.get(hash);
    if(external){assert.ok(external.bytes.equals(bytes));logicalBlobs[hash]={bytes:bytes.length,external:externalLocation({role:external.role,file:external.file})};continue;}
    const parts=[];
    for(let i=0;i<Math.max(1,Math.ceil(bytes.length/arrowCurrentCacheBounds.chunk));i++){
      const file='chunks/'+hash+'/'+String(i).padStart(4,'0');parts.push(file);
      physical.set(file,bytes.subarray(i*arrowCurrentCacheBounds.chunk,Math.min(bytes.length,(i+1)*arrowCurrentCacheBounds.chunk)));
    }
    logicalBlobs[hash]={bytes:bytes.length,parts};
  }
  assert.ok(physical.size>0);return encodeArrowCache({...metadata,chunkBytes:arrowCurrentCacheBounds.chunk,logicalAssets,logicalBlobs},physical);
}
export function decodeArrowCurrentArchive(bytes,externalRead){
  assert.equal(typeof externalRead,'function');const cache=decodeArrowCache(bytes),h=cache.header;
  assert.equal(h.chunkBytes,arrowCurrentCacheBounds.chunk);
  assert.ok(h.logicalAssets&&typeof h.logicalAssets==='object'&&!Array.isArray(h.logicalAssets));
  assert.ok(h.logicalBlobs&&typeof h.logicalBlobs==='object'&&!Array.isArray(h.logicalBlobs));
  const names=Object.keys(h.logicalAssets);assert.ok(names.length>0&&names.length<=arrowCurrentCacheBounds.files);assertNativeEqual(names,[...names].sort(order));
  for(const file of names){arrowCachePath(file);assert.match(h.logicalAssets[file],digest);}
  const hashes=[...new Set(Object.values(h.logicalAssets))].sort(order);assertNativeEqual(Object.keys(h.logicalBlobs),hashes);
  const logical=new Map(),parts=new Set();let externalBlobs=0;
  for(const hash of hashes){
    const d=h.logicalBlobs[hash];assert.ok(d&&typeof d==='object'&&!Array.isArray(d));
    assert.ok(Number.isSafeInteger(d.bytes)&&d.bytes>=0&&d.bytes<=arrowCurrentCacheBounds.logicalFile);let original;
    if(Object.hasOwn(d,'external')){
      assertNativeEqual(Object.keys(d),['bytes','external']);const location=externalLocation(d.external);original=externalRead(location.role,location.file);externalBlobs++;
      assert.ok(Buffer.isBuffer(original)&&original.length===d.bytes,'Changed external native byte length.');
    }else{
      assertNativeEqual(Object.keys(d),['bytes','parts']);assert.ok(Array.isArray(d.parts));assert.equal(d.parts.length,Math.max(1,Math.ceil(d.bytes/arrowCurrentCacheBounds.chunk)));
      const chunks=d.parts.map((file,i)=>{assert.equal(file,'chunks/'+hash+'/'+String(i).padStart(4,'0'));parts.add(file);const chunk=cache.get(file);
        assert.equal(chunk.length,Math.min(arrowCurrentCacheBounds.chunk,Math.max(0,d.bytes-i*arrowCurrentCacheBounds.chunk)));return chunk;});
      original=chunks.length===1?chunks[0]:Buffer.concat(chunks,d.bytes);
    }
    assert.equal(sha256(original),hash,'Changed combined qualification artifact.');logical.set(hash,original);
  }
  assertNativeEqual(Object.keys(h.assets),[...parts].sort(order),'Unused physical combined chunk.');
  const files=new Map();let logicalBytes=0;
  for(const file of names){const original=logical.get(h.logicalAssets[file]);logicalBytes+=original.length;assert.ok(logicalBytes<=arrowCurrentCacheBounds.logicalTotal);files.set(file,original);}
  return{...cache,files,logical,logicalBytes,externalBlobs,get(file){arrowCachePath(file);assert.ok(files.has(file),'Missing combined qualification artifact: '+file);return files.get(file);}};
}
export function arrowCurrentExternalRead(publicCache){
  const e=publicCache.native;
  return(role,file)=>{
    externalLocation({role,file});
    if(role==='public-container')return publicCache.compressed;if(role==='public')return publicCache.get(file);
    if(role==='base-container')return e.base.compressed;if(role==='meet-container')return e.compressed;
    return role==='base'?e.base.get(file):e.get(file);
  };
}
