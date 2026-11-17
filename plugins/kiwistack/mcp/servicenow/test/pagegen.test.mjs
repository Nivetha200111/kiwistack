import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.mjs';
import { COMPONENTS, GQL_COLLECTION, NAV_ITEM_SELECTED, PAGE_TEMPLATE, compileBoard, normalizeSpec, prefixQuery } from '../src/pagegen.mjs';
import { validateBundle } from '../src/bundle.mjs';
import { makeFakeInstance, withKiwiUpdateSet, SCOPE_ID } from './fake-instance.mjs';

const P1 = {
  name: 'P1 attention board',
  route: 'p1-attention',
  title: 'P1 incidents that need you',
  subtitle: 'Active priority 1 incidents.',
  table: 'incident',
  query: 'active=true^priority=1',
  noun: 'P1s',
  reasons: [
    { key: 'breaching', label: 'SLA breached', kind: 'sla_breached', color: 'critical', hint: 'Past its SLA' },
    { key: 'unassigned', label: 'Nobody assigned', kind: 'empty', field: 'assigned_to', color: 'high', hint: 'Needs an owner' },
    { key: 'nogroup', label: 'No group yet', kind: 'empty', field: 'assignment_group', color: 'warning' },
  ],
  breakdown_heading: 'Where P1s sit',
};
const ENV = { scope: 'x_kiwi_demo', appConfig: 'a'.repeat(31) + '1', shell: 'a'.repeat(31) + '2', host: 'kiwi-dev.service-now.com' };

test('spec validation names every problem and fills defaults', () => {
  const bad = normalizeSpec({ name: 'X', route: 'Bad Route!', title: 'T', table: 'incident', query: 'a=b', reasons: [{ key: 'K', kind: 'nope', color: 'pink' }] });
  assert.ok(bad.errors.some((e) => /route/.test(e)));
  assert.ok(bad.errors.some((e) => /key/.test(e)));
  assert.ok(bad.errors.some((e) => /kind/.test(e)));
  assert.ok(bad.errors.some((e) => /color/.test(e)));
  const ok = normalizeSpec(P1);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.spec.fields.group, 'assignment_group');
  assert.deepEqual(ok.spec.breakdown_reasons, ['breaching', 'unassigned']);
});

test('prefixQuery moves a record query onto task_sla.task, keeping OR clauses', () => {
  assert.equal(prefixQuery('active=true^priority=1^ORpriority=2^ORDERBYopened_at', 'task.'), 'task.active=true^task.priority=1^ORtask.priority=2');
});

