// Frozen native evidence identities. Public converter admission remains separate.
export const arrowMeetImageCacheFile = 'tests/Reference/Arrows/conformance/native-meet.bin.gz';
export const arrowMeetImageCacheSha256 = '8607951a9f23ae3f2a3142f13302f3520454989dd134bcd15ee5fb2826ef6e0d';
export const arrowMeetImageCacheDecodedSha256 = '1f3d77a5f3720b6077e890723b2689262eb0be4ffd5886fbba32097fb72f7561';
export const arrowMeetQualification = {commit: '828bd195ab9a9e694caa0fa995a02fb1db6197e4', tree: '986c0ef124c93e42ab203e31099cf2efb9899d44'};
export const arrowMeetManifestSha256 = 'eba899dce9f9da84b65f91d92347a3bea110ae1b8b2d717ad46d10ba1c6c59e7';
export const arrowMeetFreshCheckout = 'artifacts/arrow-meet-pdf-verification/run-3c80289f-42b4-40ae-93bd-f1b9b79319b4/checkout';
export const arrowMeetImageCacheReports = {
  primary: {file: 'upstream/primary/report.json', origin: 'artifacts/arrow-meet-source-calibration/run-719f2511-506d-4c10-be0b-f8dea8833267/report.json', sha256: '211105dfba57d9ad59f8bcb94d6840bd74a67c7365fa3280a2e94e3bd96c50c8'},
  primaryCheck: {file: 'upstream/primary-check/report.json', origin: 'artifacts/arrow-meet-source-checks/run-effa389b-b4e5-4213-bbff-9babc9c64992/report.json', sha256: '2c344145818bd5ca640fd9995cbed77cc5e50af01fb80879e02b518887d648ef'},
  pdf: {file: 'report.json', origin: 'artifacts/arrow-meet-pdf-calibration/run-2ca8a508-44e4-43c5-abf1-b6038ae973b9/report.json', sha256: 'cd08de19aaa64c394aae396c1d5faa23057c7e68078d505b3352ff687942ee86'},
  pdfCheck: {file: 'proofs/root-reader.json', origin: 'artifacts/arrow-meet-pdf-checks/run-1e9b2efe-120b-4879-ac99-ea186ba9a2ba/report.json', sha256: '66cdae1b7c7eca538e40479aa9c851450980df7f26bd75a2116b9a3f25abb782'},
  freshPdfCheck: {file: 'proofs/fresh-reader.json', origin: 'artifacts/arrow-meet-pdf-checks/run-56bad31e-b635-4652-8a73-9a9780bcdc38/report.json', sha256: 'a4bca17c0d8e898c97e4d6345c1c1a2868a444ad687460fd2cf388a55fce75f4'},
  freshReplay: {file: 'proofs/fresh-export.json', origin: 'artifacts/arrow-meet-pdf-verification/run-3c80289f-42b4-40ae-93bd-f1b9b79319b4/receipt.json', sha256: '59e768b914767d42489770e6063b27ca23acf403b05cd6d09f8beae3e53c3f46'},
  postcommit: {file: 'proofs/postcommit.json', origin: 'artifacts/arrow-meet-pdf-verification/postcommit-828bd195ab9a9e694caa0fa995a02fb1db6197e4.json', sha256: '79c91dca621c88b41177dbd32b2555783dc67988558c23fb68168d7d2c108708'}
};
