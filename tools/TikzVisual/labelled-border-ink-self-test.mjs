import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {parsePath} from './shape-frame-math.mjs';
import {labelledStrokeEnvelope} from './labelled-border-ink.mjs';
import {createRenderer} from './compare.mjs';

const base=path.join(root,'artifacts/labelled-border-ink-math-controls'),output=path.join(base,'run-'+randomUUID()),controls=[];
try{
  assert.equal(process.argv.length,2);
  const cases=[
    {name:'line-circular-pen-envelope',d:'M0 0L10 0',box:[-1,-1,11,1],joins:0},
    {name:'right-angle',d:'M0 0L10 0L10 10',box:[-1,-1,11,11],joins:1},
    {name:'move-breaks-joins',d:'M0 0L10 0M10 0L10 10',box:[-1,-1,11,11],joins:0},
    {name:'acute-miter-limit',d:'M0 0L10 0L0 1',box:[-1,-1,11,2],joins:1,noTips:true},
    {name:'accepted-acute-miter',d:'M0 0L10 0L0 1',miter:30,box:[-Math.sqrt(101),-1,20+Math.sqrt(101),2],joins:1},
    {name:'closing-miters',d:'M0 0L10 0L10 10L0 10Z',box:[-1,-1,11,11],joins:4},
    {name:'rectangle-pen',d:'M0 0L10 0L10 10L0 10Z',polygon:true,box:[-1,-1,11,11],joins:4},
    {name:'rotated-rectangle-miters',d:'M0 0L10 10L0 20L-10 10Z',polygon:true,box:[-10-Math.SQRT2,-Math.SQRT2,10+Math.SQRT2,20+Math.SQRT2],joins:4},
    {name:'cubic-interior-extremum',d:'M0 0C0 12 12 12 12 0',box:[-1,-1,13,10],joins:0},
    {name:'degenerate-cubic-tangent',d:'M0 0C0 0 0 10 10 10L10 0',box:[-1,-1,11,11],joins:1,incoming:{x:1,y:0},outgoing:{x:0,y:-1}},
    {name:'trailing-move-envelope',d:'M0 0L10 0M20 20',box:[-1,-1,21,21],joins:0},
    {name:'empty-closed-subpath',d:'M0 0L10 0M20 20Z',box:[-1,-1,21,21],joins:0},
    {name:'reversal-no-infinite-miter',d:'M0 0L10 0L0 0',box:[-1,-1,11,1],joins:1,noTips:true}
  ];
  for(const c of cases){const result=labelledStrokeEnvelope(parsePath(c.d),2,c.miter??10,c.polygon??false),b=result.stroke;
    for(const[k,i]of [['minX',0],['minY',1],['maxX',2],['maxY',3]])assert.ok(Math.abs(b[k]-c.box[i])<1e-10,c.name+'.'+k);
    assert.equal(result.joins.length,c.joins);if(c.noTips)assert.ok(result.joins.every(j=>j.tips.length===0));if(c.incoming)for(const k of['x','y']){assert.ok(result.joins[0].incoming[k]===c.incoming[k]);assert.ok(result.joins[0].outgoing[k]===c.outgoing[k]);}
    controls.push({name:c.name,passed:true,expected:c.box,actual:b});
  }
  for(const[name,run]of[
    ['negative-width',()=>labelledStrokeEnvelope(parsePath('M0 0L10 0'),-1,10)],['nonfinite-width',()=>labelledStrokeEnvelope(parsePath('M0 0L10 0'),NaN,10)],
    ['invalid-miter-limit',()=>labelledStrokeEnvelope(parsePath('M0 0L10 0'),2,0)],['unpainted-path',()=>labelledStrokeEnvelope(parsePath('M0 0'),2,10)],
    ['nonrectangular-polygon-contract',()=>labelledStrokeEnvelope(parsePath('M0 0L10 0L10 10Z'),2,10,true)]
  ]){assert.throws(run);controls.push({name,passed:true,expected:'reject'});}
  const renderer=await createRenderer();try{
    const rectangles=await renderer.page.evaluate(()=>{const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg');s.setAttribute('width','100');s.setAttribute('height','100');document.body.append(s);
      try{const p=document.createElementNS(ns,'path');p.setAttribute('d','M0 0C0 12 12 12 12 0');s.append(p);const b=p.getBBox();return{x:b.x,y:b.y,width:b.width,height:b.height};}finally{s.remove();}});
    assert.deepEqual(rectangles,{x:0,y:0,width:12,height:9});controls.push({name:'independent-browser-cubic-geometry',passed:true,actual:rectangles});
  }finally{await renderer.browser.close();}
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,completed:true,passed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,controls},null,2)+'\n');
  await writeArtifact(output,'report.json',bytes);await writeArtifact(base,'latest.json',JSON.stringify({completed:true,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)},null,2)+'\n');
  console.log('Independent labeled-border ink math: '+controls.length+' controls passed.');
}catch(error){process.exitCode=2;console.error(error.stack);await writeArtifact(output,'report.json',JSON.stringify({completed:false,passed:false,controls,error:error.message},null,2)+'\n');}
