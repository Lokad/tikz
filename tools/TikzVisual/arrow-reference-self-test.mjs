// Native observer/reader controls. No candidate conversion or image admission.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {parseArrowLog} from './arrow-log.mjs';
import {verifyArrowDriverState,arrowSvgSegments,arrowSvgVectors} from './arrow-driver-state.mjs';
assert.equal(process.argv.length,2);
const output=path.join(root,'artifacts/arrow-native-controls/run-'+randomUUID()),artifacts={},controls=[];
const save=(p,b)=>writeArtifact(output,p,b,artifacts);let phase='frozen-native-inputs';
async function reject(id,action,pattern){let error;try{await action();}catch(e){error=e;}assert.ok(error,'Control accepted invalid arrow evidence: '+id);
 assert.match(error.message,pattern,id+' rejected for the wrong reason.');controls.push({id,passed:true,rejected:true,diagnostic:error.message.slice(0,512)});}
try{
 await writeArtifact(output,'report.json',JSON.stringify({completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false})+'\n');
 const evidence=await loadArrowEvidence();controls.push({id:'complete pinned cached replay',passed:true,rejected:false});
 const files=new Map();for(const p of [...Object.keys(evidence.snapshot.sourceHashes),'tests/Reference/Arrows/snapshot.json',...Object.keys(evidence.snapshot.artifacts).map(p=>'tests/Reference/Arrows/'+p)])files.set(p,await readFile(path.join(root,p)));
 const read=p=>{const b=files.get(p);assert.ok(b,'Missing virtual native input: '+p);return b;};
 const override=(file,value)=>loadArrowEvidence(async p=>p===file?value:read(p));
 await reject('changed immutable snapshot',()=>override('tests/Reference/Arrows/snapshot.json',Buffer.from('{}')),/Frozen native arrow snapshot/);
 await reject('changed hook source',()=>override('tools/TikzArrowReference/arrow-hooks.tex',Buffer.from('% changed')),/Changed native arrow engine input/);
 const artifact='tests/Reference/Arrows/meta-defaults/plain-reference.svg';
 await reject('substituted native drawing',()=>override(artifact,read(artifact).subarray(0,100)),/Changed native arrow artifact/);
 await reject('missing native PDF',()=>loadArrowEvidence(async p=>{if(p==='tests/Reference/Arrows/meta-defaults/plain-reference.pdf')throw Error('missing native PDF');return read(p);}),/missing native PDF/);
 await reject('changed PDF page pixels',()=>override('tests/Reference/Arrows/meta-defaults/plain-pdf-page-1x.png',Buffer.from('not a PNG')),/Changed native arrow artifact/);
 const forged=structuredClone(evidence.snapshot);forged.approvedImagePolicy=true;
 await reject('invented image admission',()=>override('tests/Reference/Arrows/snapshot.json',Buffer.from(JSON.stringify(forged))),/Frozen native arrow snapshot/);
 const altered=Buffer.from(read(artifact));altered[20]^=1;const rehashed=structuredClone(evidence.snapshot);rehashed.artifacts['meta-defaults/plain-reference.svg']=sha256(altered);
 await reject('rehashed replacement does not authorize a new oracle',()=>loadArrowEvidence(async p=>p==='tests/Reference/Arrows/snapshot.json'?Buffer.from(JSON.stringify(rehashed)):p===artifact?altered:read(p)),/Frozen native arrow snapshot/);
 phase='native-observer-controls';
 const row=id=>evidence.cases.find(c=>c.id===id),native=(id,p)=>evidence.artifacts.get(id+'/'+p),raw=id=>{
  const m=structuredClone(row(id).metrics);delete m.driverState;delete m.pdfCamera;return m;};
 const verify=(id,m,svg=native(id,'plain-reference.svg'),pdf=native(id,'plain-reference.pdf'),page=row(id).metrics.pdfCamera.page)=>verifyArrowDriverState(m,svg,pdf,page);
 const fault=async(id,caseId,mutate,pattern)=>{const m=raw(caseId);mutate(m);await reject(id,()=>verify(caseId,m),pattern);};
 await fault('wrong exact shortening', 'meta-defaults',m=>m.shortening.find(s=>s.side==='end').distanceSp++,/shortening/);
 await fault('wrong explicit shortening register','dimensions',m=>m.inputs[3].additionalShorteningSp.end++,/shortening/);
 await fault('wrong line end','meta-defaults',m=>m.templates.find(t=>t.name==='Stealth').ends.lineSp++,/shortening/);
 await fault('wrong template local geometry','meta-defaults',m=>{const t=m.templates.find(t=>t.name==='Stealth');m.paths[t.paths[0]-1].segments[0].xSp+=65536;},/one geometry\/placement identity/);
 await fault('wrong painted shaft endpoint','meta-defaults',m=>m.paths.find(p=>p.role==='shaft').segments[1].xSp+=65536,/shaft.end/);
 await fault('wrong cached tip placement','meta-defaults',m=>m.placements[1].xSp+=65536,/axis.x/);
 await fault('dropped repeated cached tip','meta-defaults',m=>m.paintEvents.splice(m.paintEvents.findIndex(e=>e.kind==='tip'&&e.target===6),1),/Native shipped paint count/);
 await fault('changed template pen clamp','dimensions',m=>{const t=m.templates.find(t=>t.configuredSizeSp?.[3]===262144&&t.name==='Stealth');m.paths[t.paths[0]-1].lineWidthSp=262144;},/\.svg.pen/);
 await fault('changed clip geometry','paint-boundaries',m=>m.paths[m.clips[0]-1].segments[2].xSp+=65536,/clip-0\.svg/);
 const page={...row('meta-defaults').metrics.pdfCamera.page,boxXSp:row('meta-defaults').metrics.pdfCamera.page.boxXSp+65536};
 await reject('wrong measured page origin',()=>verify('meta-defaults',raw('meta-defaults'),undefined,undefined,page),/pdf.origin.x/);
 const svg=native('meta-defaults','plain-reference.svg').toString('utf8'),changed=svg.replace("fill='#000' stroke='#000'","fill='#f00' stroke='#000'");assert.notEqual(changed,svg);
 await reject('wrong native tip fill state',()=>verify('meta-defaults',raw('meta-defaults'),Buffer.from(changed)),/fill\.0/);
 const shafts=[...svg.matchAll(/<path d='M0 [^']+' fill='none'\/>/g)];assert.ok(shafts.length>=2);
 const swapped=svg.replace(shafts[0][0],'ARROW-PATH-SWAP').replace(shafts[1][0],shafts[0][0]).replace('ARROW-PATH-SWAP',shafts[1][0]);
 await reject('SVG/PDF physical paint order disagreement',()=>verify('meta-defaults',raw('meta-defaults'),Buffer.from(swapped)),/paint-1\.pdf/);
 const log=native('meta-defaults','svg-probed.log').toString('utf8');
 await reject('missing template endpoint observation',()=>parseArrowLog(log.replace(/ARROW-ENDS 1\|[^\n]+\|END/,'')),/assertion|falsy/);
 await reject('incomplete native record',()=>parseArrowLog(log+'\nARROW-PLACE 99|'),/Incomplete native arrow record/);
 await reject('unknown observer record',()=>parseArrowLog(log+'\nARROW-UNKNOWN 1|END\n'),/Unknown native arrow observation/);
 assert.deepEqual(arrowSvgSegments('M0 0C1 2 3 4 5 6S7 8 9 10')[2],{kind:'cubic',a:{x:7,y:8},b:{x:7,y:8},point:{x:9,y:10}});
 controls.push({id:'smooth cubic reflected support decoded',passed:true,rejected:false});
 const mixed=Buffer.from("<svg><defs><path id='glyph' d='M0 0L1 1'/></defs><g transform='translate(1,2)scale(0.996264,-0.996264)'><path d='M0 0L2 0'/><use xlink:href='#glyph' x='1' y='0'/></g></svg>");
 await reject('glyph-free geometry reader rejects text',()=>arrowSvgVectors(mixed),/Unexpected arrow SVG element|strictly equal/);
 const observed=arrowSvgVectors(mixed,{allowText:true});assert.equal(observed.paths.length,1);assert.deepEqual(observed.paths[0].segments,arrowSvgSegments('M0 0L2 0'));
 controls.push({id:'mixed diagram geometry excludes glyph definitions and uses',passed:true,rejected:false});
 const curves=row('curves-nodes').metrics.driverState.paints.map(p=>p.eventId);assert.deepEqual(curves.slice(-3),[22,20,21]);
 controls.push({id:'deferred edge physical order differs from callback order',passed:true,rejected:false});
 for(const c of evidence.cases){for(const p of c.metrics.driverState.paints.filter(p=>p.role==='tip')){assert.deepEqual(p.dashSp,[]);assert.equal(p.phaseSp,0);}
  controls.push({id:'template dash reset/'+c.id,passed:true,rejected:false});}
 await save('source-capture.mjs',await readFile(new URL(import.meta.url)));
 const report={schemaVersion:1,comparisonKind:'arrow-native-observer-controls',completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
  snapshotSha256:evidence.snapshotSha256,cases:evidence.cases.map(c=>({id:c.id,counts:c.counts})),controls,artifacts};
 const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);console.log(JSON.stringify({completed:true,controls:controls.length,report:path.relative(root,path.join(output,'report.json')).replaceAll('\\','/'),sha256:sha256(bytes)}));
}catch(error){await writeArtifact(output,'report.json',JSON.stringify({completed:false,phase,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.slice(0,1000),controls,artifacts},null,2)+'\n');console.error(error.message.slice(0,1000));process.exitCode=2;}
