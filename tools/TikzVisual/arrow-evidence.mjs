// Bounded cached validation. Never invokes TeX, a rasterizer or the converter.
import assert from 'node:assert/strict';
import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {arrowSnapshotSha256} from './arrow-reference-pin.mjs';
import {arrowProfile,arrowIds,arrowManifest,arrowReferenceSources,canonicalArrow,validateArrowManifest,parseArrowLog,arrowLayout,arrowPage} from './arrow-log.mjs';
import {verifyArrowDriverState} from './arrow-driver-state.mjs';
export async function loadArrowEvidence(read=async p=>{
 assert.match(p,/^[A-Za-z0-9_./-]+$/);assert.ok(!p.startsWith('/')&&!p.split('/').some(s=>['','..','.'].includes(s)));const file=path.resolve(root,p);
 for(let d=file;d!==root;d=path.dirname(d))assert.equal((await lstat(d)).isSymbolicLink(),false,'Native evidence crosses a link.');
 const stat=await lstat(file);assert.ok(stat.isFile()&&stat.size<=5000000,'Native arrow artifact size limit.');return readFile(file);
}){
 const reference='tests/Reference/Arrows/',bytes=await read(reference+'snapshot.json');assert.equal(sha256(bytes),arrowSnapshotSha256,'Frozen native arrow snapshot changed.');
 const snapshot=JSON.parse(bytes);assert.equal(snapshot.schemaVersion,1);assert.equal(snapshot.profile,arrowProfile);assert.equal(snapshot.converterInvoked,false);
 assert.equal(snapshot.approvedImagePolicy,false);assert.equal(snapshot.imageConformanceClaim,false);assert.deepEqual(snapshot.cases.map(c=>c.id),arrowIds);
 const manifest=JSON.parse(await read(arrowManifest));validateArrowManifest(manifest);
 const files=[...arrowReferenceSources,...manifest.cases.map(c=>c.source)];assert.deepEqual(Object.keys(snapshot.sourceHashes),files);
 for(const p of files)assert.equal(sha256(canonicalArrow(await read(p))),snapshot.sourceHashes[p],'Changed native arrow source: '+p);
 const artifacts=new Map();let total=0;
 for(const [p,h]of Object.entries(snapshot.artifacts)){assert.match(p,new RegExp('^('+arrowIds.join('|')+')/[a-z0-9.-]+$'));assert.match(h,/^[a-f0-9]{64}$/);const b=await read(reference+p);
  total+=b.length;assert.ok(total<=50000000);assert.equal(sha256(b),h,'Changed native arrow artifact: '+p);artifacts.set(p,b);}
 const cases=[];
 for(const c of snapshot.cases){const get=p=>{const b=artifacts.get(c.id+'/'+p);assert.ok(b,'Missing arrow native input: '+c.id+'/'+p);return b;},text=p=>get(p).toString('utf8');
  const svgLog=text('svg-probed.log'),pdfLog=text('pdf-probed.log'),metrics=parseArrowLog(svgLog);assert.deepEqual(metrics,parseArrowLog(pdfLog));
  assert.deepEqual(arrowLayout(svgLog),arrowLayout(text('svg-plain.log')));assert.deepEqual(arrowLayout(pdfLog),arrowLayout(text('pdf-plain.log')));
  assert.ok(get('plain-reference.svg').equals(get('probed-reference.svg')));assert.ok(get('plain-reference.pdf').equals(get('probed-reference.pdf')));
  const canonicalDvi=b=>{assert.equal(b[0],247);assert.equal(b[1],2);assert.ok(b[14]>0&&b.length>15+b[14]);const a=Buffer.from(b);a.fill(32,15,15+a[14]);return a;};
  assert.ok(canonicalDvi(get('plain-native.dvi')).equals(canonicalDvi(get('probed-native.dvi'))));assert.equal(sha256(canonicalDvi(get('probed-native.dvi'))),c.normalizedDviSha256);
  for(const scale of [1,4])assert.ok(get('plain-pdf-page-'+scale+'x.png').equals(get('probed-pdf-page-'+scale+'x.png')));
  const page=arrowPage(pdfLog);assert.deepEqual(page,arrowPage(text('pdf-plain.log')));const driverState=verifyArrowDriverState(metrics,get('plain-reference.svg'),get('plain-reference.pdf'),page);
  const box=metrics.pictureBox,bounds=metrics.pictureBounds,spToCss=96/(72.27*65536),rasterSizes={};
  for(const scale of [1,4]){const b=get('plain-pdf-page-'+scale+'x.png');assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');const size={width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
   assert.deepEqual(size,{width:Math.ceil(500*96/72.27*scale),height:Math.ceil(600*96/72.27*scale)});rasterSizes[scale]={sha256:sha256(b),size};}
  const pdfCamera={page,origin:{x:(page.boxXSp-bounds.minXSp)*spToCss,y:(page.heightSp-page.boxBaselineYSp+bounds.minYSp+box.depthSp)*spToCss},rasterSizes};
  const rebuilt={...metrics,driverState,pdfCamera};assert.deepEqual(JSON.parse(text('metrics.json')),rebuilt,'Saved arrow metrics disagree with original native instructions.');
  const counts={inputs:metrics.inputs.length,paths:metrics.paths.length,templates:metrics.templates.length,tips:metrics.placements.length,paints:driverState.paints.length,clips:metrics.clips.length,driverChecks:driverState.checks.length};
  assert.deepEqual(counts,c.counts);assert.deepEqual(c.invariance,{svgBytes:true,dviDrawingInstructions:true,pdfBytes:true,pdfPixels:true,pictureBox:true,nativeSvgPdfObservations:true,shippedGeometryAndPaint:true});cases.push({id:c.id,counts,metrics:rebuilt});
 }
 assert.equal(artifacts.size,arrowIds.length*15,'Missing or additional native arrow artifact.');
 return{snapshot,snapshotSha256:arrowSnapshotSha256,cases,artifacts,totalBytes:total};
}
