#!/usr/bin/env node
// Phase 1 spike: can kiwistack clone a UI Builder page through the Table API?
//
// 1. Build one small page by hand in UI Builder, in the target scope, on the dev instance.
// 2. Run: node tools/spike-ux-roundtrip.mjs --from sys_ux_screen_type:<sys_id> [--instance dev]
// 3. Open both pages in the browser and compare. Record the results in
//    plugins/kiwistack/skills/ui-builder/references/record-model-ux.md under "Verified on".
//
// Writes go through the same guarded tools the agents use: a kiwi/spike-ux-roundtrip update set,
// target scope only. Output (bundles and a diff report) goes to ./spike-out/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../plugins/kiwistack/mcp/servicenow/src/server.mjs';
import { stripSystemFields } from '../plugins/kiwistack/mcp/servicenow/src/bundle.mjs';

/** Exports a page, clones it with fresh ids, re-exports the clone, and diffs the two. */
export async function runSpike({ server, table, sysId, instance, save = () => {}, log = () => {} }) {
  const call = async (name, a) => {
    const res = await server.callTool(name, { instance, ...a });
    const body = JSON.parse(res.content[0].text);
    if (res.isError) throw new Error(`${name}: ${body.error} ${body.message}`);
    return body;
  };

  const info = await call('sn_instance_info', {});
  log(`instance ${info.host} as ${info.user.user_name}, scope ${info.scope.name}`);
  const us = await call('sn_update_set', { action: 'create', name: 'spike-ux-roundtrip', description: 'kiwistack phase 1 spike' });
  log(`update set ${us.update_set.name}${us.reused ? ' (reused)' : ''}`);

  const original = await call('sn_ux_export_page', { table, sys_id: sysId });
  save('original.bundle.json', original);
  log(`exported ${original.records.length} records, ${original.external_refs.length} external refs, ${original.warnings.length} warnings`);
  for (const w of original.warnings) log(`  warning: ${w}`);

  const written = await call('sn_ux_upsert_page', { bundle: original, remap_ids: true });
  save('write.result.json', written);
  if (written.status !== 'written') return { ok: false, stage: 'write', written };
  const uncaptured = written.written.filter((w) => w.captured_in_update_set === false);
  log(`wrote ${written.written.length} records; ${uncaptured.length} not captured in the update set`);

  const clone = await call('sn_ux_export_page', { table, sys_id: written.id_map[sysId] });
  save('clone.bundle.json', clone);

  const idMap = written.id_map;
  const swap = (v) => (typeof v === 'string' ? v.replace(/\b[0-9a-f]{32}\b/g, (id) => idMap[id] || id) : v);
  const cloneById = new Map(clone.records.map((r) => [r.sys_id, r]));
  const diffs = [];
  for (const r of original.records) {
    const c = cloneById.get(idMap[r.sys_id]);
    if (!c) {
      diffs.push({ table: r.table, sys_id: r.sys_id, problem: 'missing in clone export' });
      continue;
    }
    const want = stripSystemFields(r.values);
    const got = stripSystemFields(c.values);
    for (const k of new Set([...Object.keys(want), ...Object.keys(got)])) {
      if (k === 'sys_id') continue;
      if (swap(want[k]) !== got[k]) diffs.push({ table: r.table, field: k, original: swap(want[k]), clone: got[k] });
    }
  }
  save('diff.json', diffs);
  log(`field differences after remapping: ${diffs.length} (see spike-out/diff.json)`);
  return {
    ok: uncaptured.length === 0 && diffs.length === 0,
    records: original.records.length,
    cloneRecords: clone.records.length,
    uncaptured: uncaptured.length,
    diffs,
    newRoot: written.id_map[sysId],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const opt = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const [table, sysId] = String(opt('from') || '').split(':');
  if (!table || !/^[0-9a-f]{32}$/.test(sysId || '')) {
    console.error('Usage: node tools/spike-ux-roundtrip.mjs --from <sys_ux_table>:<sys_id> [--instance <name>]');
    process.exit(2);
  }
  const out = join(process.cwd(), 'spike-out');
  mkdirSync(out, { recursive: true });
  try {
    const result = await runSpike({
      server: createServer(),
      table,
      sysId,
      instance: opt('instance'),
      save: (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 2)),
      log: (...m) => console.log('•', ...m),
    });
    if (result.stage === 'write') {
      console.log('• upsert stopped:', JSON.stringify(result.written, null, 2));
      process.exit(1);
    }
    console.log(`• ${result.ok ? 'Round trip clean.' : 'Round trip has differences.'} New page root: ${result.newRoot}`);
    console.log('• Next: open the original and the cloned page in the browser and compare them.');
    console.log('• Record the results in plugins/kiwistack/skills/ui-builder/references/record-model-ux.md under "Verified on".');
    process.exit(result.ok ? 0 : 1);
  } catch (e) {
    console.error(`• spike failed: ${e.message}`);
    process.exit(1);
  }
}
