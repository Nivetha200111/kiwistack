#!/usr/bin/env node
// Evidence gate for a kiwi-team run folder. A run is not done until this passes.
// Usage: node check-run.mjs <runDir>   (exit 0 = pass, 1 = fail; prints each problem)
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = {
  'goal.md': [],
  'recon.md': ['## Facts', '## Counts'],
  'domain.md': ['## Definitions'],
  'decisions.md': [],
  'build.md': ['## Built'],
  'qa.md': ['## Counts', '## States', '## Findings'],
  'security.md': ['## Verdict'],
  'review.md': [],
};
// Text that should never reach a user-facing artifact.
const SLOP = [/\bTODO\b/, /\bTBD\b/, /lorem ipsum/i, /\bplaceholder\b/i, /\bFIXME\b/, /<insert[^>]*>/i, /\bXXX\b/];
// A table name or sys_id in a user-facing label is a design failure.
const RAW_IN_LABEL = /\b([a-z][a-z0-9]*_[a-z0-9_]+|[0-9a-f]{32})\b/;

export function checkRun(dir) {
  const problems = [];
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null);
  if (!existsSync(dir)) return [`Run folder ${dir} does not exist.`];

  for (const [file, sections] of Object.entries(REQUIRED)) {
    const text = read(file);
    if (text === null) { problems.push(`Missing ${file}.`); continue; }
    if (!text.trim()) problems.push(`${file} is empty.`);
    for (const s of sections) if (!text.includes(s)) problems.push(`${file} has no "${s}" section.`);
  }
  if (!read('spec.json') && !read('design.md')) problems.push('Missing spec.json or design.md: nothing records what was designed.');

  const files = readdirSync(dir);
  if (!files.some((f) => /\.(png|jpe?g)$/i.test(f))) problems.push('No screenshot in the run folder: the page was never shown to have rendered.');

  const qa = read('qa.md') || '';
  const countsBlock = (qa.split('## Counts')[1] || '').split('\n## ')[0];
  const rows = countsBlock.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l));
  if (rows.length < 2) problems.push('qa.md "## Counts" has no table rows: no number was checked against the instance.');
  const mismatched = rows.filter((l) => /\b(mismatch|no|fail|wrong)\b/i.test(l.split('|').slice(-2).join('|')));
  if (mismatched.length && !/accept|fixed/i.test(read('fixes.md') || '')) {
    problems.push(`qa.md reports ${mismatched.length} count mismatch(es) that fixes.md neither fixes nor accepts.`);
  }

  const review = read('review.md') || '';
  if (review && !/\b(pass|ship|don't ship|do not ship|fail)\b/i.test(review)) problems.push('review.md has no verdict (pass, ship with fixes, don\'t ship, fail).');

  for (const f of ['report.md', 'spec.json', 'design.md']) {
    const text = read(f);
    if (!text) continue;
    for (const re of SLOP) if (re.test(text)) problems.push(`${f} contains "${text.match(re)[0]}": unfinished or filler text.`);
  }
  const spec = read('spec.json');
  if (spec) {
    try {
      const s = JSON.parse(spec);
      const labels = [s.title, s.subtitle, s.noun, s.summary_label, s.list_heading, s.breakdown_heading, ...(s.reasons || []).flatMap((r) => [r.label, r.hint, r.row_label])].filter(Boolean);
      for (const l of labels) if (RAW_IN_LABEL.test(l)) problems.push(`spec.json label "${l}" shows a table name or sys_id to the user.`);
    } catch (e) {
      problems.push(`spec.json is not valid JSON: ${e.message}`);
    }
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node check-run.mjs <runDir>'); process.exit(2); }
  const problems = checkRun(dir);
  if (problems.length) {
    console.log(`NOT DONE: ${problems.length} problem(s)\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log('Evidence gate passed.');
}
