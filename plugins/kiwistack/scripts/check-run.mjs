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
  'slop.md': ['## Verdict'],
};
// Text that should never reach a user-facing artifact.
const SLOP = [/\bTODO\b/, /\bTBD\b/, /lorem ipsum/i, /\bplaceholder\b/i, /\bFIXME\b/, /<insert[^>]*>/i, /\bXXX\b/];
// A table name or sys_id in a user-facing label is a design failure.
const RAW_IN_LABEL = /\b([a-z][a-z0-9]*_[a-z0-9_]+|[0-9a-f]{32})\b/;
// The run start, which the capture audit needs: "Started (UTC): 2026-11-17 11:59:39".
const STARTED = /Started \(UTC\):\s*\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;
// Files whose findings must each carry a proof (skills/kiwi-team/references/findings.md).
const FINDINGS = { 'qa.md': '## Findings', 'review.md': '## Findings', 'security.md': '## Fixes', 'slop.md': '## Findings' };

/** Prose with code, quoted strings and the domain's own vocabulary removed, so data isn't mistaken for filler. */
function proseOf(text) {
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ').replace(/"[^"\n]*"/g, ' ');
}
const sectionOf = (text, heading) => (text.split(heading)[1] || '').split(/\n## /)[0];

/** Problems with the findings in one file: each `### ` block needs a non-empty Proof line. */
export function findingsProblems(file, text, heading) {
  if (!text.includes(heading)) return [];
  const body = sectionOf(text, heading);
  const blocks = body.split(/\n(?=### )/).filter((b) => b.startsWith('### '));
  if (!blocks.length) {
    const rest = body.split('\n').map((l) => l.replace(/^[-*\s]+/, '').trim()).filter(Boolean);
    const empty = rest.every((l) => /^(none|no findings|nothing found|n\/a)\b/i.test(l));
    return empty ? [] : [`${file} "${heading}" lists findings without the proof shape (### F1 (must) ... with a Proof: line).`];
  }
  return blocks
    .filter((b) => !/^\s*-\s*Proof:\s*\S/m.test(b))
    .map((b) => `${file}: finding "${b.split('\n')[0].slice(4).trim()}" has no Proof: line. Prove it or move it under "## Not proven".`);
}

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

  // Every finding carries a proof.
  for (const [file, heading] of Object.entries(FINDINGS)) {
    const text = read(file);
    if (text) problems.push(...findingsProblems(file, text, heading));
  }

  // Capture audit: every record the run changed is in its kiwi/ update set.
  const goal = read('goal.md') || '';
  if (goal && !STARTED.test(goal)) problems.push('goal.md has no "Started (UTC): YYYY-MM-DD HH:MM:SS" line, so the capture audit has no start time.');
  const updateSet = sectionOf(qa, '## Update set');
  const audit = updateSet.match(/Capture audit:\s*(ALL_CAPTURED|UNCAPTURED)/);
  if (!audit) problems.push('qa.md "## Update set" has no "Capture audit:" line: nobody checked that every change landed in the update set.');
  else if (audit[1] === 'UNCAPTURED' && !/uncaptured[\s\S]*\b(accept|fixed|re-?captured|other run)/i.test(read('fixes.md') || '')) {
    problems.push('The capture audit found records outside the update set, and fixes.md neither fixes nor accounts for them.');
  }

  // Filler text, ignoring code, quoted strings and words the domain itself defines.
  const vocab = `${read('domain.md') || ''}\n${read('recon.md') || ''}`.toLowerCase();
  const scan = (f, text) => {
    for (const re of SLOP) {
      const m = text.match(re);
      if (m && !vocab.includes(m[0].toLowerCase())) problems.push(`${f} contains "${m[0]}": unfinished or filler text.`);
    }
  };
  for (const f of ['report.md', 'design.md']) {
    const text = read(f);
    if (text) scan(f, proseOf(text));
  }
  const spec = read('spec.json');
  if (spec) {
    try {
      const s = JSON.parse(spec);
      // Only what the user reads: queries and filters are data, not copy.
      const labels = [s.title, s.subtitle, s.noun, s.summary_label, s.list_heading, s.breakdown_heading, s.empty_state, ...(s.reasons || []).flatMap((r) => [r.label, r.hint, r.row_label])].filter((l) => typeof l === 'string' && l);
      for (const l of labels) if (RAW_IN_LABEL.test(l)) problems.push(`spec.json label "${l}" shows a table name or sys_id to the user.`);
      scan('spec.json', labels.join('\n'));
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