test('compiled bundle is valid, complete, and wires data, scripts and navigation together', () => {
  const { spec } = normalizeSpec(P1);
  const { bundle, ids } = compileBoard(spec, { ...ENV, roleId: 'r'.repeat(0) + 'b'.repeat(32) });
  assert.deepEqual(validateBundle(bundle), []);
  const tables = bundle.records.map((r) => r.table);
  for (const t of ['sys_ux_app_route', 'sys_ux_screen_type', 'sys_ux_screen', 'sys_ux_macroponent', 'sys_ux_client_script_include', 'sys_ux_event', 'sys_ux_applicability', 'sys_ux_applicability_m2m_screen']) assert.ok(tables.includes(t), t);
  assert.equal(tables.filter((t) => t === 'sys_ux_client_script').length, 7);

  const page = bundle.records.find((r) => r.table === 'sys_ux_macroponent').values;
  assert.equal(page.extends, PAGE_TEMPLATE);
  const data = JSON.parse(page.data);
  assert.deepEqual(data.map((d) => d.elementId), ['records', 'breaches'], 'SLA reason adds the task_sla resource');
  assert.ok(data.every((d) => d.definition.id === GQL_COLLECTION));
  assert.match(data[1].inputValues.encodedQuery.value, /task\.sys_class_name=incident\^task\.active=true\^task\.priority=1/);
  assert.match(data[0].inputValues.returnFields.value, /assigned_to/);

  const composition = JSON.stringify(JSON.parse(page.composition));
  for (const id of Object.values(COMPONENTS)) assert.ok(composition.includes(id) || id === COMPONENTS.skeleton && composition.includes(id), `uses component ${id}`);
  const scriptIds = bundle.records.filter((r) => r.table === 'sys_ux_client_script').map((r) => r.sys_id);
  for (const id of [ids.cs_filter, ids.cs_open, ids.cs_refresh, ids.cs_group, ids.cs_showall]) assert.ok(composition.includes(id), 'every UI event targets a real client script');
  assert.ok(scriptIds.includes(ids.cs_apply));

  const screen = bundle.records.find((r) => r.table === 'sys_ux_screen').values;
  assert.equal(screen.macroponent, ids.macroponent);
  assert.match(screen.event_mappings, new RegExp(NAV_ITEM_SELECTED));
  assert.match(screen.event_mappings, /x_kiwi_demo\.NAV_ITEM_SELECTED_RELAY_P1_ATTENTION/);
  const route = bundle.records.find((r) => r.table === 'sys_ux_app_route').values;
  assert.equal(route.route_type, 'p1-attention');
  assert.equal(route.screen_type, ids.screen_type);

  const include = bundle.records.find((r) => r.table === 'sys_ux_client_script_include').values;
  assert.equal(include.api_name, 'x_kiwi_demo.P1AttentionRender');
  assert.match(include.script, /"kind":"sla_breached"/);
  assert.doesNotThrow(() => new Function(include.script.replace('function include({imports}) {', 'return (function () {') + ')'), 'render include is valid JavaScript');
  for (const cs of bundle.records.filter((r) => r.table === 'sys_ux_client_script')) {
    assert.doesNotThrow(() => new Function(`${cs.values.script}; return handler;`), `${cs.values.name} is valid JavaScript`);
  }
});

test('a page without an SLA reason or audience has one data resource and no audience records', () => {
  const { spec } = normalizeSpec({ ...P1, reasons: P1.reasons.slice(1) });
  const { bundle } = compileBoard(spec, ENV);
  const page = bundle.records.find((r) => r.table === 'sys_ux_macroponent').values;
  assert.deepEqual(JSON.parse(page.data).map((d) => d.elementId), ['records']);
  assert.ok(!bundle.records.some((r) => r.table.startsWith('sys_ux_applicability')));
  assert.ok(!page.composition.includes('sla_warning'));
});

test('the render include computes cards, reasons and the breakdown from data', () => {
  const { spec } = normalizeSpec(P1);
  const { bundle } = compileBoard(spec, ENV);
  const include = bundle.records.find((r) => r.table === 'sys_ux_client_script_include').values.script;
  const render = new Function(`${include}; return include({ imports: {} });`)();
  const state = {};
  const api = { setState: (k, v) => { state[k] = v; } };
  const now = Date.now();
  const recs = [
    { sysId: '1', number: 'INC1', summary: 'a', ownerId: '', owner: '', groupId: 'g1', groupName: 'Network', openedMs: now - 3600e3, f: { assigned_to: '', assignment_group: 'g1' } },
    { sysId: '2', number: 'INC2', summary: 'b', ownerId: 'u', owner: 'Beth', groupId: '', groupName: '', openedMs: now - 7200e3, f: { assigned_to: 'u', assignment_group: '' } },
    { sysId: '3', number: 'INC3', summary: 'c', ownerId: 'u', owner: 'Beth', groupId: 'g1', groupName: 'Network', openedMs: now, f: { assigned_to: 'u', assignment_group: 'g1' } },
  ];
  render(api, { records: recs, breaches: { 3: { endMs: now - 600e3 } }, total: 3, slaOk: true, loadedLabel: 'now' }, 'all', '');
  assert.deepEqual(state.summaryCards.map((c) => [c.filter, c.count]), [['all', '3'], ['breaching', '1'], ['unassigned', '1'], ['nogroup', '1']]);
  assert.equal(state.rows[0].number, 'INC3', 'breached rows sort first');
  assert.match(state.rows[0].reasonLabel, /SLA breached 10 minutes ago/);
  const network = state.groupRows.find((g) => g.name === 'Network');
  assert.deepEqual([network.total, network.r_breaching, network.r_unassigned], ['2', '1', '1']);
  render(api, { records: recs, breaches: {}, total: 3, slaOk: true, loadedLabel: 'now' }, 'nogroup', '');
  assert.deepEqual(state.rows.map((r) => r.number), ['INC2']);
  assert.equal(state.showContent, true);
});

