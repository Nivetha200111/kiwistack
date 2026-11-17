// @ts-check
// A kiwi bundle is a portable set of metadata records (one UI Builder page and the
// sys_ux_* records it owns), plus references to records it expects to already exist.
//
// { kiwi_bundle: 1, source: {...}, root: {table, sys_id},
//   records: [{ table, sys_id, values }], external_refs: [{ table, sys_id, name }] }

import { randomUUID } from 'node:crypto';

export const BUNDLE_VERSION = 1;
const ID_IN_TEXT = /\b[0-9a-f]{32}\b/g;

/** Experience-level records are shared by every page in a workspace, so an export stops at them. */
export const EXTERNAL_UNLESS_ROOT = new Set(['sys_ux_page_registry', 'sys_ux_app_config']);

/** Child records that point at a parent but are not reachable from it by reference. */
export const REVERSE_LOOKUPS = [
  { parent: 'sys_ux_screen_type', child: 'sys_ux_screen', field: 'screen_type' },
  { parent: 'sys_ux_screen_type', child: 'sys_ux_app_route', field: 'screen_type' },
  { parent: 'sys_ux_macroponent', child: 'sys_ux_client_script', field: 'macroponent' },
];

export function newSysId() {
  return randomUUID().replace(/-/g, '');
}

/** Every 32-hex token in any string field except the record's own sys_id. */
export function extractIds(values) {
  const out = new Set();
  for (const [k, v] of Object.entries(values || {})) {
    if (k === 'sys_id' || typeof v !== 'string') continue;
    for (const m of v.matchAll(ID_IN_TEXT)) out.add(m[0]);
  }
  return out;
}

/** Drops instance-managed fields (sys_created_on, sys_scope, sys_update_name...) but keeps sys_id. */
export function stripSystemFields(values) {
  const out = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (k === 'sys_id' || !k.startsWith('sys_')) out[k] = v;
  }
  return out;
}

export function validateBundle(bundle) {
  const errors = [];
  if (!bundle || bundle.kiwi_bundle !== BUNDLE_VERSION) errors.push(`kiwi_bundle must be ${BUNDLE_VERSION}.`);
  if (!Array.isArray(bundle?.records) || !bundle.records.length) errors.push('records must be a non-empty array.');
  const seen = new Set();
  for (const [i, r] of (bundle?.records || []).entries()) {
    if (!r.table || !/^[a-z0-9_]+$/.test(r.table)) errors.push(`records[${i}].table is invalid.`);
    if (!/^[0-9a-f]{32}$/.test(r.sys_id || '')) errors.push(`records[${i}].sys_id must be 32 lowercase hex chars.`);
    if (seen.has(r.sys_id)) errors.push(`records[${i}].sys_id ${r.sys_id} is duplicated.`);
    seen.add(r.sys_id);
    if (!r.values || typeof r.values !== 'object') errors.push(`records[${i}].values must be an object.`);
  }
  for (const [i, e] of (bundle?.external_refs || []).entries()) {
    if (!/^[0-9a-f]{32}$/.test(e.sys_id || '')) errors.push(`external_refs[${i}].sys_id is invalid.`);
  }
  return errors;
}

/** Gives every bundle record a fresh sys_id and rewrites every occurrence, JSON fields included. */
export function remapIds(bundle, gen = newSysId) {
  const map = new Map(bundle.records.map((r) => [r.sys_id, gen()]));
  const swap = (s) => s.replace(ID_IN_TEXT, (id) => map.get(id) || id);
  const records = bundle.records.map((r) => {
    const values = {};
    for (const [k, v] of Object.entries(r.values)) values[k] = typeof v === 'string' ? swap(v) : v;
    const sys_id = map.get(r.sys_id);
    values.sys_id = sys_id;
    return { table: r.table, sys_id, values };
  });
  const root = bundle.root ? { ...bundle.root, sys_id: map.get(bundle.root.sys_id) || bundle.root.sys_id } : undefined;
  return { ...bundle, root, records, id_map: Object.fromEntries(map) };
}

