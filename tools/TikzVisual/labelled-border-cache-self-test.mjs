// Browser checks of portable evidence and deliberate integrity corruption.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {canonical,verifyLabelledSourceHashes} from './labelled-border-combined-common.mjs';
import {loadLabelledCache,decodeLabelledCache,validateLabelledCache,requireLabelledRenderer,labelledCacheSha256,labelledCacheDecodedSha256} from './labelled-border-cache.mjs';
import {remeasureLabelledCache} from './labelled-border-cache-images.mjs';
import {createRenderer} from './compare.mjs';

const base=path.join(root,'artifacts/labelled-border-cache-controls'),output=path.join(base,'run-'+randomUUID());
const artifacts={},toolHashes={},controls=[];const save=(p,b)=>writeArtifact(output,p,b,artifacts);
async function publish(r){const b=Buffer.from(JSON.stringify(r,null,2)+'\n');await writeArtifact(output,'report.json',b);
  await writeArtifact(base,'latest.json',JSON.stringify({completed:r.completed,
    report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');}
function reject(name,action){let error;try{action();}catch(e){error=e.message;}assert.ok(error,'Accepted cache control: '+name);
  controls.push({name,expected:'reject',passed:true,error});}
try{
  for(const file of ['labelled-border-cache.mjs','labelled-border-cache-images.mjs','labelled-border-cache-self-test.mjs']){
    const p='tools/TikzVisual/'+file,b=canonical(await readFile(path.join(root,p)));toolHashes[p]=sha256(b);await save('tool-sources/'+p,b);
  }
  await publish({completed:false,passed:false,converterInvoked:false,toolHashes,artifacts});assert.equal(process.argv.length,2);
  const e=await loadLabelledCache();Object.assign(toolHashes,e.calibration.toolHashes);
  for(const[p,h]of Object.entries(e.calibration.toolHashes)){const b=canonical(await readFile(path.join(root,p)));assert.equal(sha256(b),h);await save('tool-sources/'+p,b);}
  await save('calibration.json.gz',e.compressed);
  const renderer=await createRenderer();let images;
  try{images=await remeasureLabelledCache(e,renderer,save);}finally{await renderer.browser.close();}
  controls.push({name:'Independent PNG baselines and SVG controls reproduce all original measurements',expected:'pass',passed:true,...images});
  const c=e.calibration;
  const mutate=(name,action)=>reject(name,()=>{const q={...c};action(q);validateLabelledCache(q);});
  for(const [key,value]of Object.entries({schemaVersion:2,comparisonKind:'candidate-calibration',completed:false,
    converterInvoked:true,approvedImagePolicy:true,imageConformanceClaim:true,overallVerdict:'passed',snapshotSha256:'0'.repeat(64)}))
    mutate('role/'+key,q=>q[key]=value);
  mutate('Changed source report pin',q=>q.sourceReports={...c.sourceReports,pdf:{...c.sourceReports.pdf,sha256:'0'.repeat(64)}});
  for(const key of Object.keys(c.reports))mutate('Rehashed changed report cannot become independent: '+key,q=>{
    q.reports={...c.reports,[key]:c.reports[key]+' '};
  });
  mutate('Changed qualification lineage',q=>q.qualification={...c.qualification,source:{...c.qualification.source,sha256:'0'.repeat(64)}});
  mutate('Changed rasterizer',q=>q.qualification={...c.qualification,tools:{pdftocairo:{sha256:'0'.repeat(64)}}});
  mutate('Missing qualified case',q=>q.qualification={...c.qualification,cases:c.qualification.cases.slice(1)});
  mutate('Changed wrapper control',q=>q.qualification={...c.qualification,wrapperControls:[]});
  mutate('Changed cache control',q=>q.qualification={...c.qualification,cacheControls:[]});
  const asset=Object.keys(c.assets)[0],blob=c.assets[asset];
  mutate('Missing required asset',q=>{q.assets={...c.assets};delete q.assets[asset];});
  mutate('Changed asset digest',q=>q.assets={...c.assets,[asset]:'0'.repeat(64)});
  mutate('Extra asset',q=>q.assets={...c.assets,'primary/extra.svg':blob});
  mutate('Missing content blob',q=>{q.blobs={...c.blobs};delete q.blobs[blob];});
  mutate('Altered blob bytes',q=>q.blobs={...c.blobs,[blob]:Buffer.from('wrong').toString('base64')});
  mutate('Rehashed altered blob',q=>{q.assets={...c.assets,[asset]:sha256('wrong')};q.blobs={...c.blobs,[sha256('wrong')]:Buffer.from('wrong').toString('base64')};});
  mutate('Invalid input path',q=>q.inputs={...c.inputs,'../outside':Object.values(c.inputs)[0]});
  mutate('Invalid input encoding',q=>q.inputs={...c.inputs,[Object.keys(c.inputs)[0]]:{...Object.values(c.inputs)[0],encoding:'ambient'}});
  mutate('Changed frozen tool hash',q=>q.toolHashes={...c.toolHashes,[Object.keys(c.toolHashes)[0]]:'0'.repeat(64)});
  const changed=Buffer.from(e.compressed);changed[changed.length-1]^=1;
  reject('Changed compressed cache',()=>decodeLabelledCache(changed));
  reject('Excessive compressed cache',()=>decodeLabelledCache(Buffer.alloc(16000001)));
  for(const k of Object.keys(c.renderer).filter(k=>k!=='osRelease'))reject('Changed renderer: '+k,()=>
    requireLabelledRenderer({...c.renderer,[k]:null},c.renderer));
  requireLabelledRenderer({...c.renderer,osRelease:'different-host-patch'},c.renderer);
  controls.push({name:'OS patch release is provenance; rendering settings remain pinned',expected:'pass',passed:true});
  await verifyLabelledSourceHashes(toolHashes);
  await publish({schemaVersion:1,completed:true,passed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,
    overallVerdict:'pending',cacheSha256:labelledCacheSha256,decodedSha256:labelledCacheDecodedSha256,
    ...images,coverage:{assets:Object.keys(c.assets).length,blobs:Object.keys(c.blobs).length,inputs:Object.keys(c.inputs).length},
    controls,toolHashes,artifacts});console.log('Portable independent cache: '+controls.length+' controls; '+JSON.stringify(images));
}catch(error){process.exitCode=2;console.error(error.stack);await publish({completed:false,passed:false,converterInvoked:false,
  approvedImagePolicy:false,imageConformanceClaim:false,error:error.message.replaceAll(root,'<repo>'),controls,toolHashes,artifacts});}
