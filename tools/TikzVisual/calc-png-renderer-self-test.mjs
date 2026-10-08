// Cross-check all row filters against Chromium's independent PNG implementation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {decodeCalcPng,encodeCalcPng} from './calc-png.mjs';
import {createRenderer} from './compare.mjs';

assert.equal(process.argv.length,2,'Usage: node tools/TikzVisual/calc-png-renderer-self-test.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'artifacts/calc-png-renderer-controls/run-'+randomUUID());
await mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),artifacts={},controls=[];
async function save(file,bytes){
  await mkdir(path.dirname(path.join(output,file)),{recursive:true});
  await writeFile(path.join(output,file),bytes);artifacts[file]=hash(bytes);
}
async function publish(completed,details={}){
  const bytes=Buffer.from(JSON.stringify({schemaVersion:1,role:'calc-png-independent-renderer-controls',completed,
    phase:completed?'complete':'renderer-controls',converterInvoked:false,nativeToolInvoked:false,
    approvedImagePolicy:false,imageConformanceClaim:false,imageAdmission:'pending',artifacts,controls,...details},null,2)+'\n');
  await writeFile(path.join(output,'report.json'),bytes);
  console.log(JSON.stringify({completed,report:path.relative(root,path.join(output,'report.json')).split(path.sep).join('/'),sha256:hash(bytes)}));
}
await publish(false);
let renderer;
try{
  for(const file of ['calc-png.mjs','calc-png-renderer-self-test.mjs','compare.mjs','browser-profile.json'])
    await save('source-captures/'+file,await readFile(path.join(root,'tools/TikzVisual',file)));
  renderer=await createRenderer();
  const rgba=Uint8Array.from({length:7*5*4},(_,i)=>i%4===3?255:(i*37+11)%256),inputs=[];
  for(const channels of [3,4])for(const filter of [0,1,2,3,4]){
    const id=channels+'-channels-filter-'+filter,bytes=encodeCalcPng(7,5,rgba,{channels,filters:[filter]});
    await save(id+'-input.png',bytes);inputs.push({id,url:'data:image/png;base64,'+bytes.toString('base64')});
  }
  const hidden=encodeCalcPng(1,1,Uint8Array.from([19,37,53,0]));
  await save('hidden-rgb-input.png',hidden);inputs.push({id:'hidden-rgb',url:'data:image/png;base64,'+hidden.toString('base64')});
  const results=await renderer.page.evaluate(async items=>{
    const results=[];
    for(const item of items){
      const image=new Image();image.src=item.url;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const context=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});context.drawImage(image,0,0);
      const samples=[...context.getImageData(0,0,canvas.width,canvas.height).data];
      results.push({id:item.id,width:canvas.width,height:canvas.height,samples,png:canvas.toDataURL('image/png').split(',')[1]});
    }
    return results;
  },inputs);
  for(const result of results){
    const bytes=Buffer.from(result.png,'base64'),decoded=decodeCalcPng(bytes);await save(result.id+'-chromium.png',bytes);
    assert.equal(decoded.width,result.width);assert.equal(decoded.height,result.height);
    assert.deepEqual([...decoded.rgba],result.samples,'Independent decoder differs from Chromium samples');
    if(result.id==='hidden-rgb'){
      assert.deepEqual([...decodeCalcPng(hidden).rgba],[19,37,53,0]);assert.deepEqual(result.samples,[0,0,0,0]);
      controls.push({id:result.id,passed:true,rawDecoderPreservesHiddenRgb:true,canvasDiscardsHiddenRgb:true});
    }else{
      assert.equal(result.width,7);assert.equal(result.height,5);assert.deepEqual(result.samples,[...rgba]);
      controls.push({id:result.id,passed:true,independentChromiumDecode:true,independentCanvasEncode:true});
    }
  }
  assert.equal(controls.length,11);
  await save('renderer.json',Buffer.from(JSON.stringify(renderer.identity,null,2)+'\n'));
  for(const[file,digest]of Object.entries(artifacts))assert.equal(hash(await readFile(path.join(output,file))),digest);
  await publish(true,{renderer:renderer.identity});
}catch(error){process.exitCode=1;await publish(false,{error:error.message.slice(0,2000)});console.error(error.stack);}
finally{if(renderer)await renderer.browser.close();}
