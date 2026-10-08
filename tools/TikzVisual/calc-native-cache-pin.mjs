// Evidence pins remain separate from image-policy admission.
import {calcTrialPins} from './calc-trial-reference.mjs';
export const calcNativeCacheFile='tests/Reference/CalcCoordinates/native-calibration.bin.gz';
export const calcNativeCacheSha256='f0ea6c23933938519fa8cf7a44cc6949fb0fefc1deca8b718bc1d029e221b3c5';
export const calcNativeCacheDecodedSha256='895a32fa9d127f48fecddd36235fd225a7937e7443dce609684dc785e74e5535';
export const calcNativeCacheProofs={
  primary:{role:'native-calc-primary-calibration',origin:'artifacts/calc-primary-calibration/run-a012efa2-2ec7-495e-ad22-8bd883765cb4/report.json',sha256:calcTrialPins.primaryCalibration},
  primaryRecaptured:{role:'native-calc-primary-calibration',origin:'artifacts/calc-primary-calibration/run-28612274-deb9-4666-bc34-c6ffa05b11ab/report.json',sha256:'358032f713e5fec800e9f3a0a55916392da13c666250b8c972278a11b741ca78'},
  primaryCheck:{role:'independent-native-calc-primary-check',origin:'artifacts/calc-primary-checks/run-40a24e4e-406c-4406-bb5d-61640acd32cb/report.json',sha256:calcTrialPins.primaryCheck},
  primaryControls:{role:'calc-native-primary-corruption-controls',origin:'artifacts/calc-primary-controls/run-48a0b8a5-e380-49d1-b013-9a21d2614c21/report.json',sha256:calcTrialPins.primaryControls},
  pdf:{role:'native-calc-pdf-calibration',origin:'artifacts/calc-pdf-calibration/run-0fbb6fff-e1e0-4700-8d2d-816db9639c86/report.json',sha256:calcTrialPins.pdfCalibration},
  pdfRecaptured:{role:'native-calc-pdf-calibration',origin:'artifacts/calc-pdf-calibration/run-adf9fa1e-4d90-4165-8467-ba2868fc4a16/report.json',sha256:'823d7ac56310fb79d66deb7c7711bd92e5ecdd9530282842737c4d545c62a50f'},
  pdfCheck:{role:'independent-native-calc-pdf-check',origin:'artifacts/calc-pdf-checks/run-32e50871-cf8a-4f78-b398-5a5a9e814f58/report.json',sha256:calcTrialPins.pdfCheck},
  pdfControls:{role:'calc-native-pdf-corruption-controls',origin:'artifacts/calc-pdf-controls/run-ad8747cf-ecc0-4116-99e4-d9c7b344501e/report.json',sha256:calcTrialPins.pdfControls}
};
