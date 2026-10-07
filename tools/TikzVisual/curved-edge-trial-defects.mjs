import {edgePrimaryDefects, mutateEdgePrimary} from './curved-edge-primary-defects.mjs';
export const edgeTrialDefects = edgePrimaryDefects;
// The same bounded path mutations operate on public element identities.
export async function mutateEdgeTrial(renderer, svg, metrics, defect) {
  const renamed = svg.replaceAll('candidate-p', 'oracle-path-').replaceAll('candidate-g', 'oracle-glyph-').replaceAll('candidate-c', 'oracle-clip-');
  const result = await mutateEdgePrimary(renderer, renamed, {uses: Array(10)}, metrics, defect);
  return result.replaceAll('oracle-path-', 'candidate-p').replaceAll('oracle-glyph-', 'candidate-g').replaceAll('oracle-clip-', 'candidate-c');
}
