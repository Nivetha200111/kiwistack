import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.mjs';
import { runSpike } from '../../../../../tools/spike-ux-roundtrip.mjs';
import { makeFakeInstance, SCOPE_ID } from './fake-instance.mjs';

test('the phase 1 spike round-trips a page cleanly against the fake instance', async () => {
  const fake = makeFakeInstance();
  const id = (c) => c.repeat(32);
  fake.put('sys_ux_lib_component', { sys_id: id('9'), name: 'Stepper', sys_scope: 'global' });
  fake.put('sys_ux_screen_type', { sys_id: id('1'), name: 'Spike page', sys_scope: SCOPE_ID });
  fake.put('sys_ux_macroponent', { sys_id: id('2'), name: 'Spike page default', sys_scope: SCOPE_ID, composition: JSON.stringify([{ elementId: 'stepper_1', definition: { id: id('9') } }]) });
  fake.put('sys_ux_screen', { sys_id: id('3'), name: 'Default', sys_scope: SCOPE_ID, screen_type: id('1'), macroponent: id('2') });

  const saved = {};
  const result = await runSpike({
    server: createServer({ contextFor: () => fake.ctx }),
    table: 'sys_ux_screen_type',
    sysId: id('1'),
    save: (name, data) => (saved[name] = data),
  });
  assert.equal(result.ok, true, JSON.stringify(result.diffs));
  assert.equal(result.records, 3);
  assert.equal(result.cloneRecords, 3);
  assert.ok(saved['original.bundle.json'] && saved['clone.bundle.json'] && saved['diff.json']);
  assert.notEqual(result.newRoot, id('1'));
});
