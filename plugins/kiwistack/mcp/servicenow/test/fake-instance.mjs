// In-memory stand-in for a ServiceNow instance's Table API, OAuth and capture behaviour.
// Supports the encoded-query operators the server uses: =, !=, IN, STARTSWITH, LIKE, ISNOTEMPTY, ^OR, ORDERBY.
import { Guard } from '../src/guard.mjs';
import { SnClient } from '../src/client.mjs';
import { newSysId } from '../src/bundle.mjs';

export const USER_ID = 'a'.repeat(32);
export const SCOPE_ID = 'b'.repeat(32);
export const OTHER_SCOPE_ID = 'c'.repeat(32);

const METADATA_TABLES = ['sys_ux_app_config', 'sys_ux_screen', 'sys_ux_screen_type', 'sys_ux_macroponent', 'sys_ux_app_route', 'sys_ux_client_script', 'sys_ux_lib_component', 'sys_ux_data_broker_transform', 'sys_script', 'sys_script_include', 'sys_atf_step', 'sys_atf_schedule', 'sys_security_acl', 'sys_ux_event', 'sys_ux_client_script_include', 'sys_ux_applicability', 'sys_ux_applicability_m2m_screen', 'sys_ux_page_registry', 'sys_ux_data_broker_graphql', 'sys_user_role'];

/**
 * Options:
 * - production: the glide.installation.production value.
 * - capture: whether metadata writes are captured in the current update set.
 * - updateSetApp: forces the application a new update set gets (a real instance stamps
 *   apps.current_app and ignores the application sent in the body).
 * - deny: tables whose Table API calls fail with 403, like an API-level ACL.
 * - hiddenFromMetadata: sys_ids that the sys_metadata query does not return.
 * - routes: { 'METHOD /path': (url, body) => ({ status, body }) } for non-Table APIs.
 */
