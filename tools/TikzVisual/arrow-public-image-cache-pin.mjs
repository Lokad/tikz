// Historical public qualification; production source changes do not replace it.
export const arrowPublicImageCacheFile='tests/Reference/Arrows/conformance/public-controls.bin.gz';
export const arrowPublicImageCacheSha256='05659cea68976fe17b8586e4cc7507ab6ed5f63e7cb43ade6eaa41fe8ad14735';
export const arrowPublicImageCacheDecodedSha256='da29852043b6520f5bbf7eab4b09a726244bb8e9dddc64404042dbed9719e88d';
export const arrowPublicImageQualification={commit:'bc139bfee3615c47711ba3b5513d3ba86b1dfa96',tree:'573cb97f1718ef988bef50a09ff76e2ee99bc893'};
export const arrowPublicImageManifestSha256='aa5a5cf0259e05e270f23df3bc252ad3c211b07a50a0881b776d73d7e9c9dd8c';
export const arrowPublicImageFreshCheckout='artifacts/arrow-public-pdf-verification/run-a52b7853-8152-4173-a639-a4f9c636d98b/checkout';
export const arrowPublicImageReports={
  producer:{file:'report.json',origin:'artifacts/arrow-public-pdf-controls/run-7a28d6e5-369e-4fef-b062-bddb5d3f14bf/report.json',sha256:'ce6b17230c0e325a0e859804fdd1bade4338898c88cf2200feed2e3c7a2eb343'},
  reader:{file:'proofs/pdf-reader.json',origin:'artifacts/arrow-public-pdf-checks/run-22b1e094-db07-40da-b2d3-e789e780dfa3/report.json',sha256:'e6b20645b91d9e4fe5fefe664cf25f6b600d2ac20a5331ccec024562cbb72ddc'},
  freshReader:{file:'proofs/pdf-fresh-reader.json',origin:'artifacts/arrow-public-pdf-checks/run-5b02223e-7b33-4cf9-b005-1ce269836992/report.json',sha256:'54c9616d50fad99ad6e4f7fb9b0c3fdfe95ad5093b5358ff1b52e2113b53a47c'},
  fresh:{file:'proofs/pdf-fresh.json',origin:'artifacts/arrow-public-pdf-verification/run-a52b7853-8152-4173-a639-a4f9c636d98b/receipt.json',sha256:'2f77d22600b81cc643e267f5cc070d5489766e0f6fecc91e506540e6ec102686'},
  postcommit:{file:'proofs/pdf-postcommit.json',origin:'artifacts/arrow-public-pdf-verification/postcommit-bc139bfee3615c47711ba3b5513d3ba86b1dfa96.json',sha256:'c2676da48d7528c71d6da2ec8d53d136f6df4ba000e4f56ecaa191cbc05423f0'},
  firstMoments:{file:'proofs/first-moments.json',origin:'artifacts/arrow-public-pdf-verification/first-moments-8fa9b22c-ec43-4caf-b9f4-fabdf706de9f/report.json',sha256:'4e6659716dfc42366959840b61eeb9cc156a3c449e415c5b3b736f140fb999d3'},
  firstMomentsHelper:{file:'proofs/precheck-first-moments.mjs',origin:'artifacts/arrow-public-pdf-verification/first-moments-8fa9b22c-ec43-4caf-b9f4-fabdf706de9f/precheck-first-moments.mjs',sha256:'910acb5f465ae4dc17b2e1aeea03257575817103b254c8d41b41c0962670f03e'},
  freshHelper:{file:'proofs/verify.mjs',origin:'artifacts/arrow-public-pdf-verification/run-a52b7853-8152-4173-a639-a4f9c636d98b/verify.mjs',sha256:'ad537aef38168f4e75d8cff33cc215f3fe44d8d3f391c01a31a92ede80a7fc16'},
  auditHelper:{file:'proofs/postcommit.mjs',origin:'artifacts/arrow-public-pdf-verification/audit-f52c408b-4a59-4f3c-a694-591950074055/postcommit.mjs',sha256:'a9decc15478b5024fc941efe08639ad6eb17348504e5c210057d4e4ca901b722'}
};
