import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.mjs';
import { newSysId } from '../src/bundle.mjs';
import { makeFakeInstance, withKiwiUpdateSet, SCOPE_ID, OTHER_SCOPE_ID } from './fake-instance.mjs';

const call = async (fake, name, args) => {
  const server = createServer({ contextFor: () => fake.ctx });
  const res = await server.callTool(name, args);
  return { isError: Boolean(res.isError), body: JSON.parse(res.content[0].text) };
};
const START = '2026-11-17 12:00:00';

test('capture_audit passes when every in-scope change since the run start is in the update set', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake);
  fake.clock.set('2026-11-17 12:05:00');
  await call(fake, 'sn_upsert', { table: 'sys_script', values: { name: 'Generate tasks' } });
  const r = await call(fake, 'sn_update_set', { action: 'capture_audit', since: START });
  assert.equal(r.isError, false);
  assert.equal(r.body.verdict, 'ALL_CAPTURED');
  assert.equal(r.body.changed, 1);
  assert.deepEqual(r.body.uncaptured, []);
});

test('capture_audit catches writes made outside the server, and says where they went', async () => {
  const fake = makeFakeInstance();
  const kiwi = await withKiwiUpdateSet(fake, { name: 'kiwi/hrsd' });
  // An ACL installed by the SDK, in no update set (what the HRSD run did).
  fake.put('sys_security_acl', { sys_id: newSysId(), name: 'x_kiwi_demo_case.read', sys_scope: SCOPE_ID, sys_updated_on: '2026-11-17 13:19:38' });
  // A record another run captured in its own update set.
  const other = { sys_id: newSysId(), name: 'kiwi/laptop', state: 'in progress', application: SCOPE_ID };
  fake.put('sys_update_set', other);
  const br = { sys_id: newSysId(), name: 'Laptop rule', sys_scope: SCOPE_ID, sys_updated_on: '2026-11-17 13:30:00' };
  fake.put('sys_script', br);
  fake.put('sys_update_xml', { sys_id: newSysId(), update_set: other.sys_id, name: `sys_script_${br.sys_id}` });
  // Ignored: before the run, and another scope.
  fake.put('sys_script', { sys_id: newSysId(), name: 'Old rule', sys_scope: SCOPE_ID, sys_updated_on: '2026-11-16 09:00:00' });
  fake.put('sys_script', { sys_id: newSysId(), name: 'HR rule', sys_scope: OTHER_SCOPE_ID, sys_updated_on: '2026-11-17 13:00:00' });

  const r = await call(fake, 'sn_update_set', { action: 'capture_audit', sys_id: kiwi.sys_id, since: START, until: '2026-11-17 14:36:03' });
  assert.equal(r.body.verdict, 'UNCAPTURED');
  assert.equal(r.body.changed, 2);
  assert.equal(r.body.captured, 0);
  const byTable = Object.fromEntries(r.body.uncaptured.map((u) => [u.table, u]));
  assert.deepEqual(byTable.sys_security_acl.captured_in, [], 'the SDK ACL is in no update set');
  assert.deepEqual(byTable.sys_script.captured_in, ['kiwi/laptop'], 'the other run\'s record names its update set');
  assert.match(r.body.next_step, /Never call the build done/);
});

test('capture_audit rejects a since that is not in the API date-time format', async () => {
  const fake = makeFakeInstance();
  await withKiwiUpdateSet(fake);
  for (const since of [undefined, '2026-11-17T12:00:00Z', 'yesterday']) {
    const r = await call(fake, 'sn_update_set', { action: 'capture_audit', since });
    assert.equal(r.body.error, 'BAD_INPUT', String(since));
  }
});