function seedWorkspace(fake) {
  fake.put('sys_ux_app_config', { sys_id: ENV.appConfig, name: 'SOW config', sys_scope: 'global' });
  fake.put('sys_ux_macroponent', { sys_id: ENV.shell, name: 'SOW shell', sys_scope: 'global' });
  fake.put('sys_ux_page_registry', { sys_id: 'e'.repeat(32), path: 'sow', title: 'Service Operations Workspace', admin_panel: ENV.appConfig, root_macroponent: ENV.shell, sys_scope: 'global' });
  for (const id of [PAGE_TEMPLATE, ...Object.values(COMPONENTS)]) fake.put('sys_ux_macroponent', { sys_id: id, name: id, sys_scope: 'global' });
  fake.put('sys_ux_data_broker_graphql', { sys_id: GQL_COLLECTION, name: 'GlideRecord Collection Query', sys_scope: 'global' });
  fake.put('sys_ux_event', { sys_id: NAV_ITEM_SELECTED, name: 'NAV_ITEM_SELECTED', sys_scope: 'global' });
  fake.put('sys_user_role', { sys_id: '9'.repeat(32), name: 'x_kiwi_demo.lead', sys_scope: SCOPE_ID });
}

test('sn_ux_build_page writes a whole page into the kiwi update set, and a rebuild updates the same records', async () => {
  const fake = makeFakeInstance();
  seedWorkspace(fake);
  await withKiwiUpdateSet(fake);
  const server = createServer({ contextFor: () => fake.ctx });
  const build = async () => JSON.parse((await server.callTool('sn_ux_build_page', { spec: P1, audience_role: 'x_kiwi_demo.lead' })).content[0].text);

  const first = await build();
  assert.equal(first.status, 'written', JSON.stringify(first).slice(0, 400));
  assert.equal(first.rebuilt, false);
  assert.equal(first.page_url, 'https://kiwi-dev.service-now.com/now/sow/p1-attention');
  assert.ok(first.upsert.written.every((w) => w.action === 'inserted' && w.captured_in_update_set === true));
  const countBefore = [...fake.tables.values()].reduce((n, t) => n + t.size, 0);

  const second = await build();
  assert.equal(second.status, 'written');
  assert.equal(second.rebuilt, true);
  assert.ok(second.upsert.written.every((w) => w.action === 'updated'), 'rebuild updates in place');
  const countAfterRecords = [...['sys_ux_macroponent', 'sys_ux_client_script', 'sys_ux_app_route', 'sys_ux_screen']].map((t) => fake.t(t).size);
  assert.deepEqual(countAfterRecords, [Object.values(COMPONENTS).length + 3, 7, 1, 1], 'no duplicate records');
  assert.ok([...fake.tables.values()].reduce((n, t) => n + t.size, 0) >= countBefore);
});

test('sn_ux_build_page refuses bad specs, unknown workspaces, missing roles and routes owned by other apps', async () => {
  const fake = makeFakeInstance();
  seedWorkspace(fake);
  await withKiwiUpdateSet(fake);
  const server = createServer({ contextFor: () => fake.ctx });
  const call = async (args) => JSON.parse((await server.callTool('sn_ux_build_page', args)).content[0].text);
  assert.equal((await call({ spec: { name: 'x' } })).status, 'invalid_spec');
  assert.equal((await call({ spec: P1, experience: 'nope' })).status, 'no_experience');
  assert.equal((await call({ spec: P1, audience_role: 'x_kiwi_demo.missing' })).status, 'no_role');
  fake.put('sys_ux_app_route', { sys_id: 'f'.repeat(32), app_config: ENV.appConfig, route_type: 'p1-attention', screen_type: '1'.repeat(32), sys_scope: 'c'.repeat(32) });
  assert.equal((await call({ spec: P1 })).status, 'route_taken');
});
