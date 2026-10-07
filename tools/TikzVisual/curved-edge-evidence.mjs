// Immutable cached native evidence. No converter, browser, TeX or subprocess.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {edgeProfile,edgeIds,curvedInputFiles as edgeInputFiles,edgeManifest,edgeCanonical,validateEdgeManifest,
  parseCurvedEdgeLog as parseEdgeLog,edgeBox,edgePdfPage,edgePhysicalOrder} from './curved-edge-log.mjs';
import {verifyEdgeDriverState} from './curved-edge-driver-state.mjs';
import {canonicalEdgeSvg as svgDrawing} from './edge-replay.mjs';

export const edgeSnapshotSha256='5d5730145e1a848d6f22c964d901be3c151bba3ebf5336c258144ec14076e0b1';
export const edgeReference='tests/Reference/CurvedEdges/';
export const edgeCaseFiles=['svg-plain.log','plain-reference.svg','svg-probed.log','probed-reference.svg','native-positions.log',
  'pdf-plain.log','plain-reference.pdf','plain-pdf-page-1x.png','plain-pdf-page-4x.png','plain-pdf-info.txt','plain-pdf-fonts.txt',
  'pdf-probed.log','probed-reference.pdf','probed-pdf-page-1x.png','probed-pdf-page-4x.png','probed-pdf-info.txt','probed-pdf-fonts.txt',
  'metrics.json','probes.tex','svg-wrapper.tex','pdf-wrapper.tex','provenance.json'];
const fontFiles=['ec-lmr10','ec-lmbx10','ec-lmri10','ec-lmr12','ec-lmbx12','ec-lmri12'].map(n=>'fonts/'+n+'.tfm');
const hashPattern=/^[a-f0-9]{64}$/;
const roles=value=>{assert.equal(value.converterInvoked,false);assert.equal(value.approvedImagePolicy,false);assert.equal(value.imageConformanceClaim,false);};
function pngSize(bytes){assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.subarray(12,16).toString(),'IHDR');
  return{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};}

