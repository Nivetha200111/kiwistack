// Regression tests for the bugs logged by the 2026-11-17 /kiwi-mode run on a Brazil PDI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.mjs';
import { makeFakeInstance, withKiwiUpdateSet, SCOPE_ID, OTHER_SCOPE_ID, USER_ID } from './fake-instance.mjs';

const call = async (fake, name, args) => {
  const server = createServer({ contextFor: () => fake.ctx });
  const res = await server.callTool(name, args);
  return { isError: Boolean(res.isError), body: JSON.parse(res.content[0].text) };
};

// --- update sets ------------------------------------------------------------------

test('sn_update_set create lands in the target scope even when the session is in global', async () => {
  const fake = makeFakeInstance();
  fake.put('sys_user_preference', { sys_id: '9'.repeat(32), user: USER_ID, name: 'apps.current_app', value: 'global' });
  const r = await call(fake, 'sn_update_set', { action: 'create', name: 'p1-attention-board' });
  assert.equal(r.isError, false, JSON.stringify(r.body));
  assert.equal(r.body.update_set.application, SCOPE_ID);
  const sets = [...fake.t('sys_update_set').values()];
  assert.equal(sets.length, 1, 'no stray global duplicate');
  const info = await call(fake, 'sn_instance_info', {});
  assert.equal(info.body.update_set_ok, true);
});

test('sn_update_set create fails loudly when the instance puts the set in another application', async () => {
  const fake = makeFakeInstance({ updateSetApp: 'global' });
  const r = await call(fake, 'sn_update_set', { action: 'create', name: 'p1-attention-board' });
  assert.equal(r.isError, true);
  assert.equal(r.body.error, 'UPDATE_SET_SCOPE_MISMATCH');
  assert.match(r.body.message, /not made current/);
  const info = await call(fake, 'sn_instance_info', {});
  assert.equal(info.body.update_set_ok, false);
  assert.match(info.body.update_set_problem, /No current update set/);
});

test('sn_instance_info explains why update_set_ok is false', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake, { application: OTHER_SCOPE_ID });
  const info = await call(fake, 'sn_instance_info', {});
  assert.equal(info.body.update_set_ok, false);
  assert.match(info.body.update_set_problem, /belongs to application/);
});

// --- ACLs ---------------------------------------------------------------------------

test('ACL writes are refused up front with a named reason and the fallbacks, before any write', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake);
  for (const table of ['sys_security_acl', 'sys_security_acl_role']) {
    const r = await call(fake, 'sn_upsert', { table, values: { name: 'x_kiwi_demo.p1_board', type: 'ux_data_broker', operation: 'execute' }, user_approved: true });
    assert.equal(r.isError, true);
    assert.equal(r.body.error, 'NEEDS_SECURITY_ADMIN');
    assert.match(r.body.message, /OOTB GraphQL/);
    assert.match(r.body.message, /SDK/);
  }
  assert.equal(fake.calls.filter((c) => c.includes('sys_security_acl')).length, 0);
});

test('an instance-side ACL exception keeps its message and explains it', async () => {
  const fake = makeFakeInstance({
    routes: { 'POST /api/now/table/sys_script': () => ({ status: 403, body: { error: { message: 'ACL Exception Insert Failed due to security constraints' } } }) },
  });
  await withKiwiUpdateSet(fake);
  const r = await call(fake, 'sn_upsert', { table: 'sys_script', values: { name: 'x' } });
  assert.equal(r.body.http_status, 403);
  assert.match(r.body.message, /security_admin/);
});

// --- ATF ----------------------------------------------------------------------------

const cicdRun = (status, body) => ({ 'POST /api/sn_cicd/testsuite/run': () => ({ status, body }) });

