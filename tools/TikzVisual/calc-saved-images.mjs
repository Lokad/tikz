// Independent PNG decoding and metric recomputation; producer verdicts are inputs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import path from 'node:path';
import {decodeCalcPng} from './calc-png.mjs';
import {createShapeRasterMetrics} from './shape-raster-metrics.mjs';
export const calcHash=b=>createHash('sha256').update(b).digest('hex');
export function calcEqual(a,b,message){assert.ok(isDeepStrictEqual(a,b),message);}
function safe(file){assert.match(file,/^[a-zA-Z0-9_./-]+$/);assert.ok(!file.split('/').some(p=>!p||p==='.'||p==='..'),'Unsafe artifact path');}
export async function loadCalcSavedReport(file,role){
  const bytes=await readFile(file);assert.ok(bytes.length<=16000000);const report=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  assert.equal(report.schemaVersion,1);assert.equal(report.role,role);assert.equal(report.completed,true);assert.equal(report.phase,'complete');
  assert.equal(report.approvedImagePolicy,false);assert.equal(report.imageConformanceClaim,false);assert.equal(report.imageAdmission,'pending');
  const files=new Map(),entries=Object.entries(report.artifacts);assert.ok(entries.length>0&&entries.length<=4096);
  let size=0;for(const[name,digest]of entries){safe(name);assert.match(digest,/^[a-f0-9]{64}$/);const item=await readFile(path.join(path.dirname(file),name));
    size+=item.length;assert.ok(item.length<=100000000&&size<=1000000000);assert.equal(calcHash(item),digest,'Artifact hash differs: '+name);files.set(name,item);}
  return{file,bytes,sha256:calcHash(bytes),report,files,json:name=>JSON.parse(files.get(name).toString()),png:name=>{assert.ok(files.has(name),'Missing PNG '+name);return decodeCalcPng(files.get(name));}};
}
const compare=createShapeRasterMetrics().compare;
function pair(bundle,images,scale,background){
  const a=bundle.png(images.reference),b=bundle.png(images.actual);assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  return{a,b,options:{width:a.width,height:a.height,scale,background,maskThreshold:16}};
}
function metricsEqual(actual,record,name){calcEqual(actual,Object.fromEntries(Object.keys(actual).map(k=>[k,record[k]])),'Decoded PNG metrics differ: '+name);}
function primaryRecord(bundle,record,name){
  const p=pair(bundle,record.images,record.scale,record.background),metrics=compare(p.a.rgba,p.b.rgba,p.options);
  metricsEqual(metrics,record.metrics,name);assert.equal(record.regions.length,24);assert.equal(new Set(record.regions.map(r=>r.id)).size,24);
  for(const r of record.regions){const rectangle=Object.fromEntries(Object.entries(r.rectangle).map(([k,v])=>[k,v*record.scale]));
    metricsEqual(compare(p.a.rgba,p.b.rgba,{...p.options,rectangle}),r,name+'/'+r.id);}
  return{metrics,regions:record.regions.length};
}
export function verifyCalcPrimaryPixels(bundle){
  const report=bundle.report;assert.equal(report.records.length,24);assert.equal(report.oracleEncodings.length,24);assert.equal(report.controls.length,4);
  const expected=[];for(const capture of['intrinsic-image','explicit-viewport'])for(const frame of['natural','expanded'])for(const scale of[1,4])for(const background of['transparent','white','black'])
    expected.push('views/'+capture+'/'+frame+'/'+scale+'x-'+background+'/record.json');
  calcEqual(report.records.map(r=>r.file).sort(),expected.sort(),'Primary view coverage differs');
  let regions=0,exact=0,maximum=0;
  for(const item of report.records){const record=bundle.json(item.file),result=primaryRecord(bundle,record,item.file);
    calcEqual(result.metrics,item.metrics,'Primary report summary differs');regions+=result.regions;exact+=result.metrics.exactRgbaMatch;maximum=Math.max(maximum,result.metrics.rawChangedPixels);
    assert.equal(record.repeat.rawChangedPixels,0);assert.equal(record.actualRepeat.rawChangedPixels,0);}
  const oracleExpected=[];for(const encoding of['driver-scale-local-origin','exact-physical-scale-local-origin'])for(const frame of['natural','expanded'])for(const scale of[1,4])for(const background of['transparent','white','black'])
    oracleExpected.push('oracle-encodings/'+encoding+'/'+frame+'/'+scale+'x-'+background+'/record.json');
  calcEqual(report.oracleEncodings.map(r=>r.file).sort(),oracleExpected.sort(),'Oracle-only view coverage differs');
  for(const item of report.oracleEncodings){const record=bundle.json(item.file),result=primaryRecord(bundle,record,item.file);calcEqual(result.metrics,item.metrics,'Oracle-only summary differs');regions+=result.regions;}
  const controlIds=[];
  for(const record of report.controls){assert.equal(record.numericChecksBypassed,true);assert.ok(['missing-mark','quarter-pixel-shift'].includes(record.defect));
    assert.ok([1,4].includes(record.scale));controlIds.push(record.defect+'/'+record.scale);
    const result=primaryRecord(bundle,{...record,background:'white'},'control/'+record.defect+'/'+record.scale);assert.ok(result.metrics.rawChangedPixels>0);regions+=result.regions;}
  assert.equal(new Set(controlIds).size,4);
  assert.equal(report.observations.exactPrimaryViews,exact);assert.equal(report.observations.maximumChangedPixels,maximum);
  assert.equal(report.coverage.regionChecks,576);assert.equal(regions,1248);
  return{views:24,oracleOnlyViews:24,imageOnlyControls:4,regionalChecks:regions,exactPrimaryViews:exact,maximumChangedPixels:maximum};
}
function pdfRecord(bundle,record,name){
  const a=bundle.png(record.images.pdf),b=bundle.png(record.images.svg);assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  const options={width:a.width,height:a.height,scale:record.scale,background:'white',maskThreshold:16};
  const whole=compare(a.rgba,b.rgba,options);metricsEqual(whole,record.whole,name+'/whole-page');
  calcEqual(record.fullPage,{exactRgbaMatch:whole.exactRgbaMatch,rawChangedPixels:whole.rawChangedPixels,maxRawChannelError:whole.maxRawChannelError},'PDF full-page summary differs');
  assert.equal(record.regions.length,25);assert.equal(new Set(record.regions.map(r=>r.id)).size,25);
  for(const r of record.regions)metricsEqual(compare(a.rgba,b.rgba,{...options,rectangle:r.rasterRectangles[record.scale+'x']}),r,name+'/'+r.id);
  assert.equal(record.repeat.pdf.rawChangedPixels,0);assert.equal(record.repeat.svg.rawChangedPixels,0);
  return{whole,regions:record.regions.length+1};
}
export function verifyCalcPdfPixels(bundle){
  const report=bundle.report;assert.equal(report.records.length,8);assert.equal(report.controls.length,8);assert.equal(report.routeParity.length,4);
  const expected=[];for(const route of['original-svg','candidate-svg'])for(const frame of['natural','expanded'])for(const scale of[1,4])expected.push('views/'+route+'/'+frame+'/'+scale+'x/record.json');
  calcEqual(report.records.map(r=>r.file).sort(),expected.sort(),'PDF view coverage differs');let regions=0;
  for(const item of report.records){const record=bundle.json(item.file),r=pdfRecord(bundle,record,item.file);metricsEqual(r.whole,item.whole,'PDF report summary');regions+=r.regions;}
  const controlIds=[];
  for(const c of report.controls){assert.equal(c.numericChecksBypassed,true);assert.ok(['missing-mark','outside-diagram-ink'].includes(c.defect));assert.ok(['natural','expanded'].includes(c.frame));assert.ok([1,4].includes(c.scale));
    controlIds.push(c.defect+'/'+c.frame+'/'+c.scale);const record=bundle.json(c.record);pdfRecord(bundle,record,c.record);
    const unchanged=bundle.png('views/candidate-svg/'+c.frame+'/'+c.scale+'x/svg-page.png'),altered=bundle.png(record.images['svg-page']);
    assert.equal(unchanged.width,altered.width);assert.equal(unchanged.height,altered.height);
    const m=compare(unchanged.rgba,altered.rgba,{width:unchanged.width,height:unchanged.height,scale:c.scale,background:'white',maskThreshold:16});
    calcEqual(m,c.observed,'Decoded PDF image-only control differs');assert.equal(m.rawChangedPixels>0,c.expectedVisible);}
  assert.equal(new Set(controlIds).size,8);
  for(const c of report.routeParity){const a=bundle.png('views/original-svg/'+c.frame+'/'+c.scale+'x/svg-page.png'),b=bundle.png('views/candidate-svg/'+c.frame+'/'+c.scale+'x/svg-page.png');
    const m=compare(a.rgba,b.rgba,{width:a.width,height:a.height,scale:c.scale,background:'white',maskThreshold:16});calcEqual(m,c.observed,'Decoded SVG page-route parity differs');}
  assert.equal(regions,208);assert.equal(report.coverage.regionalChecks,208);
  return{views:8,regionalChecks:regions,imageOnlyControls:8,routeParity:4};
}
export function verifyCalcRerender(saved,fresh,aliases={}){
  calcEqual(Object.keys(saved.report.artifacts).sort(),Object.keys(fresh.report.artifacts).sort(),'Rerender artifact coverage differs');
  const report=structuredClone(fresh.report),agent=fresh.json('agent-inspection.json');
  agent.rerun.arguments=agent.rerun.arguments.map(value=>aliases[value]??value);
  const normalizedAgent=Buffer.from(JSON.stringify(agent,null,2)+'\n');report.artifacts['agent-inspection.json']=calcHash(normalizedAgent);
  if(report.inputs)for(const entry of Object.values(report.inputs))entry.file=aliases[entry.file]??entry.file;
  for(const[file,digest]of Object.entries(saved.report.artifacts))assert.equal(digest,report.artifacts[file],'Source/image reconstruction differs: '+file);
  assert.equal(saved.sha256,calcHash(Buffer.from(JSON.stringify(report,null,2)+'\n')),'Rerender report fields differ');
  return{artifacts:saved.files.size,pngs:[...saved.files.keys()].filter(f=>f.endsWith('.png')).length,
    exactImageBytes:true,provenanceOnlyNormalization:['agent rerun input paths','report input paths and resulting agent digest']};
}
