// Current candidates are generated afresh; qualification is historical evidence only.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {arrowCanonical} from './arrow-native-contract.mjs';
import {assertNativeEqual} from './arrow-meet-pdf-contract.mjs';
import {arrowPublicMeetSources} from './arrow-public-meet-contract.mjs';
import {arrowCachePath} from './arrow-image-cache-codec.mjs';

export const arrowCurrentTrialPending=['independent-current-trial-reader','fresh-tracked-export-reproduction','immutable-fixed-family-image-admission'];
export async function arrowCurrentTrialSources(e){
  const sources=await arrowPublicMeetSources(e);
  const queue=['trial-arrow-current.mjs','check-arrow-current.mjs','arrow-current-trial-reader.mjs'].map(p=>'tools/TikzVisual/'+p);
  for(let i=0;i<queue.length;i++){
    const name=queue[i];if(sources.has(name))continue;
    assert.match(name,/^tools\/TikzVisual\/[a-z0-9.-]+\.mjs$/);
    const bytes=arrowCanonical(await readFile(path.join(root,name)));sources.set(name,{bytes,sha256:sha256(bytes)});
    for(const m of bytes.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(name),m[1])));
  }
  return new Map([...sources].sort(([a],[b])=>a<b?-1:a>b?1:0));
}
export function arrowCurrentCandidateInput(read,pdf){
  // No fallback to any captured historical public SVG or scene.
  const candidateRead=name=>{arrowCachePath(name);return read(name);};
  return{bundle:{read:candidateRead,json:name=>JSON.parse(candidateRead(name)),pdf}};
}
export function arrowCurrentNumericParity(reference,actual){
  for(const n of [reference,actual])assert.match(n.assemblySha256,/^[a-f0-9]{64}$/);
  assertNativeEqual({...actual,assemblySha256:null},{...reference,assemblySha256:null},'Fresh numeric checks, current SVGs, scenes, sources or inputs changed.');
  return{referenceAssemblySha256:reference.assemblySha256,actualAssemblySha256:actual.assemblySha256,identicalAssemblyBytes:reference.assemblySha256===actual.assemblySha256};
}
export function arrowCurrentIndex(inspection){
  return '<!doctype html><meta charset="utf-8"><title>Current arrow combined trial</title><h1>Current arrow combined trial; admission pending</h1><p>Fresh converter output and every baseline and image-only sensitivity view use unchanged qualified native policies.</p><p><a href="report.json">Report</a> · <a href="agent-inspection.json">Complete agent inspection index</a> · <a href="pdf/index.html">PDF focus gallery</a></p>'+inspection.primary.filter(r=>r.view.includes('1x-white')).map(r=>'<article><h2>'+r.view+'</h2><a href="'+r.record+'">Source attribution and gates</a><img style="max-width:100%;image-rendering:pixelated" src="'+r.pair+'">'+r.crops.map(p=>'<img style="max-width:100%;image-rendering:pixelated" src="'+p+'">').join('')+'</article>').join('');
}
