import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.mjs';
import { orderRecords, remapIds, stripSystemFields, validateBundle } from '../src/bundle.mjs';
import { makeFakeInstance, withKiwiUpdateSet, SCOPE_ID } from './fake-instance.mjs';

const id = (c) => c.repeat(32);
const call = async (fake, name, args) => {
  const res = await createServer({ contextFor: () => fake.ctx }).callTool(name, args);
  return { isError: Boolean(res.isError), body: JSON.parse(res.content[0].text) };
};

test('remapIds rewrites references inside JSON fields', () => {
  const b = {
    kiwi_bundle: 1,
    root: { table: 'sys_ux_screen_type', sys_id: id('1') },
    records: [
      { table: 'sys_ux_screen_type', sys_id: id('1'), values: { name: 'Onboarding' } },
      { table: 'sys_ux_macroponent', sys_id: id('2'), values: { composition: JSON.stringify([{ elementId: 'stepper', component: id('9') }, { ref: id('1') }]) } },
    ],
  };
  let n = 0;
  const out = remapIds(b, () => String(++n).padStart(32, '0'));
  assert.equal(out.root.sys_id, '0'.repeat(31) + '1');
  const comp = JSON.parse(out.records[1].values.composition);
  assert.equal(comp[1].ref, '0'.repeat(31) + '1', 'bundle ids rewritten');
  assert.equal(comp[0].component, id('9'), 'external ids untouched');
});

test('orderRecords writes dependencies first', () => {
  const recs = [
    { table: 'sys_ux_screen', sys_id: id('3'), values: { macroponent: id('2'), screen_type: id('1') } },
    { table: 'sys_ux_macroponent', sys_id: id('2'), values: {} },
    { table: 'sys_ux_screen_type', sys_id: id('1'), values: {} },
  ];
  const order = orderRecords(recs).map((r) => r.sys_id);
  assert.ok(order.indexOf(id('3')) > order.indexOf(id('2')));
  assert.ok(order.indexOf(id('3')) > order.indexOf(id('1')));
});

test('stripSystemFields keeps sys_id and content, drops instance-managed fields', () => {
  assert.deepEqual(stripSystemFields({ sys_id: id('1'), sys_scope: 'x', sys_updated_on: 'y', name: 'n', composition: '[]' }), { sys_id: id('1'), name: 'n', composition: '[]' });
});

test('validateBundle reports malformed bundles', () => {
  assert.ok(validateBundle({ kiwi_bundle: 1, records: [{ table: 'Bad Table', sys_id: 'nope', values: {} }] }).length >= 2);
  assert.deepEqual(validateBundle({ kiwi_bundle: 1, records: [{ table: 'sys_ux_screen', sys_id: id('1'), values: {} }] }), []);
});

function seedPage(fake) {
  const platform = 'global';
  fake.put('sys_ux_lib_component', { sys_id: id('9'), name: 'Stepper', sys_scope: platform });
  fake.put('sys_ux_screen_type', { sys_id: id('1'), name: 'Onboarding journey', sys_scope: SCOPE_ID });
  fake.put('sys_ux_macroponent', { sys_id: id('2'), name: 'Onboarding journey default', sys_scope: SCOPE_ID, composition: JSON.stringify([{ elementId: 'stepper_1', definition: { id: id('9') } }]) });
  fake.put('sys_ux_screen', { sys_id: id('3'), name: 'Default', sys_scope: SCOPE_ID, screen_type: id('1'), macroponent: id('2') });
  fake.put('sys_ux_client_script', { sys_id: id('4'), name: 'load stages', sys_scope: SCOPE_ID, macroponent: id('2') });
}

test('export walks forward and reverse references, stays in scope, and lists platform refs as external', async () => {
  const fake = makeFakeInstance();
  seedPage(fake);
  const r = await call(fake, 'sn_ux_export_page', { table: 'sys_ux_screen_type', sys_id: id('1') });
  const tables = r.body.records.map((x) => x.table).sort();
  assert.deepEqual(tables, ['sys_ux_client_script', 'sys_ux_macroponent', 'sys_ux_screen', 'sys_ux_screen_type']);
  assert.deepEqual(r.body.external_refs.map((e) => e.sys_id), [id('9')]);
});

test('export, remap and upsert clones a page into the kiwi update set', async () => {
  const fake = makeFakeInstance();
  seedPage(fake);
  await withKiwiUpdateSet(fake);
  const exported = (await call(fake, 'sn_ux_export_page', { table: 'sys_ux_screen_type', sys_id: id('1') })).body;
  const dry = await call(fake, 'sn_ux_upsert_page', { bundle: exported, remap_ids: true, dry_run: true });
  assert.equal(dry.body.status, 'dry_run');
  assert.ok(dry.body.order.every((o) => o.action === 'insert'));

  const r = await call(fake, 'sn_ux_upsert_page', { bundle: exported, remap_ids: true });
  assert.equal(r.body.status, 'written');
  assert.equal(r.body.written.length, 4);
  assert.ok(r.body.written.every((w) => w.captured_in_update_set === true));
  const newScreen = fake.t('sys_ux_screen').get(r.body.id_map[id('3')]);
  assert.equal(newScreen.macroponent, r.body.id_map[id('2')], 'screen points at the cloned macroponent');
  const newMacro = fake.t('sys_ux_macroponent').get(r.body.id_map[id('2')]);
  assert.match(newMacro.composition, new RegExp(id('9')), 'still uses the platform component');
});

test('upsert refuses a bundle whose external refs are missing on the target instance', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake);
  const bundle = {
    kiwi_bundle: 1,
    records: [{ table: 'sys_ux_screen_type', sys_id: id('5'), values: { name: 'x' } }],
    external_refs: [{ table: 'sys_ux_lib_component', sys_id: id('8'), name: 'Missing' }],
  };
  const r = await call(fake, 'sn_ux_upsert_page', { bundle });
  assert.equal(r.body.status, 'missing_external_refs');
});

test('upsert over an OOTB page needs approval and writes nothing', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake);
  fake.put('sys_ux_screen_type', { sys_id: id('6'), name: 'HR landing', sys_scope: 'c'.repeat(32) });
  const bundle = { kiwi_bundle: 1, records: [{ table: 'sys_ux_screen_type', sys_id: id('6'), values: { name: 'changed' } }] };
  const r = await call(fake, 'sn_ux_upsert_page', { bundle });
  assert.equal(r.body.status, 'needs_approval');
  assert.equal(fake.t('sys_ux_screen_type').get(id('6')).name, 'HR landing');
});
