// Exercise real family adapters without launching their reference/image commands.
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {runOwnedEdgeCached as straight,copyEdgeAdmissionChild as copyStraight} from './edge-admission-owned-child.mjs';
import {runOwnedEdgeCached as curved,copyEdgeAdmissionChild as copyCurved} from './curved-edge-admission-owned-child.mjs';
import {runOwnedEdgeImageChild as straightImage} from './edge-image-owned-child.mjs';
import {runOwnedEdgeImageChild as curvedImage} from './curved-edge-image-owned-child.mjs';
import {runOwnedLabelledChild as labelled,copyOwnedLabelledChild as copyLabelled} from './labelled-border-owned-child.mjs';
import {runArrowChild as arrow,copyArrowChild as copyArrow} from './arrow-admission-owned-child.mjs';
import {captureProcess} from './qualification-process.mjs';

export async function verifyFamilyProcessAdapters() {
  const payload=Buffer.from('retained failed child payload'),controls=[];
  const cases=[
    {name:'straight-admission',base:'edge-cached-trial',kind:'edge-cached-trial',cached:true,
      run:save=>straight(save),copy:(child,save)=>copyStraight(child,'saved',save)},
    {name:'curved-admission',base:'curved-edge-cached-trial',kind:'curved-edge-cached-trial',cached:true,
      run:save=>curved(save),copy:(child,save)=>copyCurved(child,'saved',save)},
    {name:'straight-images',base:'edge-public-checks',kind:'edge-public-check',
      run:save=>straightImage('check-edge-trial.mjs',['artifacts/edge-public-trial/run-a/report.json'],save,'command.log')},
    {name:'curved-images',base:'curved-edge-public-checks',kind:'curved-edge-public-check',
      run:save=>curvedImage('check-curved-edge-trial.mjs',['artifacts/curved-edge-public-trial/run-a/report.json'],save,'command.log')},
    {name:'labelled-border',base:'labelled-border-cached-trial',kind:'labelled-border-cached-trial-output',
      run:save=>labelled('trial-labelled-border-cached.mjs',[],save,'command.log'),copy:(child,save)=>copyLabelled(child,'saved',save)},
    {name:'arrow-admission',base:'arrow-current-checks',
      run:save=>arrow('checker','artifacts/arrow-current-trials/run-a/report.json',save),copy:(child,save)=>copyArrow(child,'checker',save)}
  ];
  const originalSpawn=cp.spawn,originalTimer=globalThis.setTimeout;
  try {
    for(const test of cases) {
      for(const complete of [true,false]) {
        const folder=path.join(root,'artifacts',test.base,'run-'+randomUUID());await mkdir(folder,{recursive:true});
        const report={schemaVersion:1,comparisonKind:'independent-public-curved-edge-trial-check',completed:complete,passed:complete,
          converterInvoked:true,approvedImagePolicy:false,imageConformanceClaim:false,combined:{passed:complete},toolHashes:{},
          controls:Array.from({length:19},()=>({passed:true})),primaryMetricsRecomputed:22254,pdfMetricsRecomputed:8994,
          nativeMetricsRecomputed:7418,pagesRecomputed:110,numericChecksVerified:2066,svgsReconstructed:23,
          artifacts:{'payload.bin':sha256(payload)}};
        const bytes=Buffer.from(JSON.stringify(report)+'\n');
        await writeFile(path.join(folder,'report.json'),bytes);await writeFile(path.join(folder,'payload.bin'),payload);
        const marker={kind:test.kind,final:true,completed:complete,passed:complete,
          report:path.relative(root,path.join(folder,'report.json')).replaceAll('\\','/'),sha256:sha256(bytes)};
        const stdout='out-1\nout-2\n'+(test.cached?JSON.stringify({...marker,final:false})+'\n':'')+JSON.stringify(marker)+'\n';
        const stderr='err-1\n{stderr is diagnostic, not a receipt}\n';
        let combined;
        cp.spawn=()=>{
          const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
          queueMicrotask(()=>{
            child.stdout.write('out-1\n');child.stderr.write('err-1\n');
            child.stdout.end(stdout.slice('out-1\n'.length));child.stderr.end(stderr.slice('err-1\n'.length));
            child.emit('exit',complete?0:2);child.emit('close',complete?0:2);
          });
          combined='out-1\nerr-1\n'+stdout.slice('out-1\n'.length)+stderr.slice('err-1\n'.length);
          return child;
        };syncBuiltinESMExports();
        const saved=new Map(),save=async(f,b)=>saved.set(f,Buffer.from(b)),child=await test.run(save);
        assert.equal(child.status,complete?0:2);assert.ok(child.bytes.equals(bytes));
        assert.equal([...saved.values()][0].toString(),combined);
        if(test.copy) {
          await test.copy(child,save);
          const prefix=test.name==='arrow-admission'?'checker':'saved';
          assert.ok(saved.get(prefix+'/report.json').equals(bytes));assert.ok(saved.get(prefix+'/payload.bin').equals(payload));
        } else {
          // Image adapters return the exact failed bundle to their owning trial.
          assert.equal(child.report.artifacts['payload.bin'],sha256(await readFile(path.join(child.folder,'payload.bin'))));
        }
        controls.push(test.name+'/'+(complete?'positive':'failed-evidence'));
      }
      for(const failure of ['timeout','output-bound','ENOENT']) {
        let child,watchdogUsed=false,unreferenced=false;const signals=[],saved=new Map();
        cp.spawn=()=>{
          child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
          child.kill=signal=>{signals.push(signal);return true;};child.unref=()=>{unreferenced=true;};
          queueMicrotask(()=>{
            if(failure==='ENOENT'){child.emit('error',Object.assign(new Error('missing'),{code:'ENOENT'}));child.emit('close',null);return;}
            child.stdout.write('partial before failure\n');
            if(failure==='output-bound')child.stderr.write(Buffer.alloc(2000001,120));
          });return child;
        };syncBuiltinESMExports();
        globalThis.setTimeout=(callback,ms,...args)=>originalTimer(callback,ms>=1800000?30:ms,...args);
        // A separate watchdog makes a regression fail without hanging CI.
        const watchdog=originalTimer(()=>{watchdogUsed=true;child.emit('close',null);},2200);
        try {
          await assert.rejects(test.run(async(f,b)=>saved.set(f,Buffer.from(b))),new RegExp(failure));
          assert.equal(watchdogUsed,false);assert.equal(saved.size,1);
          assert.equal([...saved.values()][0].toString(),failure==='ENOENT'?'':'partial before failure\n');
          if(failure!=='ENOENT'){assert.deepEqual(signals,['SIGTERM','SIGKILL']);assert.equal(unreferenced,true);}
          controls.push(test.name+'/'+failure);
        } finally {clearTimeout(watchdog);globalThis.setTimeout=originalTimer;}
      }
    }
  } finally {cp.spawn=originalSpawn;syncBuiltinESMExports();globalThis.setTimeout=originalTimer;}

  const folder=path.join(root,'artifacts/family-process-controls/run-'+randomUUID());await mkdir(folder,{recursive:true});
  if(process.platform!=='win32') {
    // Substitute only the executable: the actual straight admission adapter
    // still owns capture, timeout/escalation, close and partial-log retention.
    let child,watchdogUsed=false,ready=false;const saved=new Map();
    try {
      cp.spawn=()=>{
        child=originalSpawn(process.execPath,['-e',`process.on('SIGTERM',()=>process.stdout.write('SIGTERM ignored\\n'));process.stdout.write('ready\\n');setTimeout(()=>process.exit(42),4000);`],{stdio:['ignore','pipe','pipe']});
        child.stdout.on('data',b=>{if(b.toString().includes('ready'))ready=true;});return child;
      };syncBuiltinESMExports();
      globalThis.setTimeout=(callback,ms,...args)=>originalTimer(callback,ms>=1800000?500:ms,...args);
      const watchdog=originalTimer(()=>{watchdogUsed=true;child.kill('SIGKILL');},2500);
      try {
        await assert.rejects(straight(async(f,b)=>saved.set(f,String(b))),/timeout/);
        assert.equal(watchdogUsed,false);assert.equal(ready,true);assert.ok(saved.get('cached-command.log').includes('SIGTERM ignored'));
        assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});controls.push('real-adapter/ignored-SIGTERM');
      } finally {clearTimeout(watchdog);}
    } finally {cp.spawn=originalSpawn;syncBuiltinESMExports();globalThis.setTimeout=originalTimer;}

    const identityFile=path.join(folder,'pipe-holder.json');let holder,watchdogUsedPipe=false;
    try {
      cp.spawn=()=>originalSpawn(process.execPath,['-e',`const fs=require('node:fs'),{spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setTimeout(()=>{},4000)'],{stdio:['ignore','inherit','inherit']});fs.writeFileSync(${JSON.stringify(identityFile)},JSON.stringify({pid:c.pid,owner:${process.pid}}));process.stdout.write('inherited pipe\\n');process.exit(0);`],{stdio:['ignore','pipe','pipe']});
      syncBuiltinESMExports();globalThis.setTimeout=(callback,ms,...args)=>originalTimer(callback,ms>=1800000?400:ms,...args);
      const watchdog=originalTimer(()=>{watchdogUsedPipe=true;},2500);
      try {
        await assert.rejects(straight(async(f,b)=>assert.equal(String(b),'inherited pipe\n')),/timeout/);
        assert.equal(watchdogUsedPipe,false);controls.push('real-adapter/inherited-pipe');
      } finally {clearTimeout(watchdog);}
    } finally {
      cp.spawn=originalSpawn;syncBuiltinESMExports();globalThis.setTimeout=originalTimer;
      holder=JSON.parse(await readFile(identityFile,'utf8'));assert.equal(holder.owner,process.pid);
      try{process.kill(holder.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
    }
  } else {
    // The arrow adapter's existing Windows process-tree cleanup now belongs to
    // shared capture. Verify that a descendant holding inherited pipes also dies.
    const identityFile=path.join(folder,'tree.json');
    const script=`const fs=require('node:fs'),{spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setTimeout(()=>{},4000)'],{stdio:['ignore','inherit','inherit']});fs.writeFileSync(${JSON.stringify(identityFile)},JSON.stringify({parent:process.pid,child:c.pid}));process.stdout.write('tree ready\\n');setTimeout(()=>{},4000);`;
    try {
      const result=await captureProcess(process.execPath,['-e',script],{timeout:700,killTree:true});
      assert.equal(result.failure,'timeout');assert.equal(result.terminationFailure,null);assert.ok(result.stdout.includes('tree ready'));
      const identity=JSON.parse(await readFile(identityFile,'utf8'));
      for(const pid of Object.values(identity))assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
      controls.push('Windows/descendant-tree-cleanup');
    } finally {
      const identity=JSON.parse(await readFile(identityFile,'utf8'));
      for(const pid of Object.values(identity))try{process.kill(pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
    }
  }
  await writeFile(path.join(folder,'report.json'),JSON.stringify({completed:true,referenceInvoked:false,platform:process.platform,controls},null,2)+'\n');
  console.log('Shared family process controls: six adapters, stdout receipts, ordered logs, failed evidence, timeout/output/spawn failure and platform termination passed.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await verifyFamilyProcessAdapters();
