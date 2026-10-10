// Hand-derived arithmetic and renderer controls for the independent native writer.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {root,writeArtifact} from './shape-oracle-bundle.mjs';
import {nativeEdgeSegments,edgeNativeFrame,edgeGlyphMatrix,edgeSpToCss} from './edge-oracle.mjs';
import {edgeStrokeEnvelope} from './edge-oracle-frame.mjs';
import {measureEdgeOraclePair} from './edge-oracle-pair.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {verifyEdgeDriverState} from './edge-driver-state.mjs';

const output=path.join(root,'artifacts/edge-oracle-controls/run-'+randomUUID()),checks=[];let renderer;
function equal(name,actual,expected){assert.deepEqual(actual,expected,name);checks.push({name,passed:true});}
function close(name,actual,expected){assert.ok(Math.abs(actual-expected)<=1e-12,name);checks.push({name,passed:true});}
function reject(name,action){assert.throws(action,undefined,name);checks.push({name,passed:true});}
const move=p=>({kind:'move',from:null,to:p}),line=(from,to)=>({kind:'line',from,to}),a={x:0,y:0},b={x:10,y:0};
const token=(kind,xSp=0,ySp=0)=>({kind,xSp,ySp}),native=segments=>({segments});
try{
  assert.equal(process.argv.length,2);
  // A four-pt pen/dash prints as 3.9851 bp: it recovers the exact integer
  // dimension although its distance from that fraction exceeds .000005.
  const dimensionSvg=Buffer.from("<svg><path d='M0 0L1 0' fill='none' stroke='#000' stroke-width='4' stroke-dasharray='4,1' stroke-dashoffset='1'/></svg>");
  const dimensionMetrics={paths:[{modes:[],paint:{operation:'stroke'}}],physicalOrder:{paintedPaths:[1]}};
  function dimensionPdf(width='3.9851',dash='3.9851',phase='.99628'){
    const stream=deflateSync(Buffer.from(`${width} w 4 M [${dash} .99628] ${phase} d 0 0 m 1 0 l S`));
    return Buffer.concat([Buffer.from(`%PDF-1.5\n1 0 obj << /Type /Page /Contents 2 0 R /Resources 3 0 R >> endobj\n2 0 obj << /Length ${stream.length} /Filter /FlateDecode >> stream\n`),stream,
      Buffer.from('\nendstream endobj\n3 0 obj << /ExtGState 4 0 R >> endobj\n4 0 obj << >> endobj\n')]);
  }
  equal('shortest PDF decimals recover exact pen, dash and phase',verifyEdgeDriverState(dimensionMetrics,dimensionSvg,dimensionPdf()).passed,true);
  reject('one PDF scaled-point pen corruption',()=>verifyEdgeDriverState(dimensionMetrics,dimensionSvg,dimensionPdf('3.98512')));
  reject('one PDF scaled-point dash corruption',()=>verifyEdgeDriverState(dimensionMetrics,dimensionSvg,dimensionPdf('3.9851','3.98512')));
  reject('one PDF scaled-point phase corruption',()=>verifyEdgeDriverState(dimensionMetrics,dimensionSvg,dimensionPdf('3.9851','3.9851','.99629')));
  equal('native rectangle direction',nativeEdgeSegments(native([token('rectcorner',65536,131072),token('rectsize',196608,262144)])).map(s=>[s.kind,s.to.x,s.to.y]),
    [['move',65536,131072],['line',262144,131072],['line',262144,393216],['line',65536,393216],['close',65536,131072]]);
  for(const[name,segments]of[
    ['missing move',[token('line')]],['fractional scaled point',[token('move',.5)]],['scaled-point overflow',[token('move',1073741824)]],
    ['unknown path token',[token('move'),token('arc')]],['missing first control',[token('move'),token('control2')]],
    ['missing curve endpoint',[token('move'),token('control1'),token('control2')]],['control interrupted by line',[token('move'),token('control1'),token('line')]],
    ['unstarted close',[token('close')]]])reject(name,()=>nativeEdgeSegments(native(segments)));
  equal('zero-length line survives',nativeEdgeSegments(native([token('move'),token('line')])).map(s=>s.kind),['move','line']);
  equal('close uses subpath start',nativeEdgeSegments(native([token('move',17,23),token('line',50,60),token('close',999,999)])).at(-1).to,{x:17,y:23});
  equal('butt horizontal pen',edgeStrokeEnvelope([move(a),line(a,b)],2,0,0,10).stroke,{minX:0,minY:-1,maxX:10,maxY:1});
  for(const cap of[1,2])equal('horizontal cap '+cap,edgeStrokeEnvelope([move(a),line(a,b)],2,cap,0,10).stroke,{minX:-1,minY:-1,maxX:11,maxY:1});
  const diagonal=edgeStrokeEnvelope([move(a),line(a,{x:3,y:4})],2,0,0,10).stroke;
  for(const[k,v]of Object.entries({minX:-.8,minY:-.6,maxX:3.8,maxY:4.6}))close('diagonal butt '+k,diagonal[k],v);
  equal('round degenerate dot bounds',edgeStrokeEnvelope([move(a),line(a,a)],2,1,0,10).stroke,{minX:-1,minY:-1,maxX:1,maxY:1});
  equal('butt degenerate has no ink',edgeStrokeEnvelope([move(a),line(a,a)],2,0,0,10).stroke,null);
  const sharp=[move({x:-10,y:0}),line({x:-10,y:0},a),line(a,{x:-10,y:1})];
  const accepted=edgeStrokeEnvelope(sharp,2,0,0,30),limited=edgeStrokeEnvelope(sharp,2,0,0,10);
  equal('one outside miter',accepted.joins[0].tips.length,1);close('hand-derived acute miter x',accepted.joins[0].tips[0].point.x,10+Math.sqrt(101));
  close('hand-derived acute miter y',accepted.joins[0].tips[0].point.y,-1);equal('miter limit falls back to bevel',limited.joins[0].tips.length,0);
  close('inside miter does not enlarge left bound',accepted.stroke.minX,-10-1/Math.sqrt(101));
  for(const[value,cap,join,miter]of[[0,0,0,10],[2,3,0,10],[2,0,3,10],[2,0,0,.5]])reject('invalid native pen '+[value,cap,join,miter],()=>edgeStrokeEnvelope([move(a),line(a,b)],value,cap,join,miter));
  const f=edgeNativeFrame({frame:['1','0','0','1','1.5pt','-2.25pt']});equal('native frame registers',f,{a:1,b:0,c:0,d:1,eSp:98304,fSp:-147456});
  // DVI y increases downwards; the native frame's translation is TeX y-up.
  const matrix=edgeGlyphMatrix(f,{xSp:65536,ySp:32768});close('glyph physical x',matrix[4],2.5*65536*edgeSpToCss);close('glyph physical y',matrix[5],2.75*65536*edgeSpToCss);
  reject('frame physical unit',()=>edgeNativeFrame({frame:['1','0','0','1','1bp','0pt']}));reject('fractional DVI origin',()=>edgeGlyphMatrix(f,{xSp:.1,ySp:0}));
  renderer=await createRenderer();await installShapeMetrics(renderer);
  const wrap=content=>'<svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="-4 -4 16 16">'+content+'</svg>';
  const dot=wrap('<path id="dot" d="M0 0 L0 0" fill="none" stroke="blue" stroke-width="2" stroke-linecap="round"/>'),missing=dot.replace(' L0 0','');
  const base={leftIsDriver:false,origin:{x:0,y:0},camera:{x:-4,y:-4,width:16,height:16},regions:[{id:'dot',rectangle:{x:0,y:0,width:16,height:16}}],frame:'expanded',cropLimit:0};
  for(const scale of[1,4])for(const background of['transparent','white','black']){
    const same=await measureEdgeOraclePair(renderer,{...base,scale,background,reference:dot,actual:dot});equal('unchanged dot '+scale+'/'+background,same.metrics.rawChangedPixels,0);
    equal('reference repeat '+scale+'/'+background,same.repeat.rawChangedPixels,0);equal('actual repeat '+scale+'/'+background,same.actualRepeat.rawChangedPixels,0);
    const removed=await measureEdgeOraclePair(renderer,{...base,scale,background,reference:dot,actual:missing});assert.ok(removed.metrics.rawChangedPixels>0);checks.push({name:'missing round dot visible '+scale+'/'+background,passed:true});
  }
  const butt=await measureEdgeOraclePair(renderer,{...base,scale:1,background:'transparent',reference:dot.replace('round','butt'),actual:missing});equal('butt zero-line and move are image equivalent',butt.metrics.rawChangedPixels,0);
  const clipped=wrap('<defs><clipPath id="c"><path d="M-2 -2 H2 V2 H-2 Z"/></clipPath></defs><g clip-path="url(#c)"><path d="M-4 0 H8" stroke="blue" stroke-width="2"/></g>');
  equal('local clip replay', (await measureEdgeOraclePair(renderer,{...base,scale:1,background:'white',reference:clipped,actual:clipped})).metrics.rawChangedPixels,0);
  for(const[name,source]of[
    ['missing local clip',clipped.replace('url(#c)','url(#missing)')],['wrong clip target',clipped.replace('id="c"','id="p"').replace('url(#c)','url(#p)') .replace('clipPath','g').replace('</clipPath>','</g>')],
    ['duplicate identity',dot.replace('</svg>','<path id="dot" d="M0 0"/></svg>')],['external glyph',wrap('<use href="https://example.invalid/g"/>')],
    ['missing glyph',wrap('<use href="#missing"/>')],['executable attribute',dot.replace('id="dot"','id="dot" onLoad="x()"')],
    ['script',wrap('<script/>')],['foreign element namespace',wrap('<path xmlns="urn:foreign"/>')],['inline style',dot.replace('id="dot"','id="dot" style="opacity:0"')]]){
    await assert.rejects(measureEdgeOraclePair(renderer,{...base,scale:1,background:'white',reference:source,actual:dot}),undefined,name);checks.push({name,passed:true});
  }
  await writeArtifact(output,'report.json',JSON.stringify({schemaVersion:1,completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,renderer:renderer.identity,checks},null,2)+'\n');
  console.log(checks.length+' independent native arithmetic/render controls passed; '+path.relative(root,output));
}catch(e){process.exitCode=2;await writeArtifact(output,'report.json',JSON.stringify({completed:false,error:e.message,checks,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false},null,2)+'\n');console.error(e.stack);}
finally{await renderer?.browser.close();}
