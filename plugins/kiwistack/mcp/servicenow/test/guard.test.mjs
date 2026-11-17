import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.mjs';
import { validateConfig, resolveInstance } from '../src/config.mjs';
import { makeFakeInstance, withKiwiUpdateSet, OTHER_SCOPE_ID, SCOPE_ID } from './fake-instance.mjs';

const call = async (fake, name, args) => {
  const server = createServer({ contextFor: () => fake.ctx });
  const res = await server.callTool(name, args);
  return { isError: Boolean(res.isError), body: JSON.parse(res.content[0].text) };
};

const goodConfig = () => ({
  default: 'dev',
  instances: {
    dev: { host: 'kiwi-dev.service-now.com', environment: 'dev', scope: 'x_kiwi_demo', auth: { grant: 'client_credentials', client_id_env: 'A', client_secret_env: 'B' } },
  },
});

test('config refuses an instance marked production', () => {
  const c = goodConfig();
  c.instances.dev.environment = 'prod';
  assert.throws(() => validateConfig(c), /never connects to production/);
});

test('instances outside the allowlist are refused', () => {
  const loaded = { config: validateConfig(goodConfig()) };
  assert.throws(() => resolveInstance(loaded, 'acme-prod'), /not in the allowlist/);
});

test('an instance reporting glide.installation.production=true is refused even for reads', async () => {
  const fake = makeFakeInstance({ production: true });
  const r = await call(fake, 'sn_query', { table: 'incident' });
  assert.equal(r.isError, true);
  assert.equal(r.body.error, 'PRODUCTION');
});

test('a PDI that ships with the production flag is allowed only when declared and on a devNNNN host', async () => {
  const pdi = makeFakeInstance({ production: true });
  Object.assign(pdi.instance, { host: 'dev485434.service-now.com', pdi: true });
  assert.equal((await call(pdi, 'sn_query', { table: 'incident' })).isError, false);

  const undeclared = makeFakeInstance({ production: true });
  undeclared.instance.host = 'dev485434.service-now.com';
  assert.equal((await call(undeclared, 'sn_query', { table: 'incident' })).body.error, 'PRODUCTION');

  const lookalike = makeFakeInstance({ production: true });
  Object.assign(lookalike.instance, { host: 'acme.service-now.com', pdi: true });
  assert.equal((await call(lookalike, 'sn_query', { table: 'incident' })).body.error, 'PRODUCTION');
});

test('config refuses "pdi" on a host that is not a PDI', () => {
  const c = goodConfig();
  c.instances.dev.pdi = true;
  assert.throws(() => validateConfig(c), /not a devNNNN/);
  c.instances.dev.host = 'dev485434.service-now.com';
  assert.doesNotThrow(() => validateConfig(c));
});

test('metadata writes without a current update set are refused', async () => {
  const fake = makeFakeInstance();
  const r = await call(fake, 'sn_upsert', { table: 'sys_script', values: { name: 'x' } });
  assert.equal(r.body.error, 'NO_UPDATE_SET');
});

test('metadata writes into the Default update set are refused', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake, { name: 'Default' });
  const r = await call(fake, 'sn_upsert', { table: 'sys_script', values: { name: 'x' } });
  assert.equal(r.body.error, 'DEFAULT_UPDATE_SET');
});

test('an update set from another application is refused', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake, { application: OTHER_SCOPE_ID });
  const r = await call(fake, 'sn_upsert', { table: 'sys_script', values: { name: 'x' } });
  assert.equal(r.body.error, 'UPDATE_SET_SCOPE_MISMATCH');
});

test('a scoped insert lands in the kiwi update set and in the target scope', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake);
  const r = await call(fake, 'sn_upsert', { table: 'sys_script', values: { name: 'Set priority' } });
  assert.equal(r.isError, false);
  assert.equal(r.body.action, 'inserted');
  assert.equal(r.body.captured_in_update_set, true);
  assert.equal(r.body.record_scope_ok, true);
});

