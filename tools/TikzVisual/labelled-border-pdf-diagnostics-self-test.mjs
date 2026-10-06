import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,writeArtifact} from './shape-oracle-bundle.mjs';
import {loadLabelledBorderEvidence} from './labelled-border-evidence.mjs';
import {parseLabelledPdf} from './labelled-border-pdf-vector.mjs';
import {labelledPdfDiagnosticKinds,labelledPdfSelection,labelledPdfDiagnosticContent,verifyLabelledPdfDiagnosticContent,writeLabelledPdfDiagnostic,readLabelledPdfDiagnostic} from './labelled-border-pdf-diagnostics.mjs';

const base=path.join(root,'artifacts/labelled-border-pdf-diagnostic-controls'),output=path.join(base,'run-'+randomUUID()),artifacts={},controls=[],toolHashes={};
const save=(p,b)=>writeArtifact(output,p,b,artifacts);
const sources=['labelled-border-pdf-diagnostics-self-test.mjs','labelled-border-pdf-diagnostics.mjs','labelled-border-pdf-vector.mjs','labelled-border-evidence.mjs','shape-oracle-bundle.mjs','dash-pdf-vector.mjs'].map(p=>'tools/TikzVisual/'+p);
function reject(name,action){let error;try{action();}catch(e){error=e.message;}assert.ok(error,'Accepted control: '+name);controls.push({name,expected:'reject',passed:true,error});}
try{
  for(const file of sources){const b=Buffer.from((await readFile(path.join(root,file),'utf8')).replaceAll('\r\n','\n'));toolHashes[file]=sha256(b);await save('tool-sources/'+file,b);}
  assert.equal(process.argv.length,2);const evidence=await loadLabelledBorderEvidence();let documents=0,paths=0,glyphs=0;
  for(const c of evidence.cases){const id=c.fixture.id,bytes=evidence.files.get('tests/Reference/LabelledBorders/'+id+'/plain-reference.pdf'),original=parseLabelledPdf(bytes);paths+=original.paths.length;glyphs+=original.glyphs.length;
    for(const kind of labelledPdfDiagnosticKinds(id)){
      const d=labelledPdfDiagnosticContent(original,kind),pdf=writeLabelledPdfDiagnostic(bytes,d.content),read=readLabelledPdfDiagnostic(bytes,pdf);assert.equal(read.content,d.content);assert.equal(d.verified.passed,true);documents++;
      if(!kind.startsWith('isolated-glyph-')){const p=parseLabelledPdf(pdf);assert.deepEqual(p.fonts,original.fonts);assert.deepEqual(p.mediaBox,original.mediaBox);}
      await save(id+'/'+kind+'.pdf',pdf);await save(id+'/'+kind+'.json',JSON.stringify({...d,content:undefined,preservedObjects:read.preservedObjects},null,2)+'\n');controls.push({name:id+'/'+kind,expected:'preserved-operands-and-resources',passed:true});
      const shifted=d.content.replace(/1 0 0 1 [\d.]+ [\d.]+ cm/,'1 0 0 1 1 2 cm');assert.notEqual(shifted,d.content);reject(id+'/'+kind+'/origin',()=>verifyLabelledPdfDiagnosticContent(original,shifted,d.selection));
      const altered=Buffer.from(pdf.toString('latin1').replace('LMRoman','XXRoman'),'latin1');assert.ok(!altered.equals(pdf));reject(id+'/'+kind+'/resource',()=>readLabelledPdfDiagnostic(bytes,altered));
    }
    const isolated=labelledPdfDiagnosticContent(original,'isolated-glyph-0');
    reject(id+'/invisible-glyph-selection',()=>verifyLabelledPdfDiagnosticContent(original,isolated.content,{paths:[],glyphs:[1]}));
    reject(id+'/unsupported-render-mode',()=>verifyLabelledPdfDiagnosticContent(original,isolated.content.replace('0 Tr','1 Tr'),isolated.selection));
    reject(id+'/render-mode-outside-text',()=>verifyLabelledPdfDiagnosticContent(original,'0 Tr\n'+isolated.content,isolated.selection));
    reject(id+'/unrestored-render-mode',()=>verifyLabelledPdfDiagnosticContent(original,isolated.content.replaceAll('0 Tr\nET','3 Tr\nET'),isolated.selection));
    reject(id+'/missing-original-object',()=>readLabelledPdfDiagnostic(bytes,bytes.subarray(0,100)));
    reject(id+'/wrapper-version',()=>writeLabelledPdfDiagnostic(Buffer.from(bytes.toString('latin1').replace('%PDF-1.5','%PDF-1.4'),'latin1'),original.content));
    reject(id+'/nonascii',()=>writeLabelledPdfDiagnostic(bytes,'é'));
    reject(id+'/content-budget',()=>writeLabelledPdfDiagnostic(bytes,' '.repeat(1000001)));
    reject(id+'/empty-content',()=>writeLabelledPdfDiagnostic(bytes,''));
    reject(id+'/unknown-kind',()=>labelledPdfSelection(original,'fitted'));
    reject(id+'/unknown-glyph',()=>labelledPdfSelection(original,'isolated-glyph-40'));
    reject(id+'/unknown-path',()=>labelledPdfSelection(original,'isolated-path-26'));
  }
  assert.deepEqual([documents,paths,glyphs],[12,26,40]);
  for(const [file,h]of Object.entries(toolHashes))assert.equal(sha256(Buffer.from((await readFile(path.join(root,file),'utf8')).replaceAll('\r\n','\n'))),h,file);
  const b=Buffer.from(JSON.stringify({schemaVersion:1,completed:true,passed:true,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,snapshotSha256:evidence.snapshotSha256,documents,paths,glyphs,controls,toolHashes,artifacts},null,2)+'\n');await writeArtifact(output,'report.json',b);await writeArtifact(base,'latest.json',JSON.stringify({completed:true,report:path.relative(base,path.join(output,'report.json')).split(path.sep).join('/'),sha256:sha256(b)},null,2)+'\n');console.log('Labeled-border PDF diagnostics: '+controls.length+' controls and '+documents+' preserved-resource documents.');
}catch(error){process.exitCode=2;await save('report.json',JSON.stringify({completed:false,passed:false,converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false,controls,error:error.message,toolHashes,artifacts},null,2)+'\n');console.error(error.stack);}
