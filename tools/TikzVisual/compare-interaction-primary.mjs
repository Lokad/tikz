import path from 'node:path';
import { createRenderer } from './compare.mjs';
import { compareInteractionPrimary } from './interaction-primary.mjs';

if (process.argv.length !== 3) throw new Error('Usage: node compare-interaction-primary.mjs BUNDLE');
const renderer = await createRenderer();
try {
  const report = await compareInteractionPrimary(path.resolve(process.argv[2]), renderer);
  console.log(report.caseId + ': ' + report.verdict + '; ' + report.primary.regionalChecks.length + ' required regional checks; primary only');
  process.exitCode = report.verdict === 'pass' ? 0 : 1;
} finally { await renderer.browser.close(); }
