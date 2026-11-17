import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveModels, DEFAULTS } from '../../../scripts/models.mjs';
import { checkRun } from '../../../scripts/check-run.mjs';

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
  w('goal.md', 'Laptop audit page.');
  w('recon.md', '## Facts\n- 719 computers in use\n## Counts\n| filter | count |\n|-|-|\n| unassigned | 4 |\n');
  w('domain.md', '## Definitions\n| term | filter |\n|-|-|\n| computer | sys_class_name=cmdb_ci_computer |\n');
  w('decisions.md', 'Excluded servers.');
  w('spec.json', JSON.stringify({ title: 'Computers we can\'t account for', reasons: [{ label: 'Nobody assigned', hint: 'Assign an owner' }] }));
  w('build.md', '## Built\nhttps://dev.service-now.com/now/cmdb/laptop-audit');
  w('qa.md', '## Counts\n| card | page | query | match |\n|-|-|-|-|\n| Can\'t account for | 54 | 54 | yes |\n| Nobody assigned | 4 | 4 | yes |\n## States\n- empty: seen\n- no-access: unverified (no test user)\n## Findings\n- none\n');
  w('security.md', '## Verdict\nSafe.');
  w('review.md', 'Verdict: ship with fixes.');
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