/** Orders records so each one is written after the bundle records it references. Cycles keep input order. */
export function orderRecords(records) {
  const ids = new Set(records.map((r) => r.sys_id));
  const deps = new Map(records.map((r) => [r.sys_id, [...extractIds(r.values)].filter((d) => ids.has(d) && d !== r.sys_id)]));
  const done = new Set();
  const out = [];
  let progressed = true;
  while (out.length < records.length && progressed) {
    progressed = false;
    for (const r of records) {
      if (done.has(r.sys_id)) continue;
      if (deps.get(r.sys_id).every((d) => done.has(d))) {
        done.add(r.sys_id);
        out.push(r);
        progressed = true;
      }
    }
  }
  for (const r of records) if (!done.has(r.sys_id)) out.push(r);
  return out;
}

/**
 * Walks one page's records out from a root, staying inside the root's application scope.
 * Records from other scopes (platform components, the experience) become external_refs.
 */
export async function exportBundle(client, { table, sys_id, maxRecords = 300, host }) {
  const root = await client.get(table, sys_id);
  if (!root) throw new Error(`${table}/${sys_id} not found.`);
  const rootScope = root.sys_scope;
  const records = new Map();
  const externals = new Map();
  const warnings = [];
  const queue = [{ table, sys_id, record: root }];
  const queued = new Set([sys_id]);

  const enqueue = (t, id) => {
    if (queued.has(id) || externals.has(id)) return;
    queued.add(id);
    queue.push({ table: t, sys_id: id });
  };

  while (queue.length) {
    if (records.size >= maxRecords) {
      warnings.push(`Stopped at maxRecords=${maxRecords}; the bundle is incomplete.`);
      break;
    }
    const item = queue.shift();
    const rec = item.record || (await client.get(item.table, item.sys_id));
    if (!rec) {
      warnings.push(`${item.table}/${item.sys_id} is referenced but not readable.`);
      continue;
    }
    records.set(item.sys_id, { table: item.table, sys_id: item.sys_id, values: rec });

    const unknown = [...extractIds(rec)].filter((id) => !queued.has(id) && !externals.has(id));
    for (let i = 0; i < unknown.length; i += 50) {
      const chunk = unknown.slice(i, i + 50);
      const found = await client.query('sys_metadata', {
        query: `sys_idIN${chunk.join(',')}`,
        fields: 'sys_id,sys_class_name,sys_scope,sys_name',
        limit: chunk.length,
      });
      for (const m of found) {
        const sameScope = m.sys_scope === rootScope;
        const isUx = String(m.sys_class_name).startsWith('sys_ux_');
        const stopHere = EXTERNAL_UNLESS_ROOT.has(m.sys_class_name) && m.sys_id !== sys_id;
        if (sameScope && isUx && !stopHere) enqueue(m.sys_class_name, m.sys_id);
        else externals.set(m.sys_id, { table: m.sys_class_name, sys_id: m.sys_id, name: m.sys_name, scope: m.sys_scope });
      }
    }

    for (const rl of REVERSE_LOOKUPS.filter((r) => r.parent === item.table)) {
      try {
        const kids = await client.query(rl.child, { query: `${rl.field}=${item.sys_id}`, fields: 'sys_id,sys_scope', limit: 200 });
        for (const k of kids) if (k.sys_scope === rootScope) enqueue(rl.child, k.sys_id);
      } catch (e) {
        warnings.push(`Reverse lookup ${rl.child}.${rl.field} failed: ${e.message}`);
      }
    }
  }

  return {
    kiwi_bundle: BUNDLE_VERSION,
    source: { host, exported_at: new Date().toISOString(), root_scope: rootScope },
    root: { table, sys_id },
    records: [...records.values()],
    external_refs: [...externals.values()],
    warnings,
  };
}
