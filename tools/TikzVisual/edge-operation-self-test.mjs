import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,writeArtifact} from './shape-oracle-bundle.mjs';
import {edgeOperationTargets,withEdgeDriverFrame,isolateEdgeOperation} from './edge-operation-svg.mjs';
import {createRenderer} from './compare.mjs';
import {installShapeMetrics} from './shape-image-pair.mjs';
import {measureEdgeOraclePair} from './edge-oracle-pair.mjs';

const output=path.join(root,'artifacts/edge-operation-controls/run-'+randomUUID()),checks=[];let renderer;
const passed=name=>checks.push({name,passed:true});
try{
  assert.equal(process.argv.length,2);renderer=await createRenderer();await installShapeMetrics(renderer);
  const original={operations:[{kind:'path',index:0},{kind:'glyph',index:0},{kind:'path',index:1}],uses:[{}]},metrics={driverState:{paints:[{pathId:3},{pathId:1}]}};
  const targets=edgeOperationTargets(metrics,original);assert.deepEqual(targets.map(t=>[t.id,t.ordinal,t.svgId]),[['path-3',0,'oracle-path-0'],['glyph-0',1,'oracle-glyph-0'],['path-1',2,'oracle-path-1']]);passed('physical paint identity differs from construction order');
  assert.throws(()=>edgeOperationTargets({driverState:{paints:[{pathId:1},{pathId:1}]}},original));passed('duplicate native path rejected');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="-8 -8 24 24"><defs><path id="font" d="M0 0H3V3H0Z"/><clipPath id="c"><path d="M-4 -4H8V8H-4Z" transform="scale(1.3283520132835203 -1.3283520132835203)"/></clipPath></defs><g stroke="red" fill="none" clip-path="url(#c)"><path id="oracle-path-0" d="M0 0H4" transform="scale(1.3283520132835203 -1.3283520132835203)"/></g><use id="oracle-glyph-0" href="#font" fill="blue" transform="translate(0 2)"/><path id="oracle-path-1" d="M0 4H4" stroke="green" transform="scale(1.3283520132835203 -1.3283520132835203)"/></svg>';
  for(const target of targets){const a=await isolateEdgeOperation(renderer,svg,target),b=await isolateEdgeOperation(renderer,svg,target,{driver:true});assert.equal(a.svg,b.svg);assert.equal(a.originalDrawingCount,3);assert.equal(a.definitionCount,1);passed('one operation with original definitions '+target.id);}
  for(const target of[{...targets[0],ordinal:99},{...targets[0],kind:'glyph'}]){await assert.rejects(isolateEdgeOperation(renderer,svg,target,{driver:true}));passed('invalid physical target '+target.ordinal+'/'+target.kind);}
  await assert.rejects(isolateEdgeOperation(renderer,svg,{...targets[0],svgId:'missing'}));passed('missing native SVG identity rejected');
  const frame={origin:{x:12.125,y:42.25}},converted=await withEdgeDriverFrame(renderer,svg,frame);assert.equal(converted.numerical.driverCssPerPt,.996264*(4/3));
  assert.ok(converted.numerical.scaleDelta>0&&converted.numerical.scaleDelta<2e-8);passed('declared finite driver scalar');
  const structure=await renderer.page.evaluate(source=>{const s=new DOMParser().parseFromString(source,'image/svg+xml');return{
    view:s.documentElement.getAttribute('viewBox'),font:s.getElementById('font').getAttribute('d'),glyph:s.getElementById('oracle-glyph-0').getAttribute('transform'),
    path:s.getElementById('oracle-path-0').getAttribute('d'),clipChildren:s.getElementById('c').firstElementChild.localName,transforms:[...s.querySelectorAll('g[transform]')].map(e=>e.getAttribute('transform'))};},converted.svg);
  assert.equal(structure.view,'-8 -8 24 24');assert.equal(structure.font,'M0 0H3V3H0Z');assert.equal(structure.glyph,'translate(0 2)');assert.equal(structure.path,'M0 0H4');assert.equal(structure.clipChildren,'path');
  assert.equal(structure.transforms.filter(t=>t.startsWith('matrix(')).length,2);passed('driver frame preserves coordinates, glyphs, root and clip identity');
  const isolated=await isolateEdgeOperation(renderer,converted.svg,targets[0]),base={reference:isolated.svg,actual:isolated.svg,leftIsDriver:false,origin:{x:0,y:0},camera:{x:-8,y:-8,width:24,height:24},
    regions:[{id:'path-3',rectangle:{x:0,y:0,width:24,height:24}}],frame:'expanded',cropLimit:0};
  for(const scale of[1,4])for(const background of['transparent','white','black']){const result=await measureEdgeOraclePair(renderer,{...base,scale,background});
    assert.ok(result.metrics.referenceForegroundPixels>0&&result.metrics.actualForegroundPixels>0,'Clipped control became blank.');
    assert.equal(result.metrics.rawChangedPixels,0);assert.equal(result.repeat.rawChangedPixels,0);assert.equal(result.actualRepeat.rawChangedPixels,0);passed('isolated nonempty driver-frame repeat '+scale+'/'+background);}
  await writeArtifact(output,'report.json',JSON.stringify({schemaVersion:1,completed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,renderer:renderer.identity,checks},null,2)+'\n');
  console.log(checks.length+' native operation isolation controls passed; '+path.relative(root,output));
}catch(error){process.exitCode=2;await writeArtifact(output,'report.json',JSON.stringify({completed:false,error:error.message,checks,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false},null,2)+'\n');console.error(error.stack);}
finally{await renderer?.browser.close();}
