// Explicit live-replay normalization. Preserve original SVG bytes. Only the
// order of uniquely named glyph definitions and dependent metadata may vary.
// Scaled native math faces can share outlines through local use definitions.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function canonicalEdgeSvg(bytes){return bytes.toString('utf8').replace(/<defs>([\s\S]*?)<\/defs>/g,(_,body)=>{
  const definition=/<(?:path|use)\b[^>]*\/>/g,paths=[...body.matchAll(definition)].map(m=>m[0]),id=s=>/\bid='([^']+)'/.exec(s)?.[1];
  assert.equal(body.replace(definition,'').trim(),'');assert.ok(paths.every(id));assert.equal(new Set(paths.map(id)).size,paths.length);
  return'<defs>'+paths.sort((a,b)=>id(a)<id(b)?-1:id(a)>id(b)?1:0).join('')+'</defs>';
});}
export async function verifyEdgeReplay(expected,readExpected,actual,readActual){
  assert.deepEqual(Object.keys(actual.artifacts),Object.keys(expected.artifacts));
  const normalized=structuredClone(actual),reorderedSvgFiles=[];
  for(const file of Object.keys(expected.artifacts)){
    const a=await readActual(file),e=await readExpected(file);assert.equal(hash(a),actual.artifacts[file]);assert.equal(hash(e),expected.artifacts[file]);
    if(file.endsWith('.svg')){assert.equal(canonicalEdgeSvg(a),canonicalEdgeSvg(e),'Live native SVG drawing differs: '+file);
      if(!a.equals(e))reorderedSvgFiles.push(file);normalized.artifacts[file]=expected.artifacts[file];
    }else if(!file.endsWith('/provenance.json'))assert.ok(a.equals(e),'Live native artifact differs: '+file);
  }
  for(let i=0;i<expected.cases.length;i++){
    const id=expected.cases[i].id;assert.equal(actual.cases[i]?.id,id);const file=id+'/provenance.json';
    const e=JSON.parse(await readExpected(file)),a=JSON.parse(await readActual(file));
    assert.equal(e.invariance.svgDrawing,true);assert.equal(a.invariance.svgDrawing,true);
    const prefix=id+'/';for(const svg of Object.keys(e.artifacts).filter(f=>f.startsWith(prefix)&&f.endsWith('.svg')))
      a.artifacts[svg]=e.artifacts[svg];
    const equals=(await readActual(id+'/plain-reference.svg')).equals(await readActual(id+'/probed-reference.svg'));
    assert.equal(a.invariance.svgBytes,equals);assert.equal(actual.cases[i].invariance.svgBytes,equals);
    a.invariance.svgBytes=e.invariance.svgBytes;
    assert.equal(JSON.stringify(a,null,2)+'\n',(await readExpected(file)).toString('utf8'),'Live native provenance differs: '+id);
    normalized.artifacts[file]=expected.artifacts[file];normalized.cases[i].invariance.svgBytes=expected.cases[i].invariance.svgBytes;
  }
  assert.deepEqual(normalized,expected,'Live native snapshot differs beyond glyph-definition order.');
  return{passed:true,artifactCount:Object.keys(expected.artifacts).length,reorderedSvgFiles,
    normalization:'uniquely named glyph-definition order and dependent SVG hash/byte-invariance metadata only'};
}
