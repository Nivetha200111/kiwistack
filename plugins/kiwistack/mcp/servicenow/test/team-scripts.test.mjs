import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync as readText } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveModels, DEFAULTS } from '../../../scripts/models.mjs';
import { checkRun } from '../../../scripts/check-run.mjs';
import { preflight } from '../../../scripts/preflight.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'kiwi-'));

test('model resolution: defaults, then the user sheet, then the project sheet; effort suffixes and inherit', () => {
  const project = tmp();
  const home = tmp();
  assert.deepEqual(Object.fromEntries(Object.entries(resolveModels({ projectDir: project, home }).roles).map(([k, v]) => [k, v.model])), DEFAULTS);

  writeFileSync(join(home, 'models.json'), JSON.stringify({ default_effort: 'high', roles: { qa: 'opus@xhigh', recon: 'haiku' } }));
  mkdirSync(join(project, '.kiwi'));
  writeFileSync(join(project, '.kiwi', 'models.json'), JSON.stringify({ roles: { qa: 'fable', designer: 'inherit' } }));
  const { roles } = resolveModels({ projectDir: project, home });
  assert.deepEqual(roles.qa, { model: 'fable', effort: 'high', source: 'project' }, 'project wins, default_effort applies');
  assert.deepEqual(roles.recon, { model: 'haiku', effort: 'high', source: 'user' });
  assert.equal(roles.designer.model, 'inherit');
  assert.equal(roles.builder.source, 'default');
});

test('model resolution flags bad values and a reviewer that matches the builder', () => {
  const project = tmp();
  const home = tmp();
  writeFileSync(join(home, 'models.json'), JSON.stringify({ roles: { qa: 'gpt-9', reviewer: 'opus@turbo', bogus: 'opus' } }));
  const { roles, warnings } = resolveModels({ projectDir: project, home });
  assert.equal(roles.qa.model, DEFAULTS.qa);
  assert.equal(roles.reviewer.effort, null);
  assert.ok(warnings.some((w) => /unknown model "gpt-9"/.test(w)));
  assert.ok(warnings.some((w) => /unknown effort "turbo"/.test(w)));
  assert.ok(warnings.some((w) => /unknown role "bogus"/.test(w)));
  assert.ok(warnings.some((w) => /reviewer and builder both run on opus/.test(w)));
});

function goodRun() {
  const dir = tmp();
  const w = (f, t) => writeFileSync(join(dir, f), t);
  w('goal.md', 'Laptop audit page.\n\nStarted (UTC): 2026-11-17 11:59:39\n');
  w('recon.md', '## Facts\n- 719 computers in use\n## Counts\n| filter | count |\n|-|-|\n| unassigned | 4 |\n');
  w('domain.md', '## Definitions\n| term | filter |\n|-|-|\n| computer | sys_class_name=cmdb_ci_computer |\n');
  w('decisions.md', 'Excluded servers.');
  w('spec.json', JSON.stringify({ title: 'Computers we can\'t account for', reasons: [{ label: 'Nobody assigned', hint: 'Assign an owner' }] }));
  w('build.md', '## Built\nhttps://dev.service-now.com/now/cmdb/laptop-audit');
  w('qa.md', '## Counts\n| card | page | query | match |\n|-|-|-|-|\n| Can\'t account for | 54 | 54 | yes |\n| Nobody assigned | 4 | 4 | yes |\n## States\n- empty: seen\n- no-access: unverified (no test user)\n## Update set\n- 6 records, none in Default.\n- Capture audit: ALL_CAPTURED (6 of 6)\n## Findings\n- none\n');
  w('security.md', '## Verdict\nSafe.\n## Fixes\n### F1 (should) Audience role can read serial numbers\n- Where: `sys_security_acl/abc`\n- Proof: `sn_get sys_security_acl abc` shows no condition on serial_number.\n- Expected: domain.md hides serials from the persona.\n- Fix: add a field ACL.\n');
  w('review.md', 'Verdict: ship with fixes.\n## Findings\n### F1 (should) Hint repeats its label\n- Where: spec.json line 3\n- Proof: label "Nobody assigned", hint "Nobody assigned to it".\n- Expected: rubric item 4, a hint names the next action.\n- Fix: "Assign an owner".\n');
  w('slop.md', '## Verdict\nclean\n## Findings\n- none\n## Checked\n- page text, scripts, leftovers, report\n');
  w('desktop.png', 'x');
  return dir;
}

test('the evidence gate passes a complete run', () => {
  assert.deepEqual(checkRun(goodRun()), []);
});

