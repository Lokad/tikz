// Browser-free, hand-derived picture/ink/placement controls and coverage faults.
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {arrowPdfVectors} from './arrow-driver-state.mjs';
import {loadArrowEvidence} from './arrow-evidence.mjs';
import {buildArrowNativeFrame,reconstructArrowPicture,arrowFiniteHullPoint,arrowWorldMatrix} from './arrow-native-frame.mjs';
import {makeArrowNativeSvg,arrowNativeRepresentations,arrowNativeRoots} from './arrow-native-svg.mjs';
import {nativeEdgeSegments,edgeSpToCss} from './edge-oracle.mjs';
import {transformSegments,unionBounds} from './shape-frame-math.mjs';
import {curvedPathBounds} from './curved-edge-frame.mjs';
import {edgeStrokeEnvelope} from './edge-oracle-frame.mjs';
import {arrowPrimaryPlan,arrowPdfPlan} from './arrow-native-contract.mjs';

let controls=0;const equal=(a,b)=>{assert.deepEqual(a,b);controls++;},close=(a,b)=>{assert.ok(Math.abs(a-b)<=1e-12,`${a} != ${b}`);controls++;};
const rejects=action=>{assert.throws(action);controls++;},f=edgeSpToCss;
// Colored/translucent labels change paint inside a PDF text object while
// path geometry and graphics transforms remain independently checked.
function paintedTextPdf(body){
 const stream=deflateSync(Buffer.from(`1 0 0 1 0 0 cm BT ${body} ET 0 0 m 1 0 l S`));
 return Buffer.concat([Buffer.from(`%PDF-1.5\n1 0 obj << /Type /Page /MediaBox [0 0 4 4] /Contents 2 0 R >> endobj\n2 0 obj << /Length ${stream.length} /Filter /FlateDecode >> stream\n`),stream,Buffer.from('\nendstream endobj\n')]);
}
const textPaint=paintedTextPdf('.3 g .1 .2 .3 rg /pgf@ca0.7 gs /F1 10 Tf 0 0 Td [(a)] TJ');
equal(arrowPdfVectors(textPaint,{allowText:true}).paths.length,1);
equal(arrowPdfVectors(textPaint,{allowText:true}).rootMatrix,[1,0,0,1,0,0]);
rejects(()=>arrowPdfVectors(textPaint));
for(const body of ['1 w','q','1 0 0 1 0 0 cm','BT','0 0 m','(a) Tj'])
 rejects(()=>arrowPdfVectors(paintedTextPdf(body),{allowText:true}));
const input={id:1,modes:'draw,',lineWidthSp:65536,segments:[{kind:'move',xSp:0,ySp:0},{kind:'line',xSp:65536,ySp:0}]};
const paint={ordinal:1,eventId:1,role:'shaft',pathId:1,placementId:null,operation:'stroke',widthSp:65536,cap:0,join:0,miter:10,
 strokeOpacity:1,fillOpacity:1,strokeRgb:[0,0,0],fillRgb:[0,0,0],dashSp:[],phaseSp:0,clips:[]};
const minimal={inputs:[input],paths:[{...structuredClone(input),inputId:1,role:'shaft'}],templates:[],placements:[],clips:[],
 pictureBounds:{minXSp:-32768,minYSp:-32768,maxXSp:98304,maxYSp:32768},
 driverState:{passed:true,paints:[paint],svgRootMatrix:[.996264,0,0,-.996264,0,0]}};
