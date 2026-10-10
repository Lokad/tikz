// Native math PDF ownership; page/crop arithmetic is the existing text-family routine.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {calcEqual} from './calc-saved-images.mjs';
import {sha256} from './shape-oracle-bundle.mjs';
import {edgePdfPage} from './edge-log.mjs';
import {pathLabelPdfFrame} from './path-label-image-reference.mjs';
import {mathFramingFamily} from './math-label-framing.mjs';
export const mathPdfWrapperInputSha256='05c910aee989202da26444e4c8bbe0ed71a28192a2d37a1ec6076fd3d8a668be';
export function mathPdfWrapperHash(ids){
 const family=mathFramingFamily(ids);
 return family.length===1?'70c21514f08464239450311c75881446e1094b9b1e647c377671317f08b13811':mathPdfWrapperInputSha256;
}
export async function readMathPdfInputs(folder,output){
 const inputs={};for(const line of (await readFile(path.join(folder,'case.fls'),'utf8')).split(/\r?\n/).filter(l=>l.startsWith('INPUT '))){
  const file=path.resolve(folder,line.slice(6));if(file.startsWith(output+path.sep))continue;
  const name=path.basename(file),digest=sha256(await readFile(file));if(inputs[name])assert.equal(inputs[name],digest);inputs[name]=digest;
 }
 assert.ok(Object.hasOwn(inputs,'pgfsys-pdftex.def')&&!Object.hasOwn(inputs,'pgfsys-dvisvgm.def'));return inputs;
}
export function verifyMathPdfReplay(bundle,replay){
 const family=mathFramingFamily(bundle.report.cases.map(c=>c.id));
 const expected=family.flatMap(c=>['plain','probed'].map(state=>c.id+'/'+state));
 calcEqual(replay.map(r=>r.caseId+'/'+r.state).sort(),expected.sort(),'Native PDF replay coverage differs.');
 for(const r of replay){
  assert.equal(r.pdfSha256,sha256(bundle.files.get(r.caseId+'/'+r.state+'-reference.pdf')),'Native PDF source replay differs.');
  for(const scale of [1,4])assert.equal(r.rasters[scale],sha256(bundle.files.get(r.caseId+'/'+r.state+'-pdf-page-'+scale+'x.png')),'Native raster source replay differs.');
 }
 return{pdfs:family.length*2,rasters:family.length*4};
}
export function mathPdfWrapper(source){
 const driver='\\def\\pgfsysdriver{pgfsys-dvisvgm.def}',ship='\\hbox{\\box\\labelpicture}';
 assert.equal(source.split(driver).length,2);assert.equal(source.split(ship).length,2);
 const wrapper='\\pdfinfoomitdate=1\n\\pdftrailerid{}\n\\pdfsuppressptexinfo=15\n'+source.replace(driver,'')
  .replace('\\special{lokad-node-origin \\labelnodeid}','')
  .replace('\\begin{document}','\\paperwidth=600pt \\paperheight=800pt\n\\pdfpagewidth=\\paperwidth \\pdfpageheight=\\paperheight\n\\begin{document}')
  .replace(ship,'\\hbox{\\pdfsavepos\\write16{LOKAD-PDF-PAGE \\number\\pdflastxpos|\\number\\pdflastypos|\\number\\pdfpagewidth|\\number\\pdfpageheight|END}\\box\\labelpicture}');
 assert.ok(!wrapper.includes('\\special{')&&!wrapper.includes('pgfsys-dvisvgm.def'));return wrapper;
}
function records(log,kind){
 assert.ok(log.length<=2000000);const flat=log.replace(/\r?\n/g,''),matches=[...flat.matchAll(new RegExp(kind+' ([^]*?)\\|END','g'))];
 assert.equal(matches.length,(flat.match(new RegExp(kind+' ','g'))??[]).length);return matches.map(m=>m[1].split('|'));
}
const integer=text=>{assert.match(text,/^-?\d+$/);const n=Number(text);assert.ok(Number.isSafeInteger(n)&&Math.abs(n)<=1073741823);return n;};
export function mathPdfMeasurements(log,expected){
 assert.ok(log.includes('PATH-LABEL-PGF 3.1.11a'));
 const names=expected.nodes.map(n=>n.name),nodes=records(log,'PATH-LABEL-NODE').filter(r=>names.includes(r[0]));
 const anchors=records(log,'PATH-LABEL-ANCHOR');
 calcEqual(nodes.map(r=>r[0]),names,'PDF native label coverage differs.');
 const measured={
  nodes:nodes.map(r=>{assert.equal(r.length,11);return{name:r[0],anchor:r[1],widthSp:integer(r[2]),heightSp:integer(r[3]),depthSp:integer(r[4]),frame:r.slice(5)};}),
  anchors:anchors.map(r=>{assert.equal(r.length,4);return{name:r[0],anchor:r[1],xSp:integer(r[2]),ySp:integer(r[3])};}),
  pictureBox:records(log,'PATH-LABEL-BOX')
 };
 calcEqual(measured,{nodes:expected.nodes,anchors:expected.anchors,pictureBox:expected.pictureBox},'PDF changes frozen label/anchor/box measurements.');
 const box=Object.fromEntries(['widthSp','heightSp','depthSp'].map((k,i)=>[k,integer(measured.pictureBox[0][i])]));
 const bounds=records(log,'MATH-BOUNDS');assert.equal(bounds.length,1);assert.equal(bounds[0].length,4);
 const pictureBounds=Object.fromEntries(['minXSp','minYSp','maxXSp','maxYSp'].map((k,i)=>[k,integer(bounds[0][i])]));
 const lineWidthsSp=[...new Set(records(log,'MATH-LINEWIDTH').map(r=>{assert.equal(r.length,1);return integer(r[0]);}))].sort((a,b)=>a-b);
 const wrapperExtraWidthSp=box.widthSp-(pictureBounds.maxXSp-pictureBounds.minXSp);
 // Library declarations can leave leading spaces, as in the accepted text
 // observer. The exact frozen box and PGF bounds own this width; no fixed
 // allowance replaces those observations.
 assert.ok(Number.isSafeInteger(wrapperExtraWidthSp)&&wrapperExtraWidthSp>=0&&wrapperExtraWidthSp<=box.widthSp);
 assert.equal(box.heightSp+box.depthSp,pictureBounds.maxYSp-pictureBounds.minYSp);
 return{...measured,pictureBounds,pictureBoxDimensions:box,lineWidthsSp,wrapperExtraWidthSp,page:edgePdfPage(log)};
}
export function mathPdfFontBinding(inputs,frozen){
 const files=Object.fromEntries(Object.entries(inputs).filter(([file])=>/\.(?:tfm|pfb|enc)$/.test(file)));
 for(const [file,digest]of Object.entries(files))if(Object.hasOwn(frozen.nativeFiles,file))assert.equal(digest,frozen.nativeFiles[file],'PDF changes native math font: '+file);
 const required=[...new Set(frozen.fonts.map(f=>f.name+'.tfm'))];
 for(const file of required)assert.equal(files[file],frozen.nativeFiles[file],'Missing native math metric input: '+file);
 const outlines=Object.entries(files).filter(([file])=>file.endsWith('.pfb'));assert.ok(outlines.length>0,'No recorded PDF outlines.');
 for(const [file,digest]of outlines)assert.equal(digest,frozen.nativeFiles[file],'PDF outline lacks frozen math ownership: '+file);
 return{files,requiredMetricFiles:required,outlineFiles:outlines.map(([file])=>file),converterInvoked:false};
}
export function mathNativePdfFrame(bundle,id,frame){
 assert.ok(mathFramingFamily(bundle.report.cases.map(c=>c.id)).some(c=>c.id===id));assert.equal(frame.caseId,id);
 const m=bundle.json(id+'/measurements.json'),files=new Map();
 for(const scale of [1,4])files.set('probed-pdf-page-'+scale+'x.png',bundle.files.get(id+'/probed-pdf-page-'+scale+'x.png'));
 return pathLabelPdfFrame({pdfPage:m.page,metrics:{pictureBounds:m.pictureBounds,pictureBox:m.pictureBoxDimensions,wrapperExtraWidthSp:m.wrapperExtraWidthSp},files},frame);
}
export function validateMathPdfReference(bundle,wrapperInput){
 assert.equal(bundle.report.converterInvoked,false);assert.equal(bundle.report.nativeToolInvoked,true);
 const family=mathFramingFamily(wrapperInput.report.results.map(c=>c.id));
 assert.equal(wrapperInput.sha256,mathPdfWrapperHash(family.map(c=>c.id)));assert.equal(bundle.report.wrapperInputSha256,wrapperInput.sha256);
 calcEqual(bundle.report.cases.map(c=>c.id),family.map(c=>c.id),'Native math PDF fixture coverage differs.');
 for(const c of family){
  const id=c.id,expected=wrapperInput.json(id+'/measurements.json'),supplement=wrapperInput.json(id+'/framing.json');
  const measured=mathPdfMeasurements(bundle.files.get(id+'/probed.log').toString(),expected);
  calcEqual(measured,bundle.json(id+'/measurements.json'),'Native PDF measurements disagree with raw log.');
  calcEqual(measured.pictureBounds,supplement.pictureBounds);calcEqual(measured.lineWidthsSp,supplement.lineWidthsSp);
  calcEqual(measured.page,{...measured.page,widthSp:600*65536,heightSp:800*65536});
  calcEqual(edgePdfPage(bundle.files.get(id+'/plain.log').toString()),measured.page,'Plain/probed PDF page positions differ.');
  for(const state of ['plain','probed']){
   assert.equal(bundle.files.get(id+'/'+state+'/case.tex').toString(),mathPdfWrapper(wrapperInput.files.get(id+'/'+state+'/case.tex').toString()),'PDF wrapper differs from frozen source.');
   assert.equal(sha256(Buffer.from(bundle.files.get(id+'/'+state+'/case.tikz').toString().replaceAll('\r\n','\n'))),expected.sourceSha256);
   calcEqual(mathPdfFontBinding(bundle.json(id+'/'+state+'/native-inputs.json'),wrapperInput.json(id+'/math-font-observations.json')),bundle.json(id+'/font-binding.json'));
  }
  for(const file of ['reference.pdf','pdf-page-1x.png','pdf-page-4x.png'])
   assert.ok(bundle.files.get(id+'/plain-'+file).equals(bundle.files.get(id+'/probed-'+file)),'PDF probe changed '+file);
 }
 const labels=family.reduce((n,c)=>n+c.nodes,0);
 return{cases:family.length,labels,anchors:labels*16,plainProbedPdfPairs:family.length,plainProbedRasterPairs:family.length*2};
}
