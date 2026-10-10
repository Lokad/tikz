// Hand-derived native-coordinate controls. No converter, renderer or TeX runs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeCanonical} from './curved-edge-log.mjs';
import {edgeSpToCss} from './edge-oracle.mjs';
import {edgeStrokeEnvelope} from './edge-oracle-frame.mjs';
import {curvedBezierPoint,curvedClipBounds,curvedPathBounds,browserBoxLimit} from './curved-edge-frame.mjs';

const output=path.join(root,'artifacts/curved-edge-frame-controls/run-'+randomUUID()),checks=[],artifacts={},sourceHashes={};
function equal(name,actual,expected){assert.deepEqual(actual,expected,name);checks.push({name,passed:true});}
function close(name,actual,expected){assert.ok(Math.abs(actual-expected)<1e-12,name);checks.push({name,passed:true});}
function reject(name,action){assert.throws(action,undefined,name);checks.push({name,passed:true});}
const token=(kind,x=0,y=0)=>({kind,xSp:x*65536,ySp:y*65536});
const arch={kind:'cubic',from:{x:0,y:0},c1:{x:0,y:10},c2:{x:10,y:10},to:{x:10,y:0}};
const move={kind:'move',from:null,to:arch.from};
const nativeArch={segments:[token('move'),token('control1',0,10),token('control2',10,10),token('curve',10,0),token('line'),token('close')]};
try{
  assert.equal(process.argv.length,2);
  for(const file of ['tools/TikzVisual/curved-edge-frame-self-test.mjs','tools/TikzVisual/curved-edge-frame.mjs',
    'tools/TikzVisual/edge-oracle.mjs','tools/TikzVisual/edge-oracle-frame.mjs','tools/TikzVisual/shape-frame-math.mjs']){
    const bytes=edgeCanonical(await readFile(path.join(root,file)));sourceHashes[file]=sha256(bytes);
    await writeArtifact(output,'source-captures/'+file,bytes,artifacts);
  }
  for(const [t,x,y]of [[0,0,0],[.25,1.5625,5.625],[.5,5,7.5],[.75,8.4375,5.625],[1,10,0]])
    equal('hand cubic position '+t,curvedBezierPoint(arch,t),{x,y});
  const backwards={...arch,from:arch.to,c1:arch.c2,c2:arch.c1,to:arch.from};
  equal('reversed cubic quarter',curvedBezierPoint(backwards,.25),{x:8.4375,y:5.625});
  const rotated={...arch,from:{x:0,y:0},c1:{x:-10,y:0},c2:{x:-10,y:10},to:{x:0,y:10}};
  equal('quarter-turn cubic midpoint',curvedBezierPoint(rotated,.5),{x:-7.5,y:5});
  equal('closed cubic geometric extrema',curvedPathBounds([move,arch]),{minX:0,minY:0,maxX:10,maxY:7.5});
  const clip=curvedClipBounds(nativeArch),pt=65536*edgeSpToCss;
  for(const [k,v]of Object.entries({minX:0,minY:-7.5*pt,maxX:10*pt,maxY:0}))close('native clip '+k,clip[k],v);
  const rectangle={segments:[token('rectcorner',2,3),token('rectsize',4,5)]};
  const box=curvedClipBounds(rectangle);
  for(const [k,v]of Object.entries({minX:2*pt,minY:-8*pt,maxX:6*pt,maxY:-3*pt}))close('native rectangle '+k,box[k],v);
  const positioned=[{kind:'move',from:null,to:{x:5,y:7}}];
  equal('move-only retains position',curvedPathBounds(positioned),{minX:5,minY:7,maxX:5,maxY:7});
  equal('move-only round-cap has no ink',edgeStrokeEnvelope(positioned,2,1,0,10).stroke,null);
  equal('cubic pen envelope',edgeStrokeEnvelope([move,arch],2,0,0,10).stroke,{minX:-1,minY:-1,maxX:11,maxY:8.5});
  const triangle=[move,{kind:'line',from:{x:0,y:0},to:{x:2,y:0}},
    {kind:'line',from:{x:2,y:0},to:{x:2,y:2}},{kind:'close',from:{x:2,y:2},to:{x:0,y:0}}];
  const continued={kind:'line',from:{x:0,y:0},to:{x:4,y:0}};
  const postClose=edgeStrokeEnvelope([...triangle,continued],2,2,2,10);
  equal('post-close stroke equals an explicit next subpath',postClose,
    edgeStrokeEnvelope([...triangle,move,continued],2,2,2,10));
  equal('post-close keeps three closed-contour joins',postClose.joins.length,3);
  equal('post-close caps belong only to the new open subpath',postClose.caps.map(c=>c.point),[{x:0,y:0},{x:4,y:0}]);
  equal('post-close square cap reaches the continued endpoint plus radius',postClose.stroke.maxX,5);
  reject('post-close continuation cannot invent a different origin',()=>edgeStrokeEnvelope([...triangle,{...continued,from:{x:1,y:0}}],2,2,2,10));
  equal('small browser-box arithmetic floor',browserBoxLimit([move,arch]),.00004);
  equal('float32 four-ulp budget at 256',browserBoxLimit([{...move,to:{x:256,y:0}}]),1/8192);
  equal('float32 four-ulp budget at 1024',browserBoxLimit([{...move,to:{x:1024,y:0}}]),1/2048);
  for(const [name,path]of [
    ['unclosed contour',{segments:nativeArch.segments.slice(0,-1)}],
    ['new contour before close',{segments:[...nativeArch.segments.slice(0,-1),token('move',20,20)]}],
    ['only move',{segments:[token('move')]}],
    ['missing first control',{segments:[token('move'),token('control2'),token('curve'),token('close')]}],
    ['unknown token',{segments:[token('move'),token('arc'),token('close')]}],
    ['overflow',{segments:[token('move',20000),token('line'),token('close')]}]
  ])reject(name,()=>curvedClipBounds(path));
  reject('empty geometry',()=>curvedPathBounds([]));
  reject('wrong segment kind',()=>curvedBezierPoint({...arch,kind:'line'},.5));
  reject('nonfinite cubic point',()=>curvedBezierPoint({...arch,c1:{x:NaN,y:0}},.5));
  for(const t of [-.1,1.1,NaN,Infinity])reject('invalid sample '+t,()=>curvedBezierPoint(arch,t));
  reject('nonfinite browser operand',()=>browserBoxLimit([{...move,to:{x:Infinity,y:0}}]));
  for(const [file,hash]of Object.entries(sourceHashes))assert.equal(sha256(edgeCanonical(await readFile(path.join(root,file)))),hash);
  const report={schemaVersion:1,completed:true,passed:true,converterInvoked:false,rendererInvoked:false,
    approvedImagePolicy:false,imageConformanceClaim:false,sourceHashes,checks,artifacts};
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(output,'report.json',bytes);
  console.log(JSON.stringify({completed:true,controls:checks.length,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));
}catch(error){process.exitCode=2;await writeArtifact(output,'report.json',JSON.stringify({completed:false,passed:false,
  converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,error:error.message,checks,artifacts},null,2)+'\n');console.error(error.stack);}
