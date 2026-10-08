// Read native logs/page bytes independently of the reference producer's summary.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function one(log,name,count){
  assert.ok(log.length<=2000000);const records=[...log.matchAll(new RegExp('^CALC-'+name+' ([^\\r\\n]+)\\|END$','gm'))];
  assert.equal(records.length,1,'Expected one native '+name);const values=records[0][1].split('|').map(Number);
  assert.equal(values.length,count);assert.ok(values.every(Number.isSafeInteger));return values;
}
export function readCalcLayoutEvidence(files,cache){
  assert.equal(cache.role,'native-calc-coordinate-reference');assert.equal(cache.pgfVersion,'3.1.11a');assert.equal(cache.points.length,25);
  const measurements={};
  for(const route of ['svg','pdf'])for(const observer of ['plain','probed']){
    const key=route+'-'+observer,log=files[key+'/case.log'].toString();
    assert.equal(hash(files[key+'/case.tikz']),cache.sourceSha256);
    const counts={};for(const r of log.matchAll(/^CALC-([A-Z-]+) ([^\r\n]+)$/gm))counts[r[1]]=(counts[r[1]]??0)+1;
    const expected={'PGF-VERSION':1,DRIVER:1,BOUNDS:1,BOX:1};
    if(route==='pdf'){expected['BOX-PAGE']=1;expected['PICTURE-POS']=1;}if(observer==='probed')expected.POINT=25;
    assert.deepEqual(counts,expected,'Native record vocabulary/coverage differs');
    assert.match(log,/^CALC-PGF-VERSION 3\.1\.11a\s*$/m);
    const driver=/^CALC-DRIVER ([^|\r\n]+)\|END$/m.exec(log);
    assert.equal(driver?.[1],route==='svg'?'pgfsys-dvisvgm.def':'pgfsys-pdftex.def');
    const m={boundsSp:one(log,'BOUNDS',4),boxSp:one(log,'BOX',3)};
    if(route==='pdf'){m.boxPageSp=one(log,'BOX-PAGE',4);m.picturePositionSp=one(log,'PICTURE-POS',2);}
    const points=[...log.matchAll(/^CALC-POINT ([a-z-]+)\|(-?\d+)\|(-?\d+)\|END$/gm)].map(r=>({id:r[1],xSp:Number(r[2]),ySp:Number(r[3])}));
    if(observer==='probed'){assert.deepEqual(points,cache.points);m.points=points;}else assert.equal(points.length,0);
    assert.deepEqual(m.boundsSp,cache.pictureBoundsSp);assert.deepEqual(m.boxSp,cache.boxSp);measurements[key]=m;
  }
  assert.equal(hash(files['svg-plain/reference.svg']),cache.observerSvgSha256);
  assert.equal(hash(files['svg-probed/reference.svg']),cache.observerSvgSha256);
  assert.equal(hash(files['pdf-plain/case.pdf']),hash(files['pdf-probed/case.pdf']));
  const m=measurements['pdf-plain'];
  assert.deepEqual(m.boxPageSp,measurements['pdf-probed'].boxPageSp);
  assert.deepEqual(m.picturePositionSp,measurements['pdf-probed'].picturePositionSp);
  const [minX,minY,maxX,maxY]=m.boundsSp,[boxX,boxY,pageW,pageH]=m.boxPageSp,[pictureX,pictureY]=m.picturePositionSp;
  assert.deepEqual([pageW,pageH],[500*65536,600*65536]);assert.equal(pictureY,boxY);assert.equal(m.boxSp[2],0);
  assert.ok(maxX>minX&&maxY>minY);assert.deepEqual([maxX-minX,maxY-minY,0],cache.pictureBoxSp);
  assert.equal(pictureX-boxX,cache.leadingBoxGlueSp);assert.equal(m.boxSp[0],pictureX-boxX+maxX-minX);
  const originSp={x:pictureX-minX,y:pageH-pictureY+minY},factor=96/(72.27*65536),originPixels={x:originSp.x*factor,y:originSp.y*factor};
  assert.ok(originSp.x+minX>=0&&originSp.x+maxX<=pageW&&originSp.y-maxY>=0&&originSp.y-minY<=pageH);
  const rasterSizes={};
  for(const scale of [1,4]){
    const a=files['pdf-plain/page-'+scale+'x.png'],b=files['pdf-probed/page-'+scale+'x.png'];assert.equal(hash(a),hash(b));
    assert.ok(a.length>24);assert.equal(a.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    const size={width:a.readUInt32BE(16),height:a.readUInt32BE(20)};
    assert.deepEqual(size,{width:Math.ceil(pageW*factor*scale),height:Math.ceil(pageH*factor*scale)});assert.ok(size.width*size.height<=20000000);rasterSizes[scale+'x']=size;
  }
  return{measurements,registration:{originSp,originPixels,leadingSp:pictureX-boxX,pictureWidthSp:maxX-minX,pictureHeightSp:maxY-minY,pageWidthSp:pageW,pageHeightSp:pageH},rasterSizes};
}
