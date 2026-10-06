// Frozen independent native evidence; no converter, browser or native process.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,sha256} from './shape-oracle-bundle.mjs';

export const labelledBorderSnapshotSha256='840f35602947c94b50e7e458eba7e20e1af8d3fa35d2b4907b3ce607536977e5';
export const labelledBorderManifestSha256='96e6363974b36324a8c44a039a10ccdf7574150052013c913147db0e47ec812b';
const reference='tests/Reference/LabelledBorders/',manifestFile=reference+'cases.json';
const canonical=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
const ids=['lines','paths','transforms'];
const caseFiles=['svg-plain.log','plain-reference.svg','svg-probed.log','probed-reference.svg','native-positions.log',
  'pdf-plain.log','plain-reference.pdf','plain-pdf-page-1x.png','plain-pdf-page-4x.png','plain-pdf-info.txt','plain-pdf-fonts.txt',
  'pdf-probed.log','probed-reference.pdf','probed-pdf-page-1x.png','probed-pdf-page-4x.png','probed-pdf-info.txt','probed-pdf-fonts.txt',
  'metrics.json','probes.tex','pdf-wrapper.tex','provenance.json'];
const fonts=['ec-lmr10','ec-lmbx10','ec-lmri10','ec-lmr12','ec-lmbx12','ec-lmri12'].map(n=>'fonts/'+n+'.tfm');

export async function loadLabelledBorderEvidence(read=relative=>readFile(path.join(root,relative))){
  const files=new Map();let bytes=0;
  async function get(relative){
    assert.ok(!path.isAbsolute(relative)&&!relative.includes('\\')&&!relative.split('/').includes('..'),'Invalid evidence path.');
    if(!files.has(relative)){
      const b=await read(relative);assert.ok(Buffer.isBuffer(b)&&b.length>0&&b.length<=5000000,'Invalid evidence byte count: '+relative);
      bytes+=b.length;assert.ok(bytes<=32000000,'Evidence bundle exceeds byte bound.');files.set(relative,b);
    }
    return files.get(relative);
  }
  const snapshotBytes=await get(reference+'snapshot.json');assert.equal(sha256(snapshotBytes),labelledBorderSnapshotSha256,'Frozen native snapshot changed.');
  const manifestBytes=await get(manifestFile);assert.equal(sha256(canonical(manifestBytes)),labelledBorderManifestSha256,'Frozen fixture manifest changed.');
  const snapshot=JSON.parse(snapshotBytes),manifest=JSON.parse(manifestBytes);
  assert.equal(snapshot.schemaVersion,1);assert.equal(manifest.schemaVersion,1);assert.equal(snapshot.profile,manifest.profile);
  assert.equal(snapshot.converterInvoked,false);assert.equal(snapshot.approvedImagePolicy,false);assert.equal(snapshot.imageConformanceClaim,false);
  assert.deepEqual(manifest.cases.map(c=>c.id),ids);assert.deepEqual(snapshot.cases.map(c=>c.id),ids);
  assert.deepEqual(manifest.libraries,['shapes.geometric']);assert.equal(manifest.anchors.length,16);
  assert.deepEqual(Object.keys(snapshot.artifacts).sort(),[...fonts,...ids.flatMap(id=>caseFiles.map(f=>id+'/'+f))].sort());
  for(const[file,digest]of Object.entries(snapshot.artifacts))assert.equal(sha256(await get(reference+file)),digest,'Changed native artifact: '+file);
  const cases=[];
  for(const c of manifest.cases){
    const p=JSON.parse(await get(reference+c.id+'/provenance.json')),m=JSON.parse(await get(reference+c.id+'/metrics.json'));
    const record=snapshot.cases.find(q=>q.id===c.id);assert.equal(p.schemaVersion,1);assert.equal(p.profile,manifest.profile);assert.equal(p.caseId,c.id);assert.equal(p.converterInvoked,false);
    assert.deepEqual(p.sourceHashes,record.sourceHashes);assert.equal(record.nativeMetricsSha256,snapshot.artifacts[c.id+'/metrics.json']);
    assert.deepEqual(p.artifacts,Object.fromEntries(Object.entries(snapshot.artifacts).filter(([f])=>f.startsWith(c.id+'/')&&!f.endsWith('/provenance.json'))));
    for(const[file,digest]of Object.entries(p.sourceHashes))assert.equal(sha256(canonical(await get(file))),digest,'Changed reference input: '+file);
    assert.deepEqual(p.invariance,record.invariance);assert.ok(Object.entries(p.invariance).filter(([k])=>k!=='svgByteIdentical').every(([,v])=>v===true));
    for(const extension of['pdf',...(p.invariance.svgByteIdentical?['svg']:[])])assert.equal(sha256(await get(reference+c.id+'/plain-reference.'+extension)),sha256(await get(reference+c.id+'/probed-reference.'+extension)));
    assert.equal(m.converterInvoked,false);assert.equal(m.approvedImagePolicy,false);assert.equal(m.profile,manifest.profile);
    assert.deepEqual(m.nodes.map(n=>({id:n.id,shape:n.shape})),c.nodes);assert.equal(record.nodes,m.nodes.length);assert.equal(record.paths,m.paths.length);
    assert.equal(m.nodes.length,4);assert.equal(m.paths.length,m.nodes.length+c.drawingPaths);
    assert.deepEqual(m.paths.map(p=>p.index),Array.from({length:m.paths.length},(_,i)=>i+1));
    assert.deepEqual(m.paths.filter(p=>p.owner!=='drawing').map(p=>p.owner),c.nodes.map(n=>'node-'+n.id));
    assert.equal(m.paths.filter(p=>p.owner==='drawing').length,c.drawingPaths);
    for(const node of m.nodes){assert.deepEqual(Object.keys(node.anchors),manifest.anchors);assert.equal(node.values.linewidth,26214);}
    const b=m.pictureBounds,box=m.pictureBox,page=m.pdfCamera.page,spToCss=96/(72.27*65536);
    assert.equal(box.widthSp,b.maxXSp-b.minXSp);assert.equal(box.heightSp+box.depthSp,b.maxYSp-b.minYSp);
    assert.equal(page.widthSp,600*65536);assert.equal(page.heightSp,800*65536);
    assert.deepEqual(m.pdfCamera.origin,{x:(page.boxXSp-b.minXSp)*spToCss,y:(page.heightSp-page.boxBaselineYSp+b.minYSp+box.depthSp)*spToCss});
    for(const scale of[1,4]){
      const png=await get(reference+c.id+'/plain-pdf-page-'+scale+'x.png');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.subarray(12,16).toString(),'IHDR');
      const size={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};assert.deepEqual(size,m.pdfCamera.rasterSizes[scale+'x']);
      assert.deepEqual(size,{width:Math.ceil(600*96/72.27*scale),height:Math.ceil(800*96/72.27*scale)});
      assert.equal(sha256(png),sha256(await get(reference+c.id+'/probed-pdf-page-'+scale+'x.png')));
    }
    cases.push({fixture:c,metrics:m,provenance:p});
  }
  return{snapshot,manifest,cases,files,byteCount:bytes,snapshotSha256:labelledBorderSnapshotSha256,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false};
}
