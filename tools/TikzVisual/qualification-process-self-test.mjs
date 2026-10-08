// Acceptance gap: timeout/output/spawn errors must close and retain partial logs.
import assert from 'node:assert/strict';
import {captureProcess} from './qualification-process.mjs';
const run=(source,options={})=>captureProcess(process.execPath,['-e',source],{timeout:5000,...options});
let r=await run('process.stdout.write("out");process.stderr.write("err")');assert.equal(r.exitCode,0);assert.equal(r.failure,null);assert.ok(r.output.includes('out')&&r.output.includes('err'));
r=await run('process.stdout.write("before failure");process.exit(7)');assert.equal(r.exitCode,7);assert.equal(r.failure,null);assert.equal(r.output,'before failure');
r=await run('process.stdout.write("before timeout");setInterval(()=>{},1000)',{timeout:500});assert.equal(r.failure,'timeout');assert.equal(r.output,'before timeout');
r=await run('process.stdout.write("before overflow");setTimeout(()=>process.stdout.write("x".repeat(10000)),50)',{maxBytes:100});assert.equal(r.failure,'output-bound');assert.equal(r.output,'before overflow');
r=await captureProcess('lokad-no-such-native-tool-5f192d',[],{timeout:1000});assert.equal(r.failure,'ENOENT');assert.equal(r.output,'');
console.log('Shared bounded process controls: 5 passed.');