export async function loadEdgeEvidence(read=relative=>readFile(path.join(root,relative))){
  const files=new Map(),metrics=[],cases=[];let byteCount=0;
  async function get(relative){
    assert.ok(!path.isAbsolute(relative)&&!relative.includes('\\')&&!relative.split('/').includes('..'));
    if(!files.has(relative)){const bytes=await read(relative);assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=5000000);
      byteCount+=bytes.length;assert.ok(byteCount<=50000000);files.set(relative,bytes);}
    return files.get(relative);
  }
  const snapshotBytes=await get(edgeReference+'snapshot.json');
  assert.equal(sha256(snapshotBytes),edgeSnapshotSha256,'Frozen native curved-edge snapshot changed.');
  const snapshot=JSON.parse(snapshotBytes),manifest=JSON.parse(await get(edgeManifest));validateEdgeManifest(manifest);
  assert.equal(snapshot.schemaVersion,1);assert.equal(snapshot.profile,edgeProfile);roles(snapshot);
  assert.deepEqual(snapshot.cases.map(c=>c.id),edgeIds);
  assert.deepEqual(Object.keys(snapshot.sourceHashes).sort(),[...edgeInputFiles,...manifest.cases.map(c=>c.source)].sort());
  for(const[file,digest]of Object.entries(snapshot.sourceHashes)){
    assert.match(digest,hashPattern);assert.equal(sha256(edgeCanonical(await get(file))),digest,'Changed curved-edge reference source: '+file);
  }
  assert.deepEqual(Object.keys(snapshot.artifacts).sort(),[...fontFiles,...edgeIds.flatMap(id=>edgeCaseFiles.map(f=>id+'/'+f))].sort());
  for(const[file,digest]of Object.entries(snapshot.artifacts)){
    assert.match(digest,hashPattern);assert.equal(sha256(await get(edgeReference+file)),digest,'Changed curved-edge reference artifact: '+file);
  }
  const fontProfile=JSON.parse(await get('tools/TikzFontData/font-profile.json'));
  for(const file of fontFiles){const input=fontProfile.inputs.find(f=>f.name===file.slice(6));assert.ok(input);
    assert.equal(snapshot.artifacts[file],input.sha256);}
  const nativeProfile=JSON.parse(await get('tests/Reference/NodeShapes/oracle-profile.json'));
  const pdfProfile=JSON.parse(await get('tests/Reference/NodeShapes/pdf-oracle-profile.json'));
  const toolVersions={latex:nativeProfile.latexVersion,dvisvgm:nativeProfile.dvisvgmVersion,dvitype:nativeProfile.dviTypeVersion,kpsewhich:nativeProfile.kpseVersion,
    pdflatex:pdfProfile.pdfLatexVersion,pdftoppm:pdfProfile.pdfRasterizerVersion,pdfinfo:pdfProfile.pdfInfoVersion,pdffonts:pdfProfile.pdfFontsVersion};
  for(const fixture of manifest.cases){
    const prefix=edgeReference+fixture.id+'/',getCase=f=>get(prefix+f),text=async f=>(await getCase(f)).toString('utf8');
    const provenance=JSON.parse(await getCase('provenance.json')),stored=JSON.parse(await getCase('metrics.json'));
    const record=snapshot.cases.find(c=>c.id===fixture.id);roles(provenance);roles(stored);
    assert.equal(provenance.schemaVersion,1);assert.equal(provenance.profile,edgeProfile);assert.equal(provenance.caseId,fixture.id);
    assert.deepEqual(provenance.sourceHashes,snapshot.sourceHashes);
    assert.equal(record.nativeMetricsSha256,snapshot.artifacts[fixture.id+'/metrics.json']);
    assert.deepEqual(provenance.artifacts,Object.fromEntries(Object.entries(snapshot.artifacts)
      .filter(([f])=>f.startsWith(fixture.id+'/')&&!f.endsWith('/provenance.json'))));
    assert.deepEqual(Object.keys(provenance.tools),Object.keys(toolVersions));
    for(const[name,version]of Object.entries(toolVersions)){
      // MiKTeX's DVItype prints the upstream format version on its first line;
      // the producer checks the separate wrapper build version in full output.
      const firstLine=name==='dvitype'?'This is DVItype, Version 3.6 (MiKTeX 25.4)':version;
      const tool=provenance.tools[name];assert.equal(tool.name,name);assert.ok(tool.version.includes(firstLine));assert.match(tool.sha256,hashPattern);
    }
    assert.ok(Object.keys(provenance.inputs).length>20);
    for(const[file,digest]of Object.entries(provenance.inputs)){assert.match(file,/^(?:tex|font)\/[^/\\:]+$/);assert.match(digest,hashPattern);}
    const svgLog=await text('svg-probed.log'),pdfLog=await text('pdf-probed.log'),positions=await text('native-positions.log');
    const measured=parseEdgeLog(svgLog,fixture);assert.deepEqual(measured,parseEdgeLog(pdfLog,fixture));
    const order=edgePhysicalOrder(measured,svgLog,positions);assert.deepEqual(order,edgePhysicalOrder(measured,pdfLog,null,true));
    assert.match(positions,/totalpages=1(?:\s|$)/);
    assert.deepEqual([...positions.matchAll(/lokad-node-origin ([a-z0-9-]+)/g)].map(m=>m[1]),fixture.nodes.map(n=>n.id));
    assert.equal(record.nodes,measured.nodes.length);assert.equal(record.coordinates,measured.coordinates.length);
    assert.equal(record.pathCalls,measured.paths.length);assert.equal(record.paintedPaths,order.paintedPaths.length);
    const probes=[...fixture.nodes.flatMap(n=>manifest.anchors.map(a=>'\\lokadanchor{'+n.id+'}{'+a+'}')),
      ...(fixture.coordinates??[]).map(id=>'\\lokadanchor{'+id+'}{center}')].join('\n')+'\n';
    assert.equal(await text('probes.tex'),probes);
    assert.ok((await text('svg-wrapper.tex')).includes('\\selectcolormodel{rgb}'));
    assert.ok((await text('pdf-wrapper.tex')).includes('\\selectcolormodel{rgb}'));
    assert.ok(!(await text('pdf-wrapper.tex')).includes('pgfsys-dvisvgm'));
    assert.deepEqual(edgeBox(svgLog),edgeBox(await text('svg-plain.log')));assert.deepEqual(edgeBox(pdfLog),edgeBox(await text('pdf-plain.log')));
    const plainSvg=await getCase('plain-reference.svg'),probedSvg=await getCase('probed-reference.svg');
    assert.equal(svgDrawing(plainSvg),svgDrawing(probedSvg));
    const plainPdf=await getCase('plain-reference.pdf'),probedPdf=await getCase('probed-reference.pdf');assert.ok(plainPdf.equals(probedPdf));
    const page=edgePdfPage(pdfLog);assert.deepEqual(page,edgePdfPage(await text('pdf-plain.log')));
    assert.equal(page.widthSp,600*65536);assert.equal(page.heightSp,800*65536);
    const bounds=measured.pictureBounds,box=measured.pictureBox,spToCss=96/(72.27*65536);
    const camera={origin:{x:(page.boxXSp-bounds.minXSp)*spToCss,y:(page.heightSp-page.boxBaselineYSp+bounds.minYSp+box.depthSp)*spToCss},page,rasterSizes:{}};
    for(const scale of[1,4]){
      const plain=await getCase('plain-pdf-page-'+scale+'x.png'),probed=await getCase('probed-pdf-page-'+scale+'x.png');assert.ok(plain.equals(probed));
      const size=pngSize(plain);assert.deepEqual(size,{width:Math.ceil(600*96/72.27*scale),height:Math.ceil(800*96/72.27*scale)});camera.rasterSizes[scale+'x']=size;
    }
    for(const state of['plain','probed']){assert.match(await text(state+'-pdf-info.txt'),/^Pages:\s+1\s*$/m);
      const fonts=await text(state+'-pdf-fonts.txt');if(fixture.nodes.length)for(const face of['Regular','Italic'])assert.ok(fonts.includes('LMRoman10-'+face));}
    const driverState=verifyEdgeDriverState({...measured,physicalOrder:order},plainSvg,plainPdf);
    const complete={...measured,physicalOrder:order,driverState,pdfCamera:camera};assert.deepEqual(stored,complete,'Stored native records differ from original evidence.');
    const invariance={svgDrawing:true,svgBytes:plainSvg.equals(probedSvg),pictureBox:true,pdfBytes:true,pdfPixels:true,pdfPagePosition:true,
      nativeSvgPdfState:true,physicalPathOrder:true,shippedDriverState:true};
    assert.deepEqual(provenance.invariance,invariance);assert.deepEqual(record.invariance,invariance);
    metrics.push(complete);cases.push({fixture,metrics:complete,provenance});
  }
  return{snapshot,manifest,metrics,cases,files,byteCount,snapshotSha256:edgeSnapshotSha256,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false};
}
