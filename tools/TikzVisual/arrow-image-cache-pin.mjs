// Explicit native-only cache pins. Public image admission is separate.
export const arrowImageCacheFile = 'tests/Reference/Arrows/conformance/native-source.bin.gz';
export const arrowImageCacheSha256 = '1abe8b37de61baf8339998293ab3bfd5c6ff9ea64bea4cf655fbba8f09775963';
export const arrowImageCacheDecodedSha256 = '9f068d3da8dc5585aaa080bb145c04484ec2b98af7d74f51173e1185c993229c';
export const arrowImageCacheReports = {
  primary: {path: 'artifacts/arrow-source-primary-calibration/run-a96edcb1-8faa-4d1c-a537-a0f6f2976834/report.json', sha256: '7dd59c0017eeee3f9f1c87e762fbc3b20178879a872001963cb7bb20e1892500'},
  primaryCheck: {path: 'artifacts/arrow-source-primary-checks/run-d84fbfff-1bfc-49f2-871d-3da58515e4c7/report.json', sha256: '46668c6b014ba664b3b4db3dd2ce0a82907e0d3a3450c820d391e93e1ed6c692'},
  pdf: {path: 'artifacts/arrow-source-pdf-calibration/run-afb8313c-cd78-4e94-b059-93b92b7c75bb/report.json', sha256: 'cb2ae5e0445c170bcb0e3192f0b069d64044ff9555b410df8680f40122b0abdc'},
  pdfCheck: {path: 'artifacts/arrow-source-pdf-checks/run-401f256d-7689-454b-9204-ebf99fd59207/report.json', sha256: 'a6bf76759cf942c247d30aa40d1a43f9d2627df6b55c5174c61d0347c1dc83ea'}
};