test('a write the instance did not capture is flagged so the agent stops', async () => {
  const fake = makeFakeInstance({ capture: false });
  await withKiwiUpdateSet(fake);
  const r = await call(fake, 'sn_upsert', { table: 'sys_script', values: { name: 'x' } });
  assert.equal(r.body.captured_in_update_set, false);
  assert.match(r.body.warning, /did not land/);
});

test('editing an OOTB or other-scope record needs approval, and proceeds once approved', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake);
  const id = 'e'.repeat(32);
  fake.put('sys_script', { sys_id: id, name: 'HR BR', sys_scope: OTHER_SCOPE_ID });
  const blocked = await call(fake, 'sn_upsert', { table: 'sys_script', sys_id: id, values: { active: 'false' } });
  assert.equal(blocked.body.status, 'needs_approval');
  assert.equal(blocked.body.reasons[0].code, 'OUT_OF_SCOPE');
  assert.equal(fake.t('sys_script').get(id).active, undefined, 'nothing written before approval');
  const approved = await call(fake, 'sn_upsert', { table: 'sys_script', sys_id: id, values: { active: 'false' }, user_approved: true });
  assert.equal(approved.body.action, 'updated');
});

test('data-record writes need approval', async () => {
  const fake = makeFakeInstance();
  const r = await call(fake, 'sn_upsert', { table: 'incident', values: { short_description: 'demo' } });
  assert.equal(r.body.status, 'needs_approval');
  assert.equal(r.body.reasons[0].code, 'DATA_RECORD');
});

test('deletes always need approval, even in scope', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake);
  const id = 'f'.repeat(32);
  fake.put('sys_script', { sys_id: id, name: 'mine', sys_scope: SCOPE_ID });
  const r = await call(fake, 'sn_delete', { table: 'sys_script', sys_id: id });
  assert.equal(r.body.status, 'needs_approval');
  assert.ok(fake.t('sys_script').has(id));
});

test('bad table names are rejected before any request', async () => {
  const fake = makeFakeInstance();
  const r = await call(fake, 'sn_query', { table: 'incident;drop' });
  assert.equal(r.body.error, 'BAD_INPUT');
  assert.equal(fake.calls.length, 0);
});

test('sn_update_set create prefixes kiwi/, scopes it, and makes it current', async () => {
  const fake = makeFakeInstance();
  const r = await call(fake, 'sn_update_set', { action: 'create', name: 'hrsd-onboarding-page' });
  assert.equal(r.body.update_set.name, 'kiwi/hrsd-onboarding-page');
  assert.equal(r.body.update_set.application, SCOPE_ID);
  const again = await call(fake, 'sn_update_set', { action: 'create', name: 'hrsd-onboarding-page' });
  assert.equal(again.body.reused, true);
});

const hook = fileURLToPath(new URL('../../../hooks/approval-gate.mjs', import.meta.url));
const runHook = (input) => spawnSync(process.execPath, [hook], { input: JSON.stringify(input), encoding: 'utf8' });

test('approval hook asks for deletes and user_approved calls, and stays silent otherwise', () => {
  const del = runHook({ tool_name: 'mcp__plugin_kiwistack_servicenow__sn_delete', tool_input: { table: 't', sys_id: 'x' } });
  assert.equal(JSON.parse(del.stdout).hookSpecificOutput.permissionDecision, 'ask');
  const approved = runHook({ tool_name: 'mcp__plugin_kiwistack_servicenow__sn_upsert', tool_input: { user_approved: true } });
  assert.equal(JSON.parse(approved.stdout).hookSpecificOutput.permissionDecision, 'ask');
  const plain = runHook({ tool_name: 'mcp__plugin_kiwistack_servicenow__sn_query', tool_input: { table: 'incident' } });
  assert.equal(plain.stdout, '');
});
