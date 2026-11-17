import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.mjs';
import { TOOLS } from '../src/tools.mjs';

test('initialize, tools/list and notifications follow MCP', async () => {
  const s = createServer({ contextFor: () => ({}) });
  const init = await s.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(init.result.serverInfo.name, 'kiwistack-servicenow');
  assert.equal(await s.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const list = await s.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(list.result.tools.length, TOOLS.length);
  for (const t of list.result.tools) assert.equal(t.inputSchema.type, 'object', t.name);
  const unknown = await s.handle({ jsonrpc: '2.0', id: 3, method: 'nope' });
  assert.equal(unknown.error.code, -32601);
});

test('component catalog searches component macroponents by name, not every library record', async () => {
  const { makeFakeInstance } = await import('./fake-instance.mjs');
  const fake = makeFakeInstance();
  fake.put('sys_ux_macroponent', { sys_id: '1'.repeat(32), name: 'Highlighted value', category: 'primitives', sys_scope: 'global' });
  fake.put('sys_ux_macroponent', { sys_id: '2'.repeat(32), name: 'Data Visualization', category: 'component', sys_scope: 'global' });
  fake.put('sys_ux_macroponent', { sys_id: '3'.repeat(32), name: 'Highlighted page', category: 'page', sys_scope: 'global' });
  const res = await createServer({ contextFor: () => fake.ctx }).callTool('sn_component_catalog', { search: 'Highlighted' });
  const body = JSON.parse(res.content[0].text);
  assert.deepEqual(body.components.map((c) => c.name), ['Highlighted value']);
});

test('every tool that writes exposes user_approved; read tools do not', () => {
  const writers = new Set(['sn_upsert', 'sn_delete', 'sn_ux_upsert_page', 'sn_ux_build_page']);
  for (const t of TOOLS) assert.equal('user_approved' in t.inputSchema.properties, writers.has(t.name), t.name);
});

test('the stdio server answers over a real pipe and reports missing config as a tool error', async () => {
  const home = mkdtempSync(join(tmpdir(), 'kiwi-'));
  const entry = fileURLToPath(new URL('../src/index.mjs', import.meta.url));
  const child = spawn(process.execPath, [entry], { env: { ...process.env, KIWISTACK_HOME: home }, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  child.stdout.setEncoding('utf8');
  let buf = '';
  const got = new Promise((resolve) => {
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        lines.push(JSON.parse(buf.slice(0, i)));
        buf = buf.slice(i + 1);
        if (lines.length === 2) resolve();
      }
    });
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'sn_instance_info', arguments: {} } }) + '\n');
  await got;
  child.kill();
  assert.equal(lines[0].id, 1);
  assert.equal(lines[1].result.isError, true);
  assert.match(JSON.parse(lines[1].result.content[0].text).message, /setup-kiwistack/);
});