test('sn_atf_run_suite stops before the CI/CD call when sn_atf.runner.enabled is false', async () => {
  const fake = makeFakeInstance({ routes: cicdRun(400, {}) });
  fake.put('sys_properties', { sys_id: '7'.repeat(32), name: 'sn_atf.runner.enabled', value: 'false' });
  const r = await call(fake, 'sn_atf_run_suite', { suite_sys_id: '8'.repeat(32) });
  assert.equal(r.isError, false);
  assert.equal(r.body.status, 'atf_runner_disabled');
  assert.match(r.body.message, /sn_atf\.runner\.enabled/);
  assert.ok(!fake.calls.some((c) => c.includes('sn_cicd')), 'no run was started');
});

test('sn_atf_run_suite surfaces the response body of a failed run and the schedule records it left', async () => {
  const fake = makeFakeInstance({
    routes: cicdRun(400, { result: { status: '3', status_label: 'Failed', error: 'Test runner is not enabled' } }),
  });
  const us = await withKiwiUpdateSet(fake);
  // The instance records schedule rows in the current update set as a side effect of the call.
  const original = fake.fetchImpl;
  fake.client.fetch = async (url, init) => {
    if (String(url).includes('/api/sn_cicd/testsuite/run')) {
      fake.put('sys_update_xml', { sys_id: '6'.repeat(32), update_set: us.sys_id, name: `sys_atf_schedule_${'5'.repeat(32)}`, action: 'INSERT_OR_UPDATE' });
    }
    return original(url, init);
  };
  const r = await call(fake, 'sn_atf_run_suite', { suite_name: 'x_kiwi_demo - all' });
  assert.equal(r.body.status, 'run_failed');
  assert.equal(r.body.http_status, 400);
  assert.match(r.body.message, /Test runner is not enabled/);
  assert.match(r.body.response_body, /status_label/);
  assert.equal(r.body.stray_update_set_entries.length, 1);
  assert.match(r.body.warning, /back them out/);
});

test('sn_atf_run_suite reports a successful run without stray warnings when nothing was added', async () => {
  const fake = makeFakeInstance({
    routes: {
      ...cicdRun(200, { result: { links: { progress: { id: 'p1' } } } }),
      'GET /api/sn_cicd/progress/p1': () => ({ status: 200, body: { result: { status: '2', links: { results: { id: 'r1' } } } } }),
      'GET /api/sn_cicd/testsuite/results/r1': () => ({ status: 200, body: { result: { test_suite_status: 'success', rolledup_test_success_count: 2 } } }),
    },
  });
  await withKiwiUpdateSet(fake);
  const r = await call(fake, 'sn_atf_run_suite', { suite_name: 'x_kiwi_demo - all' });
  assert.equal(r.body.status, 'successful');
  assert.equal(r.body.results.rolledup_test_success_count, 2);
  assert.equal(r.body.warning, undefined);
});

test('ATF step inputs (sys_variable_value) of an in-scope step are written as part of the step', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake);
  const step = await call(fake, 'sn_upsert', { table: 'sys_atf_step', values: { test: '1'.repeat(32), step_config: '2'.repeat(32), order: '100' } });
  assert.equal(step.body.captured_in_update_set, true);
  const input = await call(fake, 'sn_upsert', {
    table: 'sys_variable_value',
    values: { document: 'sys_atf_step', document_key: step.body.sys_id, variable: '3'.repeat(32), value: 'gs.info(1);' },
  });
  assert.equal(input.isError, false, JSON.stringify(input.body));
  assert.equal(input.body.action, 'inserted');
  assert.equal(input.body.captured_as, `sys_atf_step/${step.body.sys_id}`);
  assert.equal(input.body.captured_in_update_set, true);
  assert.equal(input.body.record_scope_ok, true);
  // Updating the same row by match_query also works without approval.
  const again = await call(fake, 'sn_upsert', {
    table: 'sys_variable_value',
    match_query: `document=sys_atf_step^document_key=${step.body.sys_id}^variable=${'3'.repeat(32)}`,
    values: { value: 'gs.info(2);' },
  });
  assert.equal(again.body.action, 'updated');
  assert.equal(fake.t('sys_variable_value').get(input.body.sys_id).value, 'gs.info(2);');
});

