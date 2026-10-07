import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {arrowFaintSources,loadArrowFaintInput,arrowFaintLiveRead,buildArrowFaintExperiment,arrowFaintEntry,loadArrowFaintOwned} from './arrow-faint-contract.mjs';
import {arrowFaintFocus,paintArrowFaintFocus,arrowFaintIndex} from './arrow-faint-panels.mjs';
import {runArrowFaintControls} from './arrow-faint-self-test.mjs';
import {createRenderer} from './compare.mjs';
const out=await outputPath(path.join(root,'artifacts/arrow-faint-calibration/run-'+randomUUID()));await mkdir(out,{recursive:true});let phase='arguments',renderer;
async function publish(report){const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(out,'report.json',bytes);console.log(JSON.stringify({kind:'arrow-faint-calibration',completed:report.completed,phase:report.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
try{const args=process.argv.slice(2);let input,read;if(args[0]==='--replay'){assert.equal(args.length,2);input=(await loadArrowFaintOwned(args[1])).input;}else{assert.equal(args.length,2);read=await arrowFaintLiveRead(...args);input=await loadArrowFaintInput(...args,read);}
 phase='native-policy';const sources=await arrowFaintSources(),sourceHashes=Object.fromEntries([...sources].map(([f,s])=>[f,s.sha256])),model=buildArrowFaintExperiment(input),focus=arrowFaintFocus(model,input),artifacts={},save=(f,b)=>{const bytes=Buffer.isBuffer(b)?b:Buffer.from(b);assert.ok(bytes.length<30000000,'Artifact exceeds reader bound: '+f);return writeArtifact(out,f,bytes,artifacts);};
 assert.equal(model.summary.faultOutcomes['visible-fault-accepted'],0,'Prospective policy accepts visible fault');const controls=runArrowFaintControls();
 for(const [f,b]of input.files)await save('input/'+f,b);for(const [f,s]of sources)await save('source-captures/'+f,s.bytes);
 for(const o of model.observations)await save('results/'+o.view.id+'.json',JSON.stringify(o,null,2)+'\n');await save('experiment.json',JSON.stringify(model)+'\n');await save('controls.json',JSON.stringify(controls,null,2)+'\n');await save('focus.json',JSON.stringify(focus,null,2)+'\n');
 phase='focus-panels';renderer=await createRenderer();assert.deepEqual(renderer.identity,input.report.renderer);for(const p of focus){const images=await paintArrowFaintFocus(renderer,p,async f=>input.files.get(f.slice('input/'.length)));for(const [k,b]of Object.entries(images))await save(p.images[k],Buffer.from(b,'base64'));}
 await save('index.html',arrowFaintIndex(model,focus));const manifestBytes=Buffer.from(JSON.stringify({schemaVersion:1,artifacts},null,2)+'\n');await writeArtifact(out,'manifest.json',manifestBytes);const report=arrowFaintEntry(input,sourceHashes,model,focus,{file:'manifest.json',sha256:sha256(manifestBytes),files:Object.keys(artifacts).length});assert.ok(Buffer.byteLength(JSON.stringify(report,null,2))<32000);assert.deepEqual(await arrowFaintSources(),sources);if(read)await loadArrowFaintInput(...args,read);phase='complete';await publish(report);
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});console.error(error.stack);}finally{await renderer?.browser.close();}
