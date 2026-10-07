// Read-only assembly of explicit research evidence into a self-contained inspection.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {root,sha256,outputPath,writeArtifact} from './shape-oracle-bundle.mjs';
import {arrowAgentSourceClosure,arrowAgentLiveHandles,loadArrowAgentInputs,loadArrowAgentOwned,arrowAgentReplayHandles} from './arrow-agent-evidence.mjs';
import {buildArrowAgentCases,arrowAgentEntry,validateArrowAgent} from './arrow-agent-model.mjs';
import {arrowAgentCaseHtml,arrowAgentIndex} from './arrow-agent-viewer.mjs';
const out=await outputPath(path.join(root,'artifacts/arrow-agent-inspection/run-'+randomUUID()));await mkdir(out,{recursive:true});let phase='arguments';
async function publish(report){const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeArtifact(out,'report.json',bytes);console.log(JSON.stringify({kind:'arrow-agent-inspection',completed:report.completed,phase:report.phase,report:path.relative(root,path.join(out,'report.json')).split(path.sep).join('/'),sha256:sha256(bytes)}));}
try{
 const args=process.argv.slice(2);let handles;
 if(args[0]==='--replay'){assert.equal(args.length,2);handles=arrowAgentReplayHandles(await loadArrowAgentOwned(args[1]));}else handles=await arrowAgentLiveHandles(args);
 phase='input-integrity';const bundle=await loadArrowAgentInputs(handles),sources=await arrowAgentSourceClosure(),sourceHashes=Object.fromEntries([...sources].map(([f,s])=>[f,s.sha256]));
 phase='projection';const cases=buildArrowAgentCases(bundle),core=arrowAgentEntry(bundle,cases,sourceHashes),artifacts={};
 for(const input of bundle.loaded)for(const [f,b]of input.files)await writeArtifact(out,'inputs/'+input.kind+'/'+f,b,artifacts);
 for(const [f,s]of sources)await writeArtifact(out,'source-captures/'+f,s.bytes,artifacts);
 for(const c of cases){await writeArtifact(out,'cases/'+c.caseId+'.json',Buffer.from(JSON.stringify(c,null,2)+'\n'),artifacts);await writeArtifact(out,'cases/'+c.caseId+'.html',Buffer.from(arrowAgentCaseHtml(c)),artifacts);}
 await writeArtifact(out,'index.html',Buffer.from(arrowAgentIndex(core)),artifacts);
 const manifestBytes=Buffer.from(JSON.stringify({schemaVersion:1,artifacts},null,2)+'\n');await writeArtifact(out,'manifest.json',manifestBytes);
 const entry={...core,manifest:{file:'manifest.json',sha256:sha256(manifestBytes),files:Object.keys(artifacts).length}};validateArrowAgent(entry,cases,entry,artifacts);
 // Check the still-live source and input bindings again before publishing completion.
 assert.deepEqual(await arrowAgentSourceClosure(),sources);await loadArrowAgentInputs(handles);phase='complete';await publish(entry);
}catch(error){process.exitCode=2;await publish({schemaVersion:1,completed:false,phase,error:error.message.replaceAll(root,'<repo>'),converterInvoked:false,approvedImagePolicy:false,imageConformanceClaim:false});console.error(error.stack);}
