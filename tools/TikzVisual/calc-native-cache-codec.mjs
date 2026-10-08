// Reuse the lossless development archive format with a strict native-only envelope.
import assert from 'node:assert/strict';
import {encodeArrowCache,decodeArrowCache} from './arrow-image-cache-codec.mjs';
import {calcEqual} from './calc-saved-images.mjs';
export const calcNativeCacheBounds={compressed:48000000,decoded:256000000,files:8192,logical:512000000};
export const calcNativeCacheMetadata={schemaVersion:1,role:'calc-native-calibration-evidence-cache',
  scope:'Only the fixed glyph-free CalcCoordinates primary/PDF calibration and sensitivity evidence; no candidate or image admission.',
  converterInvoked:false,nativeToolInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending'};
export function encodeCalcNativeCache(files){
  assert.ok(files instanceof Map&&files.size>0&&files.size<=calcNativeCacheBounds.files);let logical=0;
  for(const b of files.values()){assert.ok(Buffer.isBuffer(b));logical+=b.length;assert.ok(logical<=calcNativeCacheBounds.logical);}
  const bytes=encodeArrowCache(calcNativeCacheMetadata,files);assert.ok(bytes.length<=calcNativeCacheBounds.decoded);return bytes;
}
export function decodeCalcNativeCache(bytes){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=calcNativeCacheBounds.decoded);const cache=decodeArrowCache(bytes),h=cache.header;
  calcEqual(Object.keys(h),[...Object.keys(calcNativeCacheMetadata),'assets','blobs'],'Native cache metadata fields differ');
  for(const[k,v]of Object.entries(calcNativeCacheMetadata))calcEqual(h[k],v,'Native cache scope/claim differs');
  const names=Object.keys(h.assets);assert.ok(names.length<=calcNativeCacheBounds.files);const files=new Map();let logicalBytes=0;
  for(const f of names){const b=cache.get(f);logicalBytes+=b.length;assert.ok(logicalBytes<=calcNativeCacheBounds.logical);files.set(f,b);}
  return{...cache,files,logicalBytes};
}
