// Fixed calc scope only: historical proofs retain old sources; current guards use current bytes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {calcHash} from './calc-saved-images.mjs';
import {decodeCalcNativeCache,calcNativeCacheBounds} from './calc-native-cache-codec.mjs';

// Reviewed math mark/alias opt-ins, inspection vocabulary, identical envelopes,
// plotting's explicit component-limit callback (calc retains strict zero), and
// raster equal-pixel/equal-mask work with unchanged metrics and native policies.
// Width-only policy selection and optional trusted PDF thin-line mode leave the fixed calc branch unchanged.
// These are byte-pair enrollments, not permission to accept another tool version.
export const calcCaptureCompatibility=Object.fromEntries([
 ['arrow-vector-pair.mjs','0c81b0c8bcccac19f1f6c0da2075666e4fad80f48bea425cd485e28b1e45f3c8','f814101df3ffdb30d897d6a1d2d51713cac9555192471b54c9f8e026d467408e'],
 ['calc-primary-policy.mjs','a725f9621627e2036cfccbb694f38cac82b497aa9e8781eef3d5e5f6e80ca1aa','b6c687fe35aaa682d4aaa1c89cac4473c5bc8e62daeaa59188530487f41d02f7'],
 ['compare.mjs','3a63ac3f22ec1c500c02a6e6679ac9664a78981dd2dd0867a23c435970c0a687','16d1daa09c29c6a9b1bd495ee4e94482cd99a4739f568c8b628bab63de2cfba4'],
 ['edge-oracle-pair.mjs','20df641b0a7f6ffdb3e0795991ad2f3f709ab63e633e83087e47078c432b01d6','fce2f037171eb45fa304870174fedf9f50ad7b90332c8547e40b1d5b48c00b31'],
 ['edge-pdf-image-pair.mjs','75e5c4fe967b280eeb1e5ab47dde1085292f021a8da455bba917736dedd14693','e26db98beba5e2750e6635ffa7699a36a156d6461a954496a0a4b06deed34c6f'],
 ['shape-primary-trial-policy.mjs','7cbbce06ba3175ecfc4289f6019ca1571355fd70e78e280892adf00877f689c2','2689c85171c289525ad2ffc2eca6516312bdaa282aaf4a0a8ea1a779e60dfc15'],
 ['shape-raster-metrics.mjs','bb4becb5e6025fe3d296b7536214536e486c127ffd46a4adf62fc11778861936','ce624b7232b134cd3eae243ad5f99521b5dde7b6e9fba8e802cb01b00743c38a']
].map(([file,historical,current])=>['tools/TikzVisual/'+file,{historical,current}]));
calcCaptureCompatibility['tools/TikzReference/Program.cs']={historical:'b479bbfaf21f000d36179d39fe3dc5d80e2f976e1cbfd9a0c13aedaa83dd191e',current:'83139733b32015f914ad2196ab0fa5e33885559776ca367774af065febf3d80c'};
// Bounded artifact reads preserve all fixed calc metrics and source ownership.
calcCaptureCompatibility['tools/TikzVisual/calc-saved-images.mjs']={historical:'2fb2d423cca9edf733211b57f99a97b47c6d0fd6572dd7035c16b1f2756267dd',current:'185395b3fbf850e82b6fd79ab2d8828c6f25ac3dcfcbdceeece065f8cd968ec9'};
// The public-trial consumer now uses this same exact-pair check.
calcCaptureCompatibility['tools/TikzVisual/calc-trial-reference.mjs']={historical:'a94f03a04694ddd1f7639a96ab54b0db4edc4513b07bffea2dac7e37118c9b6e',current:'94c117ee0bf4bf762b22f709bb56b026522b7c0bcac97d2f661df2fc744819dc'};

// Only host-release provenance changed; pixel/reference policies and captures remain required.
calcCaptureCompatibility['tools/TikzVisual/trial-calc.mjs']={historical:'375807c0db32aa8695ba0416c35e42a324e1a98d6a6f75f2f11dbdccb799cad7',current:'0172b76ff14eb97c11581fe3dac0781e2cace381f57bbe8b73c737332b6da7f6'};

export function calcCurrentCaptureHash(file,historical,bytes){
 const actual=calcHash(bytes),pair=calcCaptureCompatibility[file];
 if(actual===historical)return actual;
 assert.ok(pair&&historical===pair.historical&&actual===pair.current,'Unreviewed current calc capture dependency: '+file);
 return actual;
}

export function calcHistoricalToolRead(root,read=readFile){
 let historical;
 async function capturedSources(){
  if(!historical)historical=(async()=>{
   // Trial pins are initialized before a historical archive is requested.
   const {calcNativeCacheFile,calcNativeCacheSha256}=await import('./calc-native-cache-pin.mjs');
   const {loadCalcTrialCache}=await import('./calc-trial-cache.mjs');
   const compressed=await read(path.join(root,calcNativeCacheFile));assert.ok(compressed.length<=calcNativeCacheBounds.compressed);
   assert.equal(calcHash(compressed),calcNativeCacheSha256,'Unreviewed native cache bytes');
   const cache=decodeCalcNativeCache(gunzipSync(compressed,{maxOutputLength:calcNativeCacheBounds.decoded})),result=new Map();
   const trial=await loadCalcTrialCache(root,{pixels:false});
   for(const[file,pair]of Object.entries(calcCaptureCompatibility)){
    const bytes=cache.files.get('sources/'+file)??trial.cache.files.get('sources/'+file);assert.ok(bytes);assert.equal(calcHash(bytes),pair.historical);result.set(file,Buffer.from(bytes));
   }
   return result;
  })();return historical;
 }
 return async file=>{
  const bytes=await read(file),relative=path.relative(root,file).split(path.sep).join('/'),pair=calcCaptureCompatibility[relative];
  if(!pair)return bytes;
  const actual=calcCurrentCaptureHash(relative,pair.historical,bytes);if(actual===pair.historical)return bytes;
  return(await capturedSources()).get(relative);
 };
}
