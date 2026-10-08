// Independent comparison of cached driver path dimensions and exported graphics.
// Inputs are native path data and public-trace coordinates, never candidate SVG.
import assert from 'node:assert/strict';
import {parsePath} from './shape-frame-math.mjs';

export function checkCalcNativePaths(nativePaths, scene) {
  assert.equal(nativePaths.length,24); assert.equal(scene.paths.length,24);
  assert.equal(scene.clips.length,0);
  const checks=[];
  function equal(name,reference,actual,units='value') {
    const passed=reference===actual;
    checks.push({name,reference,actual,units,limit:0,passed});
    assert.ok(passed, 'Native calc path differs: '+name+'; '+reference+' / '+actual);
  }
  function point(name,native,actual) {
    for(const axis of ['x','y']) equal(name+'.'+axis, Math.round(native[axis]*65536),
      Math.round(actual[axis]*(axis==='y'?-1:1)*72.27*65536/96),'TeX sp');
  }
  nativePaths.forEach((data,index)=>{
    const segments=parsePath(data),actual=scene.paths[index],prefix='paint-'+index;
    equal(prefix+'.segments',segments.length,actual.segments.length,'count');
    segments.forEach((segment,i)=>{
      const measured=actual.segments[i],name=prefix+'.segment-'+i;
      equal(name+'.kind',segment.kind,measured.kind.toLowerCase());
      if(segment.kind!=='close') point(name+'.end',segment.to,measured.end);
      if(segment.kind==='cubic') {point(name+'.c1',segment.c1,measured.control1);point(name+'.c2',segment.c2,measured.control2);}
    });
    // This fixed native fixture has 0.4 pt black, opaque, unfilled strokes.
    // All paths share the driver group state; no clips or path transforms occur.
    equal(prefix+'.stroke',true,actual.paint.stroke);
    equal(prefix+'.fill',false,actual.paint.fill);
    equal(prefix+'.color','#000000',actual.paint.strokeColor);
    equal(prefix+'.width',Math.round(.4*65536),Math.round(actual.paint.strokeWidthPixels*72.27*65536/96),'TeX sp');
    equal(prefix+'.opacity',1,actual.paint.strokeOpacity);
    equal(prefix+'.cap','butt',actual.paint.cap);
    equal(prefix+'.join','miter',actual.paint.join);
    equal(prefix+'.dashes',0,actual.paint.dashPixels.length,'count');
    equal(prefix+'.clips',0,actual.clips.length,'count');
  });
  return {schemaVersion:1,role:'native-driver-path-vs-public-trace',passed:true,paths:24,checks};
}
