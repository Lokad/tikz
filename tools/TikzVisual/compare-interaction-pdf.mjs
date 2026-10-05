import path from 'node:path';
import { createRenderer } from './compare.mjs';
import { compareInteractionPdf } from './interaction-pdf.mjs';

if (process.argv.length !== 3) throw new Error('Usage: node compare-interaction-pdf.mjs BUNDLE');
const renderer = await createRenderer();
try {
  const report = await compareInteractionPdf(path.resolve(process.argv[2]), renderer);
  console.log(report.caseId + ': ' + report.verdict + '; ' + report.pdf.candidate.checks.length + ' candidate PDF region/scale checks; all primary/numeric gates required');
  process.exitCode = report.verdict === 'pass' ? 0 : 1;
} catch (error) {
  console.error(error.message); process.exitCode = 2;
} finally { await renderer.browser.close(); }
