// Explicit reference admission; ordinary comparisons never write these files.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {root,sha256} from './shape-oracle-bundle.mjs';
import {createRenderer} from './compare.mjs';
import {curvedCalibrationFile,curvedProfileFile,curvedGuardFiles,curvedCanonical,
  decodeCurvedCalibration,readCurvedInputs,validateCurvedCalibration,curvedProfile} from './curved-node-admission-policy.mjs';

assert.equal(process.argv.length,2);
const prepared=path.join(root,'artifacts/curved-node-prepared/run-c29cfd64-f295-4264-af84-f7becc7eab20');
const decoded=decodeCurvedCalibration(await readFile(path.join(prepared,'calibration.json.gz'))),c=decoded.calibration;
const read=filename=>filename.startsWith(path.join(root,'tests/Reference/NodeShapes/conformance')+path.sep)
  ?readFile(path.join(prepared,path.basename(filename))):readFile(filename);
const buffers=await readCurvedInputs(c,read),renderer=await createRenderer();
try{
  await validateCurvedCalibration(c,renderer,buffers,path.join(root,'artifacts/curved-node-promotion/run-'+randomUUID()));
  const guards={};for(const p of curvedGuardFiles(c))guards[p]=sha256(curvedCanonical(await readFile(path.join(root,p))));
  const files={[curvedCalibrationFile]:decoded.compressed,[curvedProfileFile]:Buffer.from(JSON.stringify(curvedProfile(c,guards),null,2)+'\n')};
  for(const file of Object.values(c.frozen))files[file]=buffers[file];
  for(const[file,bytes]of Object.entries(files)){
    const destination=path.join(root,file);await mkdir(path.dirname(destination),{recursive:true});
    await writeFile(destination,bytes);
  }
  console.log('Admitted independent native-unit curved-node calibration; original SVG/PDF files and prior limits preserved.');
}finally{await renderer.browser.close();}