export function makeFakeInstance({ production = false, capture = true, updateSetApp, deny = [], hiddenFromMetadata = [], routes = {} } = {}) {
  const tables = new Map();
  const t = (name) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  };
  const put = (table, rec) => {
    t(table).set(rec.sys_id, { ...rec });
    if (METADATA_TABLES.includes(table)) t('sys_metadata').set(rec.sys_id, { sys_id: rec.sys_id, sys_class_name: table, sys_scope: rec.sys_scope, sys_name: rec.name || rec.sys_id });
  };

  // schema: every metadata table extends sys_metadata; incident extends task.
  put('sys_db_object', { sys_id: newSysId(), name: 'sys_metadata', super_class: '' });
  const metaObj = [...t('sys_db_object').values()][0].sys_id;
  for (const name of METADATA_TABLES) put('sys_db_object', { sys_id: newSysId(), name, super_class: metaObj });
  put('sys_db_object', { sys_id: 'd'.repeat(32), name: 'task', super_class: '' });
  put('sys_db_object', { sys_id: newSysId(), name: 'incident', super_class: 'd'.repeat(32) });
  put('sys_db_object', { sys_id: newSysId(), name: 'sys_variable_value', super_class: '' });

  put('sys_user', { sys_id: USER_ID, user_name: 'kiwi.agent', name: 'Kiwi Agent' });
  put('sys_scope', { sys_id: SCOPE_ID, scope: 'x_kiwi_demo', name: 'Kiwi Demo' });
  put('sys_scope', { sys_id: OTHER_SCOPE_ID, scope: 'sn_hr_core', name: 'HR Core' });
  put('sys_properties', { sys_id: newSysId(), name: 'glide.installation.production', value: String(production) });

  const prefs = () => [...t('sys_user_preference').values()].filter((p) => p.user === USER_ID);
  const pref = (name) => prefs().find((p) => p.name === name)?.value;

  const matches = (rec, query) => {
    if (!query) return true;
    // ^OR joins a condition to the one before it: a^bLIKEx^ORcLIKEx is a AND (b OR c).
    const groups = [];
    for (const cond of query.split('^')) {
      if (cond.startsWith('OR') && !cond.startsWith('ORDERBY') && groups.length) groups[groups.length - 1].push(cond.slice(2));
      else groups.push([cond]);
    }
    return groups.every((g) => g.some((cond) => one(rec, cond)));
  };
  const one = (rec, cond) => {
    if (!cond || cond.startsWith('ORDERBY')) return true;
    let m;
    if ((m = cond.match(/^(\w+)ISNOTEMPTY$/))) return Boolean(rec[m[1]]);
    if ((m = cond.match(/^(\w+)IN(.*)$/))) return m[2].split(',').includes(String(rec[m[1]] ?? ''));
    if ((m = cond.match(/^(\w+)STARTSWITH(.*)$/))) return String(rec[m[1]] ?? '').startsWith(m[2]);
    if ((m = cond.match(/^(\w+)LIKE(.*)$/))) return String(rec[m[1]] ?? '').includes(m[2]);
    if ((m = cond.match(/^(\w+)!=(.*)$/))) return String(rec[m[1]] ?? '') !== m[2];
    if ((m = cond.match(/^(\w+)=(.*)$/))) {
      const want = m[2] === 'javascript:gs.getUserID()' ? USER_ID : m[2];
      return String(rec[m[1]] ?? '') === want;
    }
    throw new Error(`fake instance cannot parse "${cond}"`);
  };
  const pick = (rec, fields) => {
    if (!fields) return { ...rec };
    const out = {};
    for (const f of fields.split(',')) if (f in rec) out[f] = rec[f];
    return out;
  };

  const calls = [];
  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push(`${method} ${u.pathname}`);
    const json = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
    if (u.pathname === '/oauth_token.do') return json(200, { access_token: 'token', expires_in: 1800 });
    const route = routes[`${method} ${u.pathname}`];
    if (route) {
      const r = route(u, init.body ? JSON.parse(init.body) : undefined);
      return json(r.status, r.body);
    }
    const m = u.pathname.match(/^\/api\/now\/table\/(\w+)(?:\/(\w+))?$/);
    if (!m) return json(404, { error: { message: 'no route' } });
    const [, table, id] = m;
    if (deny.includes(table)) return json(403, { error: { message: 'User Not Authorized', detail: `Access to ${table} is blocked by an API-level ACL.` } });
    const fields = u.searchParams.get('sysparm_fields') || undefined;
    if (method === 'GET' && id) {
      const rec = t(table).get(id);
      return rec ? json(200, { result: pick(rec, fields) }) : json(404, { error: { message: 'No Record found' } });
    }
    if (method === 'GET') {
      const q = u.searchParams.get('sysparm_query') || '';
      const limit = Number(u.searchParams.get('sysparm_limit') || 10000);
      const rows = [...t(table).values()]
        .filter((r) => !(table === 'sys_metadata' && hiddenFromMetadata.includes(r.sys_id)))
        .filter((r) => matches(r, q))
        .slice(0, limit)
        .map((r) => pick(r, fields));
      return json(200, { result: rows });
    }
    const body = init.body ? JSON.parse(init.body) : {};
    const scoped = METADATA_TABLES.includes(table);
    const currentApp = pref('apps.current_app');
    const currentSet = pref(`updateSetForScope${currentApp}`) || pref('sys_update_set');
    // Variable values (ATF step inputs) are captured as part of their parent record.
    const captureName = (rec) =>
      scoped ? `${table}_${rec.sys_id}` : table === 'sys_variable_value' && METADATA_TABLES.includes(rec.document) ? `${rec.document}_${rec.document_key}` : null;
    const recordCapture = (rec) => {
      const name = captureName(rec);
      if (name && capture && currentSet) put('sys_update_xml', { sys_id: newSysId(), update_set: currentSet, name, action: 'INSERT_OR_UPDATE' });
    };
    if (method === 'POST') {
      const rec = { ...body, sys_id: body.sys_id || newSysId(), ...(scoped ? { sys_scope: currentApp || 'global' } : {}) };
      if (table === 'sys_update_set') rec.application = updateSetApp || currentApp || 'global';
      put(table, rec);
      recordCapture(rec);
      return json(201, { result: rec });
    }
    if (method === 'PATCH') {
      const rec = t(table).get(id);
      if (!rec) return json(404, { error: { message: 'No Record found' } });
      Object.assign(rec, body);
      put(table, rec);
      recordCapture(rec);
      return json(200, { result: rec });
    }
    if (method === 'DELETE') {
      t(table).delete(id);
      return json(204);
    }
    return json(405, { error: { message: 'method' } });
  }

  const instance = {
    name: 'dev',
    host: 'kiwi-dev.service-now.com',
    environment: 'dev',
    scope: 'x_kiwi_demo',
    auth: { grant: 'client_credentials', client_id_env: 'X', client_secret_env: 'Y' },
  };
  const tokens = { token: async () => 'token', invalidate() {} };
  const client = new SnClient({ host: instance.host, tokens, fetchImpl });
  const guard = new Guard({ instance, client });
  return { tables, put, t, fetchImpl, calls, instance, client, guard, ctx: { instance, client, guard } };
}

/** Adds an in-progress update set for the target scope and makes it current. */
export async function withKiwiUpdateSet(fake, { name = 'kiwi/test', application = SCOPE_ID } = {}) {
  const us = { sys_id: newSysId(), name, state: 'in progress', application, is_default: 'false' };
  fake.put('sys_update_set', us);
  await fake.guard.setCurrentUpdateSet(us.sys_id);
  return us;
}
