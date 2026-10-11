// Fixed-fixture rule evidence. Reuse the bounded geometry/PDF readers; retain
// the original SVG driver defect and independently check the unmodified PDF.
import assert from 'node:assert/strict';
import {arrowSvgVectors,arrowPdfVectors} from './arrow-driver-state.mjs';
import {edgeSvgPaints} from './edge-driver-state.mjs';
import {calcHash} from './calc-saved-images.mjs';

export const fillRuleCase='flowchart-fill-rules';
export const requiresSvgClipRuleCorrection=id=>id===fillRuleCase;
export const clipRuleCorrectionKind='fixed-evenodd-clip-attribute';
export function correctedClipRuleSvg(bytes){
 const source=bytes.toString('utf8'),needle=/<clipPath id='pgfcp1'>(\r?\n)<path d='/g;
 assert.equal([...source.matchAll(needle)].length,1,'Expected the fixed first native clip.');
 return Buffer.from(source.replace(needle,(_,newline)=>"<clipPath id='pgfcp1'>"+newline+"<path clip-rule='evenodd' d='"));
}
export function verifySvgClipRuleCorrection({report,files}){
 if(!requiresSvgClipRuleCorrection(report.definition.id)){assert.equal(report.nativeSvgClipRuleCorrection,undefined);return null;}
 const owned=file=>{const bytes=files.get(file);assert.ok(Buffer.isBuffer(bytes),'Missing clip-rule evidence: '+file);
  assert.equal(calcHash(bytes),report.artifacts[file],'Unowned clip-rule evidence: '+file);return bytes;};
 const evidence=JSON.parse(owned('native-svg-clip-rule-correction.json'));
 assert.deepEqual(evidence,report.nativeSvgClipRuleCorrection);
 assert.deepEqual(evidence,{kind:clipRuleCorrectionKind,changedClipIndices:[0],pdfUnmodified:true});
 const before=owned('original-probed-reference.svg'),after=owned('probed-reference.svg');
 assert.ok(after.equals(correctedClipRuleSvg(before)),'Correction changed more than the reviewed attribute.');
 assert.ok(owned('original-plain-reference.svg').equals(before));assert.ok(owned('plain-reference.svg').equals(after));
 const sv=arrowSvgVectors(before,{allowText:true,trackRules:true}),corrected=arrowSvgVectors(after,{allowText:true,trackRules:true});
 const pdf=arrowPdfVectors(owned('probed-reference.pdf'),{allowText:true,trackRules:true});
 assert.deepEqual(sv.clips.map(c=>c.rule),['nonzero','nonzero']);
 assert.deepEqual(pdf.clips.map(c=>c.rule),['evenodd','nonzero']);
 const wanted=structuredClone(sv);wanted.clips[0].rule='evenodd';assert.deepEqual(corrected,wanted);
 assert.deepEqual(edgeSvgPaints(before,{includeGlyphs:true}),edgeSvgPaints(after,{includeGlyphs:true}),'Clip correction changed paint, glyphs or outlines.');
 assert.equal(corrected.paths.length,pdf.paths.length);
 for(let i=0;i<pdf.paths.length;i++)if(pdf.paths[i].operation!=='stroke')assert.equal(corrected.paths[i].rule,pdf.paths[i].rule,'SVG/PDF fill rule differs: '+i);
 assert.ok(owned('plain-reference.pdf').equals(owned('probed-reference.pdf')));
 return evidence;
}

// These development-only observers delegate unchanged to the native backend.
// Scope-local assignments follow TeX grouping; no drawing command is injected.
export const fillRuleObservationHooks=String.raw`\def\lokadfillrule{nonzero}
\let\lokadoldruletrue\pgfsys@eoruletrue
\def\pgfsys@eoruletrue{\def\lokadfillrule{evenodd}\lokadoldruletrue}
\let\lokadoldrulefalse\pgfsys@eorulefalse
\def\pgfsys@eorulefalse{\def\lokadfillrule{nonzero}\lokadoldrulefalse}
\let\lokadrulestroke\pgfsys@stroke
\def\pgfsys@stroke{\typeout{FILL-RULE \the\arrowinvocation|stroke|\lokadfillrule|END}\lokadrulestroke}
\let\lokadrulefill\pgfsys@fill
\def\pgfsys@fill{\typeout{FILL-RULE \the\arrowinvocation|fill|\lokadfillrule|END}\lokadrulefill}
\let\lokadrulefillstroke\pgfsys@fillstroke
\def\pgfsys@fillstroke{\typeout{FILL-RULE \the\arrowinvocation|fillstroke|\lokadfillrule|END}\lokadrulefillstroke}
\let\lokadruleclip\pgfsys@clipnext
\def\pgfsys@clipnext{\typeout{FILL-RULE \the\arrowinvocation|clip|\lokadfillrule|END}\lokadruleclip}
`;
function observations(log){
 assert.ok(typeof log==='string'&&log.length<=2000000);const result=[];
 for(const line of log.split(/\r?\n/).filter(l=>l.startsWith('FILL-RULE '))){
  const match=/^FILL-RULE ([1-9]\d*)\|(stroke|fill|fillstroke|clip)\|(nonzero|evenodd)\|END$/.exec(line);assert.ok(match,'Malformed PGF rule observation.');
  const pathId=Number(match[1]);assert.ok(Number.isSafeInteger(pathId)&&pathId<=10000&&result.length<1000);
  assert.ok(!result.some(r=>r.pathId===pathId&&r.operation===match[2]),'Duplicate PGF rule observation.');
  result.push({pathId,operation:match[2],rule:match[3]});
 }
 assert.ok(result.length);return result;
}
export function verifyNativeFillRules(metrics,svg,pdf,svgLog,pdfLog){
 const rules=observations(svgLog);assert.deepEqual(rules,observations(pdfLog),'Native PGF rule observations differ.');
 const sv=arrowSvgVectors(svg,{allowText:true,trackRules:true}),pv=arrowPdfVectors(pdf,{allowText:true,trackRules:true});
 const find=(pathId,operation)=>{const found=rules.filter(r=>r.pathId===pathId&&r.operation===operation);assert.equal(found.length,1);return found[0].rule;};
 assert.equal(sv.paths.length,metrics.driverState.paints.length);assert.equal(pv.paths.length,sv.paths.length);let checks=0;
 for(const [i,p]of metrics.driverState.paints.entries()){
  const rule=find(p.pathId,p.operation);p.fillRule=rule;
  if(p.operation!=='stroke'){assert.equal(sv.paths[i].rule,rule,'PGF/SVG fill rule differs: '+i);assert.equal(pv.paths[i].rule,rule,'PGF/PDF fill rule differs: '+i);checks+=2;}
 }
 metrics.driverState.clipRules=metrics.clips.map((pathId,i)=>{
  const rule=find(pathId,'clip');assert.equal(sv.clips[i].rule,rule,'PGF/SVG clip rule differs: '+i);assert.equal(pv.clips[i].rule,rule,'PGF/PDF clip rule differs: '+i);checks+=2;return rule;
 });
 assert.equal(sv.clips.length,metrics.clips.length);assert.equal(pv.clips.length,metrics.clips.length);
 assert.ok(rules.some(r=>r.operation==='fill'&&r.rule==='evenodd'));assert.deepEqual(metrics.driverState.clipRules,['evenodd','nonzero']);
 return{checks,observations:rules,passed:true,scope:'PGF backend rule state versus independently decoded SVG attributes and unmodified PDF f*/B*/W* operators.'};
}
