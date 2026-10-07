// Pure presentation controls. No browser, converter, native command or artifact writes.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {arrowAgentPath,arrowAgentInputPath,arrowAgentInputNames} from './arrow-agent-evidence.mjs';
import {arrowAgentSpan,arrowAgentRectangle,arrowAgentPngSize} from './arrow-agent-model.mjs';
import {arrowAgentCaseHtml,arrowAgentEscape} from './arrow-agent-viewer.mjs';
export function runArrowAgentControls(){const controls=[],pass=(name,fn)=>{fn();controls.push({name,passed:true});};
 for(const value of ['../report.json','/report.json','x//y','x/./y','x/../y','C:/x','x\\y','x?y','x#y','x%2fy'])pass('reject path '+value,()=>assert.throws(()=>arrowAgentPath(value)));
 pass('safe path',()=>assert.equal(arrowAgentPath('inputs/prototype/curves-nodes/source.tikz'),'inputs/prototype/curves-nodes/source.tikz'));
 for(let i=0;i<5;i++)pass('wrong input family '+arrowAgentInputNames[i],()=>assert.throws(()=>arrowAgentInputPath('artifacts/arrow-agent-inspection/run-ab/report.json',i)));
 const text='α😀\n\\draw[->] (0,0) -- (1,0);\n',span={offset:11,length:1,line:2,column:8};
 pass('UTF16 source span',()=>assert.equal(arrowAgentSpan(text,span).text,'>'));pass('null native span',()=>assert.equal(arrowAgentSpan(text,null),null));
 for(const key of ['offset','length','line','column'])pass('reject altered span '+key,()=>assert.throws(()=>arrowAgentSpan(text,{...span,[key]:-1})));
 pass('reject stale line',()=>assert.throws(()=>arrowAgentSpan(text,{...span,line:1})));pass('reject stale column',()=>assert.throws(()=>arrowAgentSpan(text,{...span,column:9})));
 const c={regions:{primary:[{id:'r',rectangle:{x:2,y:3,width:4,height:5}}],pdf:[{id:'r',rasterRectangles:{'4x':{x:9,y:13,width:17,height:21}}}]}};
 pass('scale fixed primary rectangle',()=>assert.deepEqual(arrowAgentRectangle(c,{family:'primary',view:{scale:4},size:{width:40,height:40}},'r'),{x:8,y:12,width:16,height:20}));
 pass('use native PDF pixels without fitting',()=>assert.deepEqual(arrowAgentRectangle(c,{family:'pdf',view:{scale:4},size:{width:40,height:40}},'r'),{x:9,y:13,width:17,height:21}));
 pass('reject escaped rectangle',()=>assert.throws(()=>arrowAgentRectangle(c,{family:'primary',view:{scale:4},size:{width:20,height:20}},'r')));
 pass('reject missing region',()=>assert.throws(()=>arrowAgentRectangle(c,{family:'primary',view:{scale:4},size:{width:40,height:40}},'unknown')));
 pass('reject non-PNG',()=>assert.throws(()=>arrowAgentPngSize(Buffer.alloc(24))));
 pass('escape HTML text',()=>assert.equal(arrowAgentEscape('<&"'),'&lt;&amp;&quot;'));
 pass('embedded fixture cannot close script',()=>{const html=arrowAgentCaseHtml({caseId:'control',source:{text:'</script><script>oops</script>'}});assert.ok(html.includes('\\u003c/script>'));assert.ok(!html.includes('><script>oops'));});
 return controls;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify({kind:'arrow-agent-pure-controls',controls:runArrowAgentControls()}));
