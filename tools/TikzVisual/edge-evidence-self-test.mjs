import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadEdgeEvidence,edgeReference} from './edge-evidence.mjs';
import {parseEdgeLog,edgePhysicalOrder,edgeCanonical,edgeSanitize} from './edge-log.mjs';
import {verifyEdgeDriverState,edgeSvgPaints,edgePdfPaints} from './edge-driver-state.mjs';
import {verifyEdgeReplay,canonicalEdgeSvg} from './edge-replay.mjs';

const base=path.join(root,'artifacts/edge-evidence-controls'),output=path.join(base,'run-'+randomUUID()),controls=[],artifacts={};
const tools=['tools/TikzVisual/edge-evidence.mjs','tools/TikzVisual/edge-evidence-self-test.mjs',
  'tools/TikzVisual/edge-log.mjs','tools/TikzVisual/edge-driver-state.mjs','tools/TikzVisual/edge-replay.mjs'];
let baseline;const toolHashes={};
async function check(name,expected,action){let error=null;try{await action();}catch(e){error=e.message;}
  assert.equal(error===null,expected==='pass',name+': unexpected outcome: '+error);controls.push({name,expected,passed:true,error});}
const changedReader=changed=>async file=>{const bytes=changed.has(file)?changed.get(file):baseline.files.get(file);assert.ok(bytes,'Missing native input: '+file);return bytes;};
const altered=(bytes,action)=>{const value=JSON.parse(bytes);action(value);return Buffer.from(JSON.stringify(value,null,2)+'\n');};
const coordinates=p=>p.segments.filter(s=>s.kind==='move'||s.kind==='line').map(s=>[s.xSp/65536,s.ySp/65536]);
async function publish(completed,error){const report={schemaVersion:1,comparisonKind:'straight-edge-native-cache-controls',completed,passed:completed,
  converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,overallVerdict:'pending',snapshotSha256:baseline?.snapshotSha256,
  checkedFiles:baseline?.files.size,byteCount:baseline?.byteCount,toolHashes,controls,artifacts,...(error?{error}: {})};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  const relative=path.relative(base,path.join(output,'report.json')).split(path.sep).join('/');
  await writeArtifact(base,'latest.json',JSON.stringify({completed,report:relative,sha256:sha256(bytes)},null,2)+'\n');
  console.log(JSON.stringify({kind:'edge-evidence-controls-output',completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}
try{
  assert.equal(process.argv.length,2);
  for(const file of tools){const bytes=edgeCanonical(await readFile(path.join(root,file)));toolHashes[file]=sha256(bytes);await writeArtifact(output,'source-captures/'+file,bytes,artifacts);}
  await check('log-sanitization/startup-timestamp','pass',()=>assert.equal(edgeSanitize('This is pdfTeX, Version test (format 2025.9.25)  6 OCT 2026 19:30\nLOKAD-SEG 1|line|-42|101|END\n'),
    'This is pdfTeX, Version test (format 2025.9.25) <timestamp>\nLOKAD-SEG 1|line|-42|101|END\n'));
  baseline=await loadEdgeEvidence();
  await check('unchanged-cache','pass',()=>loadEdgeEvidence(changedReader(new Map())));
  async function replay(mutate){
    const actual=structuredClone(baseline.snapshot),files=new Map(Object.keys(actual.artifacts).map(f=>[f,baseline.files.get(edgeReference+f)]));
    mutate?.(files,actual);
    for(let i=0;i<actual.cases.length;i++){
      const c=actual.cases[i],file=c.id+'/provenance.json',p=JSON.parse(files.get(file));
      for(const f of Object.keys(p.artifacts))p.artifacts[f]=sha256(files.get(f));
      c.invariance.svgBytes=p.invariance.svgBytes=files.get(c.id+'/plain-reference.svg').equals(files.get(c.id+'/probed-reference.svg'));
      files.set(file,Buffer.from(JSON.stringify(p,null,2)+'\n'));
    }
    for(const f of Object.keys(actual.artifacts))actual.artifacts[f]=sha256(files.get(f));
    return verifyEdgeReplay(baseline.snapshot,f=>Promise.resolve(baseline.files.get(edgeReference+f)),actual,f=>Promise.resolve(files.get(f)));
  }
  await check('live-replay/unchanged','pass',()=>replay());
  await check('live-replay/glyph-definition-order','pass',()=>replay(files=>{
    const file='nodes/probed-reference.svg',s=files.get(file).toString('utf8');
    files.set(file,Buffer.from(s.replace(/<defs>([\s\S]*?)<\/defs>/,(_,body)=>'<defs>'+[...body.matchAll(/<path\b[^>]*\/>/g)].map(m=>m[0]).reverse().join('')+'</defs>')));
  }));
  for(const[name,mutate]of[
    ['glyph-outline',s=>s.replace(" d='M"," d='M1 ")],
    ['path-geometry',s=>s.replace("<path d='M-8.94443","<path d='M-7.94443")],
    ['viewport',s=>s.replace(/width='([\d.]+)pt'/,(_,w)=>"width='"+(Number(w)+1)+"pt'")]
  ])await check('live-replay/'+name,'reject',()=>replay(files=>{const f='nodes/probed-reference.svg',s=files.get(f).toString('utf8'),changed=mutate(s);assert.notEqual(changed,s);files.set(f,Buffer.from(changed));}));
  await check('live-replay/camera-change','reject',()=>replay(files=>{const f='nodes/metrics.json';files.set(f,altered(files.get(f),m=>m.pdfCamera.origin.x++));}));
  await check('live-replay/source-identity-change','reject',()=>replay((files,s)=>s.sourceHashes[Object.keys(s.sourceHashes)[0]]='0'.repeat(64)));
  await check('live-replay/false-noninterference','reject',()=>replay(files=>{const f='nodes/provenance.json';files.set(f,altered(files.get(f),p=>p.invariance.svgDrawing=false));}));
  await check('live-replay/duplicate-glyph-definition','reject',()=>canonicalEdgeSvg(Buffer.from("<svg><defs><path id='g1' d='M0 0'/><path id='g1' d='M0 0'/></defs></svg>")));
  for(const[file,bytes]of baseline.files){
    await check('missing/'+file,'reject',()=>loadEdgeEvidence(changedReader(new Map([[file,null]]))));
    const changed=Buffer.from(bytes);changed[0]^=1;
    await check('changed/'+file,'reject',()=>loadEdgeEvidence(changedReader(new Map([[file,changed]]))));
  }
  const source='tests/Fixtures/Edges/continuation.tikz';
  await check('canonical-source-crlf','pass',()=>loadEdgeEvidence(changedReader(new Map([[source,Buffer.from(edgeCanonical(baseline.files.get(source)).toString().replaceAll('\n','\r\n'))]]))));
  const snapshotFile=edgeReference+'snapshot.json';
  for(const [name,action]of[
    ['dropped-case',s=>s.cases.pop()],['duplicate-case',s=>s.cases[1]=s.cases[0]],
    ['false-invariance',s=>s.cases[0].invariance.shippedDriverState=false],['false-image-admission',s=>s.approvedImagePolicy=true],
    ['false-image-claim',s=>s.imageConformanceClaim=true],['false-converter-role',s=>s.converterInvoked=true],
    ['dropped-artifact',s=>delete s.artifacts['continuation/native-positions.log']]
  ])await check(name,'reject',()=>loadEdgeEvidence(changedReader(new Map([[snapshotFile,altered(baseline.files.get(snapshotFile),action)]]))));
  const replacement=new Map(),relative='continuation/metrics.json',metricFile=edgeReference+relative,provenanceFile=edgeReference+'continuation/provenance.json';
  const metric=altered(baseline.files.get(metricFile),m=>m.paths[0].segments[0].xSp++);
  const provenance=altered(baseline.files.get(provenanceFile),p=>p.artifacts[relative]=sha256(metric));
  replacement.set(metricFile,metric);replacement.set(provenanceFile,provenance);
  replacement.set(snapshotFile,altered(baseline.files.get(snapshotFile),s=>{s.artifacts[relative]=sha256(metric);s.artifacts['continuation/provenance.json']=sha256(provenance);s.cases[0].nativeMetricsSha256=sha256(metric);}));
  await check('consistently-rehashed-replacement','reject',()=>loadEdgeEvidence(changedReader(replacement)));
  const continuation=baseline.cases[0],styles=baseline.cases[1],frames=baseline.cases[2],nodes=baseline.cases[3],clipping=baseline.cases[4];
  const log=baseline.files.get(edgeReference+'continuation/svg-probed.log').toString('utf8');
  for(const [name,mutate]of[
    ['nonfinite-sp',s=>s.replace('LOKAD-SEG 1|move|0|0|END','LOKAD-SEG 1|move|NaN|0|END')],
    ['missing-path-segments',s=>s.replace(/LOKAD-SEG 1\|[^\n]*\n/g,'')],
    ['duplicate-path',s=>s+'\nLOKAD-PATH 1|drawing|draw,|65536|END\n'],
    ['unsupported-mode',s=>s.replace('drawing|draw,','drawing|invented,')],
    ['invalid-cap',s=>s.replace('EDGE-PAINT 1|stroke|65536|0|0|','EDGE-PAINT 1|stroke|65536|3|0|')],
    ['wrong-paint-operation',s=>s.replace('EDGE-PAINT 1|stroke|','EDGE-PAINT 1|fill|')],
    ['overflow-sp',s=>s.replace('LOKAD-SEG 1|move|0|0|END','LOKAD-SEG 1|move|1073741824|0|END')]
  ])await check('native-parser/'+name,'reject',()=>{const changed=mutate(log);assert.notEqual(changed,log);parseEdgeLog(changed,continuation.fixture);});
  const styleLog=baseline.files.get(edgeReference+'styles/svg-probed.log').toString('utf8');
  await check('native-parser/negative-dash','reject',()=>parseEdgeLog(styleLog.replace('3.0pt,2.0pt','-3.0pt,2.0pt'),styles.fixture));
  const nodeLog=baseline.files.get(edgeReference+'nodes/svg-probed.log').toString('utf8');
  await check('native-parser/nonfinite-frame','reject',()=>parseEdgeLog(nodeLog.replace('LOKAD-FRAME input|1.0|','LOKAD-FRAME input|NaN|'),nodes.fixture));
  const positions=baseline.files.get(edgeReference+'continuation/native-positions.log').toString('utf8');
  await check('physical-order/missing-marker','reject',()=>edgePhysicalOrder(continuation.metrics,log,positions.replace('lokad-edge-path 3','lost-marker 3')));
  const svg=baseline.files.get(edgeReference+'styles/plain-reference.svg'),pdf=baseline.files.get(edgeReference+'styles/plain-reference.pdf');
  for(const [name,mutate]of[
    ['color',s=>s.replace("fill='#f00' stroke='#f00'","fill='#0f0' stroke='#0f0'")],
    ['stroke-width',s=>s.replace("stroke-width='1.0'","stroke-width='2.0'")],
    ['opacity',s=>s.replace("stroke-opacity='.4'","stroke-opacity='.8'")],
    ['cap',s=>s.replace("stroke-linecap='round'","stroke-linecap='butt'")],
    ['dash-phase',s=>s.replaceAll("stroke-dashoffset='1.0'","stroke-dashoffset='2.0'")],
    ['fill-color',s=>s.replaceAll("fill='#ff0'","fill='#0ff'")]
  ])await check('shipped-state/'+name,'reject',()=>{const changed=mutate(svg.toString('utf8'));assert.notEqual(changed,svg.toString('utf8'));verifyEdgeDriverState(styles.metrics,Buffer.from(changed),pdf);});
  await check('shipped-state/shadowed-dash-setting','pass',()=>verifyEdgeDriverState(styles.metrics,
    Buffer.from(svg.toString('utf8').replace("stroke-dashoffset='1.0'","stroke-dashoffset='2.0'")),pdf));
  await check('driver-reader/unsupported-svg','reject',()=>edgeSvgPaints(Buffer.from(svg.toString().replace('<g ','<foreignObject '))));
  await check('driver-reader/invalid-pdf','reject',()=>edgePdfPaints(Buffer.from('%PDF-1.5\n')));
  const pointCases=[
    ['to-chain',continuation,1,[[0,0],[20,0],[40,10],[60,0]]],
    ['edge-preserves-parent',continuation,3,[[0,20],[40,20]]],
    ['edge-plusplus-first-branch',continuation,7,[[10,70],[30,80]]],
    ['edge-plusplus-second-branch',continuation,8,[[10,70],[50,70]]],
    ['edge-plusplus-parent-base',continuation,9,[[10,70],[15,70]]],
    ['to-plus-preserves-base',continuation,10,[[10,90],[30,90],[15,90]]],
    ['to-plusplus-updates-base',continuation,11,[[10,110],[30,110],[35,110]]],
    ['edge-after-plus-reference',continuation,12,[[10,130],[20,140]]],
    ['to-local-shift-restores-frame',frames,1,[[0,0],[25,0],[40,0]]],
    ['edge-local-shift-both-ends',frames,3,[[5,60],[25,75]]],
    ['edge-relative-target-prescan',frames,5,[[0,90],[20,105]]],
    ['edge-absolute-target-local-basis',frames,7,[[0,120],[40,135]]],
    ['to-relative-target-prescan',frames,9,[[0,150],[20,165],[20,150]]]
  ];
  for(const[name,c,id,expected]of pointCases)await check('native-semantics/'+name,'pass',()=>assert.deepEqual(coordinates(c.metrics.paths[id-1]),expected));
  await check('native-semantics/parent-then-edge-paint-order','pass',()=>assert.deepEqual(continuation.metrics.physicalOrder.paintedPaths.slice(0,6),[1,3,2,6,4,5]));
  await check('native-semantics/to-options-do-not-repaint-parent','pass',()=>{const p=styles.metrics.driverState.paints.find(p=>p.pathId===1);assert.deepEqual(p.strokeRgb,[1,0,0]);assert.equal(p.widthSp,65536);});
  await check('native-semantics/edge-inherits-deferred-dash','pass',()=>assert.deepEqual(styles.metrics.driverState.paints.find(p=>p.pathId===13).dashSp,[196608,131072]));
  await check('native-semantics/edge-inherits-deferred-opacity','pass',()=>assert.equal(styles.metrics.driverState.paints.find(p=>p.pathId===17).strokeOpacity,.6));
  await check('native-semantics/named-coordinate-center','pass',()=>assert.deepEqual(frames.metrics.coordinates[0].center,{xSp:60*65536,ySp:180*65536}));
  await check('native-semantics/label-measurements-and-glyphs','pass',()=>{assert.equal(nodes.metrics.nodes.length,4);assert.ok(nodes.metrics.nodes.every(n=>n.values.width>0&&Object.keys(n.anchors).length===16));
    const dvi=baseline.files.get(edgeReference+'nodes/native-positions.log').toString('utf8');assert.equal([...dvi.matchAll(/\bsetchar\d+ /g)].length,16);assert.match(dvi,/setchar30 /);});
  await check('native-semantics/edge-on-clip-path-inherits-new-clip','pass',()=>assert.deepEqual(clipping.metrics.driverState.paints.find(p=>p.pathId===6).clips,[1]));
  await check('native-semantics/invisible-edge-contributes-bounds','pass',()=>{assert.equal(clipping.metrics.paths[8].paint,null);assert.equal(clipping.metrics.pictureBounds.maxXSp,80*65536);});
  await check('native-semantics/restored-clip-scope','pass',()=>assert.deepEqual(clipping.metrics.driverState.paints.find(p=>p.pathId===17).clips,[]));
  await check('no-converter-or-image-claim','pass',()=>{assert.equal(baseline.converterInvoked,false);assert.equal(baseline.imageConformanceClaim,false);assert.equal(baseline.approvedImagePolicy,false);});
  for(const[file,digest]of Object.entries(toolHashes))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,file)))),digest,'Control source changed during execution.');
  const after=await loadEdgeEvidence();for(const[file,bytes]of baseline.files)assert.ok(after.files.get(file).equals(bytes),'Original evidence changed.');
  await publish(true);console.log('Straight-edge native cache: '+controls.length+' controls passed; 99 path calls; image conformance pending.');
}catch(error){process.exitCode=2;await publish(false,error.message);console.error(error.stack);}