test('the evidence gate blocks missing evidence, unchecked numbers, mismatches, slop and raw names in labels', () => {
  const dir = goodRun();
  writeFileSync(join(dir, 'qa.md'), '## Counts\n| card | page | query | match |\n|-|-|-|-|\n| Total | 95 | 54 | mismatch |\n| x | 1 | 1 | yes |\n## States\n## Findings\n');
  writeFileSync(join(dir, 'spec.json'), JSON.stringify({ title: 'cmdb_ci_computer audit', subtitle: 'TODO write subtitle', reasons: [] }));
  writeFileSync(join(dir, 'review.md'), 'Looks good overall.');
  const problems = checkRun(dir).join('\n');
  assert.match(problems, /count mismatch/);
  assert.match(problems, /"TODO"/);
  assert.match(problems, /table name or sys_id/);
  assert.match(problems, /review.md has no verdict/);

  const empty = tmp();
  const p2 = checkRun(empty).join('\n');
  assert.match(p2, /Missing goal.md/);
  assert.match(p2, /No screenshot/);
  assert.match(p2, /Missing spec.json or design.md/);
});

test('the evidence gate rejects findings without a proof, and accepts them under Not proven', () => {
  const dir = goodRun();
  writeFileSync(join(dir, 'review.md'), "Verdict: don't ship.\n## Findings\n### F1 (must) The count is probably wrong\n- Where: the summary card\n- Fix: re-check it\n");
  writeFileSync(join(dir, 'slop.md'), '## Verdict\nslop found\n## Findings\n- labels look generic\n');
  const problems = checkRun(dir).join('\n');
  assert.match(problems, /review.md: finding "F1 \(must\) The count is probably wrong" has no Proof: line/);
  assert.match(problems, /slop.md "## Findings" lists findings without the proof shape/);

  writeFileSync(join(dir, 'review.md'), 'Verdict: ship.\n## Findings\n- none\n## Not proven\n- The count may drift at month end: run sn_query on Dec 1.\n');
  writeFileSync(join(dir, 'slop.md'), '## Verdict\nclean\n## Findings\nNo findings.\n');
  assert.deepEqual(checkRun(dir), []);
});

test('the evidence gate needs a run start and a capture audit, and an uncaptured result must be handled', () => {
  const dir = goodRun();
  writeFileSync(join(dir, 'goal.md'), 'Laptop audit page.');
  const qa = (line) => `## Counts\n| card | page | query | match |\n|-|-|-|-|\n| a | 1 | 1 | yes |\n| b | 2 | 2 | yes |\n## States\n## Update set\n${line}\n## Findings\n- none\n`;
  writeFileSync(join(dir, 'qa.md'), qa('- 6 records.'));
  let problems = checkRun(dir).join('\n');
  assert.match(problems, /no "Started \(UTC\)/);
  assert.match(problems, /no "Capture audit:" line/);

  writeFileSync(join(dir, 'goal.md'), 'x\nStarted (UTC): 2026-11-17 11:59:39\n');
  writeFileSync(join(dir, 'qa.md'), qa('- Capture audit: UNCAPTURED (26 of 64)'));
  assert.match(checkRun(dir).join('\n'), /neither fixes nor accounts for them/);
  writeFileSync(join(dir, 'fixes.md'), 'The 26 uncaptured ACLs: re-captured into kiwi/hrsd by the builder.');
  assert.deepEqual(checkRun(dir), []);
});

test('the slop scan ignores code, quoted values and the domain\'s own words (the laptop-audit false positives)', () => {
  const dir = goodRun();
  writeFileSync(join(dir, 'domain.md'), '## Definitions\n| term | filter |\n|-|-|\n| dummy serial | serial_number is "placeholder" or empty |\n');
  writeFileSync(join(dir, 'spec.json'), JSON.stringify({ title: 'Computers we can\'t account for', base_query: 'serial_number=placeholder', reasons: [{ label: 'Dummy serial', hint: 'Fix the serial' }] }));
  writeFileSync(join(dir, 'design.md'), 'Exclude rows whose serial is a placeholder value, per domain.md.\nQuery: `serial_number!=placeholder`.\n');
  assert.deepEqual(checkRun(dir), []);
  writeFileSync(join(dir, 'report.md'), 'Summary: TODO.');
  assert.match(checkRun(dir).join('\n'), /report.md contains "TODO"/);
});

test('preflight refuses a run when the approval hook stops asking, and passes when it asks', () => {
  const real = fileURLToPath(new URL('../../../', import.meta.url));
  const make = (enabled) => {
    const root = tmp();
    cpSync(join(real, 'hooks'), join(root, 'hooks'), { recursive: true });
    const file = join(root, 'hooks', 'approval-gate.mjs');
    const src = readText(file, 'utf8').replace(/^(\s*)(?:\/\/\s*)?(if \(args\.user_approved === true\))/m, enabled ? '$1$2' : '$1// $2');
    writeFileSync(file, src);
    return root;
  };
  assert.deepEqual(preflight({ pluginRoot: make(true) }), []);
  const off = preflight({ pluginRoot: make(false) }).join('\n');
  assert.match(off, /did not ask for a write flagged user_approved/);
  const unhooked = make(true);
  writeFileSync(join(unhooked, 'hooks', 'hooks.json'), JSON.stringify({ hooks: { PreToolUse: [] } }));
  assert.match(preflight({ pluginRoot: unhooked }).join('\n'), /no longer runs approval-gate.mjs/);
});