test('variable values of another scope\'s step, or with no owner, still need approval', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake);
  const ootb = '4'.repeat(32);
  fake.put('sys_atf_step', { sys_id: ootb, sys_scope: OTHER_SCOPE_ID });
  const other = await call(fake, 'sn_upsert', { table: 'sys_variable_value', values: { document: 'sys_atf_step', document_key: ootb, value: 'x' } });
  assert.equal(other.body.status, 'needs_approval');
  assert.equal(other.body.reasons[0].code, 'OUT_OF_SCOPE');
  const orphan = await call(fake, 'sn_upsert', { table: 'sys_variable_value', values: { value: 'x' } });
  assert.equal(orphan.body.reasons[0].code, 'DATA_RECORD');
  const dataOwner = await call(fake, 'sn_upsert', { table: 'sys_variable_value', values: { document: 'incident', document_key: ootb, value: 'x' } });
  assert.equal(dataOwner.body.reasons[0].code, 'DATA_RECORD');
});

// --- plugins --------------------------------------------------------------------------

test('sn_plugins finds a workspace by its path and falls back to sys_scope when sys_store_app is blocked', async () => {
  const fake = makeFakeInstance({ deny: ['sys_store_app'] });
  fake.put('sys_scope', { sys_id: '1'.repeat(32), scope: 'sn_sow', name: 'Service Operations Workspace', active: 'true' });
  fake.put('sys_ux_page_registry', { sys_id: '2'.repeat(32), title: 'Service Operations Workspace', path: 'sow', active: 'true', sys_scope: '1'.repeat(32) });
  const r = await call(fake, 'sn_plugins', { search: 'sow' });
  assert.equal(r.isError, false);
  assert.deepEqual(r.body.experiences.map((e) => e.path), ['sow']);
  assert.deepEqual(r.body.store_apps.map((a) => a.scope), ['sn_sow']);
  assert.match(r.body.warnings.join(' '), /sys_store_app is not readable/);
});

// --- page export and file paths ---------------------------------------------------

import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ids = { shell: '1'.repeat(32), shellScript: '2'.repeat(32), st: '3'.repeat(32), screen: '4'.repeat(32), page: '5'.repeat(32), route: '6'.repeat(32), broker: '7'.repeat(32), ghost: '8'.repeat(32), cfg: '9'.repeat(32) };

/** A sub-page inside a landing-page shell, all in the app's scope, like the PDI run's SOW page. */
function subPageInstance(opts = {}) {
  const fake = makeFakeInstance(opts);
  const s = { sys_scope: SCOPE_ID };
  fake.put('sys_ux_app_config', { sys_id: ids.cfg, name: 'SOW config', sys_scope: OTHER_SCOPE_ID });
  fake.put('sys_ux_macroponent', { sys_id: ids.shell, name: 'Landing shell', composition: '[]', ...s });
  fake.put('sys_ux_client_script', { sys_id: ids.shellScript, name: 'shell script', macroponent: ids.shell, ...s });
  fake.put('sys_ux_screen_type', { sys_id: ids.st, name: 'P1 board', ...s });
  fake.put('sys_ux_data_broker_transform', { sys_id: ids.broker, name: 'P1 broker', ...s });
  fake.put('sys_ux_macroponent', {
    sys_id: ids.page,
    name: 'P1 page',
    composition: '[]',
    data: JSON.stringify([{ elementId: 'p1', definition: { id: ids.broker, type: 'TRANSFORM' } }, { elementId: 'gone', definition: { id: ids.ghost } }]),
    ...s,
  });
  fake.put('sys_ux_screen', { sys_id: ids.screen, name: 'P1 board', screen_type: ids.st, macroponent: ids.page, app_config: ids.cfg, parent_macroponent: ids.shell, ...s });
  fake.put('sys_ux_app_route', { sys_id: ids.route, name: 'p1-attention', route_type: 'p1-attention', screen_type: ids.st, app_config: ids.cfg, parent_macroponent: ids.shell, ...s });
  return fake;
}