const reference="<svg width='4pt' height='4pt' viewBox='-1 -1 4 4'></svg>",frame=buildArrowNativeFrame('control',reference,minimal);
equal(frame.pictureProof.pictureBounds,minimal.pictureBounds);
for(const [k,v]of Object.entries({minX:0,minY:-32768*f,maxX:65536*f,maxY:32768*f}))close(frame.records[0].bound[k],v);
equal(frame.regions.filter(r=>r.kind==='endpoint').length,2);equal(frame.counts.placements,0);
const short=structuredClone(minimal);short.paths[0].segments[1].xSp=131072;
equal(reconstructArrowPicture(short).pictureBounds,minimal.pictureBounds);close(buildArrowNativeFrame('short',reference,short).ink.maxX,131072*f);
const badPicture=structuredClone(minimal);badPicture.pictureBounds.maxXSp++;rejects(()=>reconstructArrowPicture(badPicture));
const clipped=structuredClone(minimal);clipped.driverState.paints[0].clips=[0];rejects(()=>reconstructArrowPicture(clipped));
const unexpected=structuredClone(minimal);unexpected.inputs.push({...input,id:2});rejects(()=>reconstructArrowPicture(unexpected));
const halfPen=structuredClone(minimal);halfPen.inputs[0].lineWidthSp=65537;equal(reconstructArrowPicture(halfPen).pictureBounds,minimal.pictureBounds);
equal(arrowFiniteHullPoint({matrix:[.5,.5,-.5,.5],xSp:5,ySp:9},{xSp:1,ySp:3}),{x:4,y:10});
equal(arrowFiniteHullPoint({matrix:[0,1,-1,0],xSp:10,ySp:-20},{xSp:4,ySp:9}),{x:1,y:-16});
const cubic=nativeEdgeSegments({segments:[{kind:'move',xSp:0,ySp:0},{kind:'control1',xSp:0,ySp:196608},{kind:'control2',xSp:196608,ySp:196608},{kind:'curve',xSp:196608,ySp:0}]});
const world=transformSegments(cubic,arrowWorldMatrix(null)),bounds=curvedPathBounds(world);
close(bounds.minY,-147456*f);close(bounds.maxY,0);close(bounds.minX,0);close(bounds.maxX,196608*f);
const line=transformSegments(nativeEdgeSegments(input),arrowWorldMatrix(null));
const butt=edgeStrokeEnvelope(line,65536*f,0,0,10).stroke,round=edgeStrokeEnvelope(line,65536*f,1,0,10).stroke,square=edgeStrokeEnvelope(line,65536*f,2,0,10).stroke;
close(butt.minX,0);close(round.minX,-32768*f);equal(round,square);close(square.maxX,98304*f);
const zero=[{kind:'move',from:null,to:{x:3,y:4}},{kind:'line',from:{x:3,y:4},to:{x:3,y:4}}];
equal(edgeStrokeEnvelope(zero,2,0,0,10).stroke,null);equal(edgeStrokeEnvelope(zero,2,1,0,10).stroke,{minX:2,minY:3,maxX:4,maxY:5});
equal(unionBounds([frame.picture,frame.ink]),frame.inkRoot);
for(const variant of arrowNativeRepresentations){const generated=makeArrowNativeSvg(minimal,frame,variant,'ink');
 equal(generated.instructions.paints.length,1);equal(generated.instructions.checks.every(c=>c.passed),true);
 assert.ok(!generated.svg.includes('<marker'));controls++;
}
rejects(()=>makeArrowNativeSvg(minimal,frame,{name:'unapproved',units:'css',places:1},'ink'));
rejects(()=>makeArrowNativeSvg(minimal,frame,arrowNativeRepresentations[0],'candidate'));
const evidence=await loadArrowEvidence(),frames=[];
for(const c of evidence.cases){
 const frame=buildArrowNativeFrame(c.id,evidence.artifacts.get(c.id+'/plain-reference.svg').toString(),c.metrics);frames.push(frame);
 equal(frame.counts.paints,c.counts.paints);equal(frame.counts.placements,c.counts.tips);
 equal(frame.regions.filter(r=>r.kind==='placement').length,c.counts.tips);
 for(const variant of arrowNativeRepresentations)for(const rootMode of arrowNativeRoots){const generated=makeArrowNativeSvg(c.metrics,frame,variant,rootMode);
  equal(generated.instructions.paints.map(p=>p.eventId),c.metrics.driverState.paints.map(p=>p.eventId));
  equal(generated.instructions.paints.map(p=>p.clips),c.metrics.driverState.paints.map(p=>p.clips));
  equal(generated.instructions.checks.every(c=>c.passed),true);
 }
}
equal(frames.reduce((n,f)=>n+f.records.length,0),118);equal(frames.reduce((n,f)=>n+f.regions.length,0),741);
equal(frames.reduce((n,f)=>n+f.counts.curveSamples,0),234);
const ids=evidence.cases.map(c=>c.id);equal(arrowPrimaryPlan(ids).length,576);equal(arrowPdfPlan(ids).length,120);
console.log(JSON.stringify({kind:'arrow-native-frame-controls',passed:true,controls,cases:ids.length,paints:118,regions:741,converterInvoked:false,approvedImagePolicy:false}));
