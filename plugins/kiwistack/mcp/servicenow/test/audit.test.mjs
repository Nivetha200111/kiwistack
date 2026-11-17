import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.mjs';
import { makeFakeInstance } from './fake-instance.mjs';

const id = (c) => c.repeat(32);
const LEAKY = id('1');
const CLEAN = id('2');
const DEFAULT_ACL = id('3');
const LEAD_ACL = id('4');
const ITIL = id('5');
const LEAD_ROLE = id('6');

function seed() {
  const fake = makeFakeInstance();
  fake.put('sys_scope', { sys_id: LEAKY, scope: 'x_leaky', name: 'Leaky dashboard' });
  fake.put('sys_scope', { sys_id: CLEAN, scope: 'x_clean', name: 'Clean dashboard' });
  fake.put('sys_user_role', { sys_id: ITIL, name: 'itil', sys_scope: 'global' });

  // Shaped like Studio Build Agent's P1 app: default REST ACL, plain GlideRecord, outbound REST privileges.
  fake.put('sys_security_acl', { sys_id: DEFAULT_ACL, name: 'Scripted REST External Default', type: 'REST_Endpoint', active: 'true', sys_scope: 'global' });
  fake.put('sys_ws_operation', {
    sys_id: id('a'), sys_scope: LEAKY, name: 'Dashboard Data', http_method: 'GET', operation_uri: '/api/x_leaky/dash/data',
    requires_authentication: 'true', requires_acl_authorization: 'true', enforce_acl: DEFAULT_ACL,
    operation_script: 'var gr = new GlideRecord("incident"); gr.addQuery("priority", 1); gr.query();',
  });
  for (const [n, name, type, op] of [['b', 'ScriptableRESTMessageClient.setBasicAuth', 'scriptable', 'execute'], ['c', 'contract_sla', 'sys_db_object', 'read'], ['d', 'incident', 'sys_db_object', 'write']]) {
    fake.put('sys_scope_privilege', { sys_id: id(n), source_scope: LEAKY, target_name: name, target_type: type, operation: op, status: 'allowed' });
  }
  fake.put('sys_user_role', { sys_id: id('e'), name: 'x_leaky.user', sys_scope: LEAKY });
  fake.put('sys_user_role_contains', { sys_id: id('f'), role: id('e'), contains: ITIL });
  fake.put('sys_ux_data_broker_transform', { sys_id: id('7'), name: 'Unused broker', sys_scope: LEAKY });
  fake.put('sys_update_set', { sys_id: id('8'), name: 'Default', application: LEAKY, is_default: 'true', state: 'in progress' });
  fake.put('sys_update_xml', { sys_id: id('9'), update_set: id('8'), name: 'sys_ws_operation_aaaa' });
  fake.put('sys_script_include', { sys_id: id('0'), name: 'DashAjax', sys_scope: LEAKY, client_callable: 'true', active: 'true', script: 'getData: function() { return new GlideRecord("incident"); }' });

  // A clean app: role-gated endpoint, secure reads, a test.
  fake.put('sys_user_role', { sys_id: LEAD_ROLE, name: 'x_clean.lead', sys_scope: CLEAN });
  fake.put('sys_security_acl', { sys_id: LEAD_ACL, name: 'x_clean dash', type: 'REST_Endpoint', active: 'true', sys_scope: CLEAN });
  fake.put('sys_security_acl_role', { sys_id: id('c').replace(/c/g, 'e').slice(0, 31) + '1', sys_security_acl: LEAD_ACL, sys_user_role: LEAD_ROLE });
  fake.put('sys_ws_operation', {
    sys_id: id('b'), sys_scope: CLEAN, name: 'Dash', http_method: 'GET', operation_uri: '/api/x_clean/dash',
    requires_authentication: 'true', requires_acl_authorization: 'true', enforce_acl: LEAD_ACL,
    operation_script: 'var gr = new GlideRecordSecure("incident"); gr.query();',
  });
  fake.put('sys_atf_test', { sys_id: id('d'), name: 'Dash works', sys_scope: CLEAN, active: 'true' });
  return fake;
}

const audit = async (fake, scope) => {
  const res = await createServer({ contextFor: () => fake.ctx }).callTool('sn_app_audit', { scope });
  assert.equal(res.isError, undefined, res.content[0].text);
  return JSON.parse(res.content[0].text);
};

test('audit flags the data exposure, risky privileges and hygiene gaps in a Build-Agent-shaped app', async () => {
  const r = await audit(seed(), 'x_leaky');
  const by = (check) => r.findings.filter((f) => f.check === check);
  assert.equal(r.app.name, 'Leaky dashboard');

  const rest = by('rest_endpoints');
  assert.equal(rest.length, 1);
  assert.equal(rest[0].severity, 'high');
  assert.match(rest[0].what, /any internal user/);
  assert.match(rest[0].why, /bypassed/);

  const priv = by('cross_scope_privileges');
  assert.ok(priv.some((f) => f.severity === 'high' && /setBasicAuth/.test(f.what)), 'outbound REST privilege flagged');
  assert.ok(priv.some((f) => f.severity === 'medium' && /write on table incident/.test(f.what)), 'cross-scope write flagged');
  assert.ok(!priv.some((f) => /contract_sla/.test(f.what)), 'plain cross-scope reads are not noise');

  assert.equal(by('client_callable_script_includes')[0].severity, 'high');
  assert.match(by('app_roles')[0].what, /contains itil/);
  assert.equal(by('data_brokers').length, 1);
  assert.equal(by('atf_coverage').length, 1);
  assert.match(by('default_update_set')[0].what, /1 change/);

  assert.ok(r.summary.high >= 3);
  assert.deepEqual(r.findings.map((f) => f.severity), [...r.findings.map((f) => f.severity)].sort((a, b) => ['critical', 'high', 'medium', 'low', 'info'].indexOf(a) - ['critical', 'high', 'medium', 'low', 'info'].indexOf(b)), 'ranked most severe first');
});

test('audit of a role-gated, tested app raises nothing high', async () => {
  const r = await audit(seed(), 'x_clean');
  assert.equal(r.summary.critical, 0);
  assert.equal(r.summary.high, 0);
  assert.equal(r.findings.filter((f) => f.check === 'rest_endpoints').length, 0);
  assert.equal(r.findings.filter((f) => f.check === 'atf_coverage').length, 0);
});

test('a check the instance refuses is reported as skipped, not silently passed', async () => {
  const fake = seed();
  const denied = makeFakeInstance({ deny: ['sys_scope_privilege'] });
  for (const [table, rows] of fake.tables) for (const rec of rows.values()) if (table !== 'sys_db_object') denied.put(table, rec);
  const r = await audit(denied, 'x_leaky');
  assert.ok(r.skipped.some((s) => s.check === 'cross_scope_privileges'));
  assert.ok(r.checked.some((c) => c.check === 'rest_endpoints'));
});

test('an unknown scope is an error, and the audit never writes', async () => {
  const fake = seed();
  const res = await createServer({ contextFor: () => fake.ctx }).callTool('sn_app_audit', { scope: 'x_nope' });
  assert.equal(res.isError, true);
  assert.ok(!fake.calls.some((c) => /^(POST|PATCH|DELETE)/.test(c)), 'read-only');
});
