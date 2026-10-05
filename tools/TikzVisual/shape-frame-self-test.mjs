import assert from 'node:assert/strict';
import { parsePath,parseTransform,multiply,transformPoint,transformSegments,pathBounds,pathData,closedCurveStrokeBounds,containment } from './shape-frame-math.mjs';

let controls=0;
function equal(actual,expected,tolerance=1e-12){controls++;for(const key of Object.keys(expected))assert.ok(Math.abs(actual[key]-expected[key])<=tolerance,key+': '+actual[key]+' != '+expected[key]);}
function reject(action){controls++;assert.throws(action);}
const cubic=parsePath('M0 0C0 4 4 4 4 0');
equal(pathBounds(cubic),{minX:0,minY:0,maxX:4,maxY:3});
equal(pathBounds(parsePath('M0 0Q2 4 4 0T8 0')),{minX:0,minY:-2,maxX:8,maxY:2});
equal(pathBounds(parsePath('M0 0C0 4 4 4 4 0S8 -4 8 0')),{minX:0,minY:-3,maxX:8,maxY:3});
equal(pathBounds(parsePath('m1 2c0 4 4 4 4 0s4 -4 4 0')),{minX:1,minY:-1,maxX:9,maxY:5});
equal(pathBounds(parsePath('M1 2 3 4 5 6h-2v-3z')),{minX:1,minY:2,maxX:5,maxY:6});
equal(pathBounds(parsePath('M0 0L4 4S8 8 12 4')),{minX:0,minY:0,maxX:12,maxY:52/9});
equal(pathBounds(parsePath('M0 0Q4 4 8 0L10 2T12 2')),{minX:0,minY:0,maxX:12,maxY:2});
equal(pathBounds(parsePath('M0 0C1 1 2 2 3 3')),{minX:0,minY:0,maxX:3,maxY:3});
equal(pathBounds(parsePath('M0 0C1 0 2 0 3 0')),{minX:0,minY:0,maxX:3,maxY:0});
equal(pathBounds(parsePath('M0 0C2 0 -2 0 0 0')),{minX:-1/Math.sqrt(3),minY:0,maxX:1/Math.sqrt(3),maxY:0});
equal(pathBounds(parsePath('M1e-3 -.2e1L.5 +2E1')),{minX:.001,minY:-2,maxX:.5,maxY:20});
equal(pathBounds(parsePath('M0 0L1 1M900 900')),{minX:0,minY:0,maxX:1,maxY:1});
equal(transformPoint(parseTransform('translate(10,20)scale(2)'),{x:3,y:4}),{x:16,y:28});
equal(transformPoint(parseTransform('scale(2)translate(10 20)'),{x:3,y:4}),{x:26,y:48});
equal(transformPoint(multiply([1,0,0,1,5,7],[0,1,-1,0,0,0]),{x:2,y:3}),{x:2,y:9});
equal(pathBounds(transformSegments(cubic,[0,1,-1,0,10,20])),{minX:7,minY:20,maxX:10,maxY:24});
equal(pathBounds(parsePath(pathData(transformSegments(cubic,[1,.2,.4,1,7,11])))),pathBounds(transformSegments(cubic,[1,.2,.4,1,7,11])));
// Transform curves before finding extrema: the shear maximum is not the
// maximum of transformed corners of the original axis-aligned box.
const sheared=pathBounds(transformSegments(cubic,[1,0,1,1,0,0]));
equal(sheared,{minX:0,minY:0,maxX:4*Math.sqrt(2),maxY:3});
const circle=parsePath('M2 0C2 1 1 2 0 2C-1 2 -2 1 -2 0C-2 -1 -1 -2 0 -2C1 -2 2 -1 2 0ZM0 0');
equal(closedCurveStrokeBounds(circle,.5,10).stroke,{minX:-2.25,minY:-2.25,maxX:2.25,maxY:2.25});
equal(closedCurveStrokeBounds(transformSegments(circle,[2,0,0,1,10,20]),1,10).stroke,{minX:5.5,minY:17.5,maxX:14.5,maxY:22.5});
const border={minX:-2.25,minY:-2.25,maxX:2.25,maxY:2.25};
controls++;assert.equal(containment(border,border).passed,true);
controls++;assert.equal(containment(border,{...border,maxX:2.25-1e-7}).passed,false);
controls++;assert.equal(containment(border,{...border,maxX:2.25-1e-7},2e-7).passed,true);
reject(()=>parsePath('L0 0'));reject(()=>parsePath('M0'));reject(()=>parsePath('M0 0C1 2 3'));reject(()=>parsePath('M0 0A1 1 0 0 0 2 2'));
reject(()=>parsePath('M0 0X1 2'));reject(()=>parsePath('M0 0<script>'));reject(()=>parsePath('M0 0L1e999 2'));reject(()=>parsePath('M0 0Z1 2'));
reject(()=>parseTransform('rotate(30)'));reject(()=>parseTransform('matrix(1 0 0 1 0)'));reject(()=>parseTransform('translate(1e999 2)'));
reject(()=>parseTransform('scale(1 2 3)'));reject(()=>parseTransform('matrix(1 0 0 1 0 0);bad'));
reject(()=>closedCurveStrokeBounds(parsePath('M0 0L1 0L1 1L0 1Z'),1,10));
reject(()=>closedCurveStrokeBounds(transformSegments(circle,[0,0,0,0,0,0]),1,10));
reject(()=>closedCurveStrokeBounds(circle,0,10));reject(()=>containment(border,border,-1));
reject(()=>containment({...border,minX:NaN},border));reject(()=>containment(border,{...border,minX:3}));
reject(()=>transformSegments(cubic,[1,0,0,1,Infinity,0]));reject(()=>closedCurveStrokeBounds(circle,1,0));
console.log('Independent shape-frame math: '+controls+' analytic, transform, parser, stroke and containment controls passed.');