test('exporting a sub-page stops at its parent shell, keeps its route, and finds its data resource', async () => {
  // The broker is missing from sys_metadata results, as the PDI run saw for a TRANSFORM resource.
  const fake = subPageInstance({ hiddenFromMetadata: [ids.broker] });
  const r = await call(fake, 'sn_ux_export_page', { table: 'sys_ux_screen', sys_id: ids.screen });
  assert.equal(r.isError, false, JSON.stringify(r.body));
  const inBundle = new Set(r.body.records.map((x) => x.sys_id));
  assert.ok(!inBundle.has(ids.shell), 'parent shell is not exported');
  assert.ok(!inBundle.has(ids.shellScript), "parent shell's client scripts are not exported");
  assert.ok(r.body.external_refs.some((e) => e.sys_id === ids.shell), 'parent shell is an external ref');
  assert.ok(inBundle.has(ids.page) && inBundle.has(ids.st), 'page macroponent and screen type are exported');
  assert.ok(inBundle.has(ids.broker), 'data resource found by probing its table');
  assert.ok(inBundle.has(ids.route), 'route is exported');
  assert.deepEqual(r.body.routes.map((x) => [x.sys_id, x.in_bundle]), [[ids.route, true]]);
  assert.deepEqual(r.body.unresolved_ids.map((x) => x.sys_id), [ids.ghost]);
  assert.match(r.body.unresolved_ids[0].found_in, /sys_ux_macroponent\/5+\.data/);
  assert.match(r.body.warnings.join(' '), /resolved to no readable record/);
});

test('export writes to out_path and returns a summary; upsert reads bundle_path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kiwi-'));
  const out = join(dir, 'p1.json');
  const fake = subPageInstance();
  const r = await call(fake, 'sn_ux_export_page', { table: 'sys_ux_screen', sys_id: ids.screen, out_path: out });
  assert.equal(r.body.status, 'written');
  assert.equal(r.body.records_by_table.sys_ux_app_route, 1);
  assert.equal(r.body.records, JSON.parse(readFileSync(out, 'utf8')).records.length);
  assert.equal(r.body.unresolved_ids.length, 1);

  await withKiwiUpdateSet(fake);
  const dry = await call(fake, 'sn_ux_upsert_page', { bundle_path: out, remap_ids: true, dry_run: true });
  assert.equal(dry.body.status, 'dry_run', JSON.stringify(dry.body));
  assert.equal(dry.body.order.length, r.body.records);
  const both = await call(fake, 'sn_ux_upsert_page', { bundle_path: out, bundle: {} });
  assert.equal(both.body.error, 'BAD_INPUT');
  const relative = await call(fake, 'sn_ux_export_page', { table: 'sys_ux_screen', sys_id: ids.screen, out_path: 'p1.json' });
  assert.equal(relative.body.error, 'BAD_INPUT');
});

test('sn_upsert takes a large field from a file; sn_get truncates long fields or writes them to a file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kiwi-'));
  const composition = join(dir, 'composition.json');
  const big = [{ elementId: 'root', children: Array.from({ length: 2000 }, (_, i) => ({ elementId: `e${i}` })) }];
  writeFileSync(composition, JSON.stringify(big, null, 2));
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake);
  const w = await call(fake, 'sn_upsert', { table: 'sys_ux_macroponent', values: { name: 'P1 page' }, values_from_files: { composition } });
  assert.equal(w.body.captured_in_update_set, true);
  const stored = fake.t('sys_ux_macroponent').get(w.body.sys_id).composition;
  assert.deepEqual(JSON.parse(stored), big);

  const g = await call(fake, 'sn_get', { table: 'sys_ux_macroponent', sys_id: w.body.sys_id });
  assert.ok(g.body.record.composition.length < 4100);
  assert.equal(g.body.truncated_fields.composition, stored.length);
  const full = join(dir, 'record.json');
  const f = await call(fake, 'sn_get', { table: 'sys_ux_macroponent', sys_id: w.body.sys_id, out_path: full });
  assert.equal(f.body.field_chars.composition, stored.length);
  assert.equal(JSON.parse(readFileSync(full, 'utf8')).composition, stored);
});
