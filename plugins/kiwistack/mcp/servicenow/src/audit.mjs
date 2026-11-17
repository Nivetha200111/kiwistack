// @ts-check
// Read-only security and hygiene audit of one scoped application: whoever built it
// (kiwistack, Studio's Build Agent, a person). Each check is independent; a check that
// can't run on this release is reported under `skipped`, never silently dropped.

export const SEVERITY = ['critical', 'high', 'medium', 'low', 'info'];

/** Roles that grant broad power or consume a fulfiller licence when an app role contains them. */
const POWERFUL_ROLES = {
  admin: ['critical', 'grants full admin to everyone who holds the app role'],
  security_admin: ['critical', 'grants security administration'],
  maint: ['critical', 'grants maintenance rights'],
  itil: ['medium', 'makes every holder an ITIL fulfiller, which consumes a licence'],
  itil_admin: ['high', 'grants ITIL administration'],
};

/** Cross-scope targets that let an app call out of the instance or change data broadly. */
const RISKY_SCRIPTABLES = [
  [/^(ScriptableRESTMessageClient|RESTMessageV2|SOAPMessageV2|sn_ws\.)/i, 'high', 'lets the app make outbound HTTP calls'],
  [/setBasicAuth|setMutualAuth|setAuthenticationProfile/i, 'high', 'lets the app send credentials to other systems'],
  [/^GlideSecureRandom|^GlideEncrypter|^GlideCertificateEncryption/i, 'medium', 'gives access to crypto APIs'],
];

const DEFAULT_REST_ACL_NAMES = new Set(['Scripted REST External Default']);
const READS_DATA = /new\s+Glide(Record|Aggregate|Query)\s*\(/;
const SECURE_READ = /GlideRecordSecure|canRead\(\)|hasRole\(|hasRoleExactly\(|hasRoles\(/;

const ids = (rows, field = 'sys_id') => rows.map((r) => r[field]).filter(Boolean);
const csv = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * @param {import('./client.mjs').SnClient} client
 * @param {{ scope: string }} opts
 */
export async function auditApp(client, { scope }) {
  const scopeRow = (await client.query('sys_scope', { query: `scope=${scope}`, fields: 'sys_id,scope,name', limit: 1 }))[0];
  if (!scopeRow) throw Object.assign(new Error(`App scope ${scope} does not exist on this instance.`), { code: 'NO_SCOPE' });
  const S = scopeRow.sys_id;
  const findings = [];
  const checked = [];
  const skipped = [];
  const add = (f) => findings.push(f);

  async function check(name, fn) {
    try {
      const n = await fn();
      checked.push({ check: name, examined: n });
    } catch (e) {
      skipped.push({ check: name, reason: String(/** @type {any} */ (e).message || e).slice(0, 200) });
    }
  }

  await check('rest_endpoints', async () => {
    const ops = await client.query('sys_ws_operation', {
      query: `sys_scope=${S}`,
      fields: 'sys_id,name,http_method,operation_uri,active,requires_authentication,requires_acl_authorization,enforce_acl,operation_script',
      limit: 200,
    });
    const aclIds = [...new Set(ops.flatMap((o) => csv(o.enforce_acl)))];
    const acls = aclIds.length ? await client.query('sys_security_acl', { query: `sys_idIN${aclIds.join(',')}`, fields: 'sys_id,name,script,condition,active', limit: aclIds.length }) : [];
    const aclRoles = aclIds.length ? await client.query('sys_security_acl_role', { query: `sys_security_aclIN${aclIds.join(',')}`, fields: 'sys_security_acl,sys_user_role', limit: 500 }) : [];
    const rolesByAcl = new Map();
    for (const r of aclRoles) rolesByAcl.set(r.sys_security_acl, [...(rolesByAcl.get(r.sys_security_acl) || []), r.sys_user_role]);
    for (const op of ops) {
      const rec = { table: 'sys_ws_operation', sys_id: op.sys_id, name: `${op.http_method || ''} ${op.operation_uri || op.name}`.trim() };
      const script = String(op.operation_script || '');
      const readsData = READS_DATA.test(script);
      const checksAccess = SECURE_READ.test(script);
      if (String(op.requires_authentication) === 'false') {
        add({ severity: 'critical', check: 'rest_endpoints', record: rec, what: 'Endpoint does not require authentication.', why: 'Anyone who can reach the instance can call it.', fix: 'Set "Requires authentication" on the resource.' });
        continue;
      }
      const opAcls = csv(op.enforce_acl).map((id) => acls.find((a) => a.sys_id === id)).filter(Boolean);
      const roleGated = opAcls.some((a) => (rolesByAcl.get(a.sys_id) || []).length > 0);
      const onlyDefault = opAcls.length > 0 && opAcls.every((a) => DEFAULT_REST_ACL_NAMES.has(a.name));
      const noAcl = String(op.requires_acl_authorization) === 'false' || opAcls.length === 0;
      if ((noAcl || onlyDefault) && !roleGated) {
        const who = noAcl ? 'any authenticated user' : 'any internal user, even one with no roles (the default ACL only blocks snc_external)';
        add({
          severity: readsData && !checksAccess ? 'high' : 'medium',
          check: 'rest_endpoints',
          record: rec,
          what: `Callable by ${who}.`,
          why: readsData && !checksAccess
            ? 'Its script reads records with GlideRecord/GlideAggregate and checks no role, so table ACLs are bypassed: every employee can read this data.'
            : 'No role gates the endpoint.',
          fix: 'Add a REST_Endpoint ACL with the app role to "ACLs" on the resource, and read with GlideRecordSecure or check gs.hasRole() in the script.',
        });
      } else if (readsData && !checksAccess) {
        add({ severity: 'low', check: 'rest_endpoints', record: rec, what: 'Script reads with GlideRecord without checking access.', why: 'The endpoint is role-gated, but table ACLs are bypassed for every holder of that role.', fix: 'Use GlideRecordSecure, or check canRead() per record.' });
      }
    }
    return ops.length;
  });

  await check('cross_scope_privileges', async () => {
    const privs = await client.query('sys_scope_privilege', { query: `source_scope=${S}^status=allowed`, fields: 'sys_id,target_name,target_type,operation', limit: 500 });
    // One finding per risky rule (setEndpoint/execute/setBasicAuth... belong together), naming every target.
    const byRule = new Map();
    for (const p of privs) {
      const rec = { table: 'sys_scope_privilege', sys_id: p.sys_id, name: `${p.operation} ${p.target_name}` };
      const risky = RISKY_SCRIPTABLES.find(([re]) => re.test(p.target_name));
      if (risky) {
        const key = risky[2];
        byRule.set(key, { risky, recs: [...(byRule.get(key)?.recs || []), rec], targets: [...(byRule.get(key)?.targets || []), p.target_name] });
      } else if (p.target_type === 'sys_db_object' && /^(write|create|delete)$/.test(p.operation)) {
        add({ severity: 'medium', check: 'cross_scope_privileges', record: rec, what: `Cross-scope ${p.operation} on table ${p.target_name}.`, why: 'The app can change records another application owns.', fix: 'Confirm it is needed, or route the change through the owning app\'s API.' });
      }
    }
    for (const { risky, recs, targets } of byRule.values()) {
      add({
        severity: risky[1],
        check: 'cross_scope_privileges',
        record: recs[0],
        records: recs,
        what: `Cross-scope privilege${targets.length > 1 ? 's' : ''} on ${targets.join(', ')}.`,
        why: `This ${risky[2]}.`,
        fix: 'Remove them unless the app really needs them; they are often left behind by generated test or diagnostic code.',
      });
    }
    if (privs.length >= 10) {
      add({ severity: 'low', check: 'cross_scope_privileges', record: { table: 'sys_scope', sys_id: S, name: scopeRow.name }, what: `${privs.length} cross-scope privileges are granted.`, why: 'Runtime-granted privileges accumulate silently and widen what the app can touch.', fix: 'Review the list and delete the ones the app no longer uses.' });
    }
    return privs.length;
  });

  await check('table_acls', async () => {
    const tables = await client.query('sys_db_object', { query: `sys_scope=${S}`, fields: 'sys_id,name,label', limit: 200 });
    for (const t of tables) {
      const acls = await client.query('sys_security_acl', { query: `nameSTARTSWITH${t.name}^type=record^active=true`, fields: 'name,operation', limit: 50 });
      const ops = new Set(acls.filter((a) => a.name === t.name || a.name.startsWith(`${t.name}.`)).map((a) => a.operation));
      const missing = ['read', 'write', 'create', 'delete'].filter((op) => !ops.has(op));
      if (missing.length) {
        add({ severity: missing.includes('read') ? 'high' : 'medium', check: 'table_acls', record: { table: 'sys_db_object', sys_id: t.sys_id, name: t.name }, what: `No ${missing.join('/')} ACL on ${t.name}.`, why: 'Access then falls back to the instance default, which is rarely what the app intends.', fix: `Add record ACLs for ${missing.join(', ')} tied to the app's roles.` });
      }
    }
    return tables.length;
  });

  await check('data_brokers', async () => {
    let n = 0;
    for (const table of ['sys_ux_data_broker_transform', 'sys_ux_data_broker_scriptlet']) {
      const brokers = await client.query(table, { query: `sys_scope=${S}`, fields: 'sys_id,name', limit: 200 });
      n += brokers.length;
      for (const b of brokers) {
        const acl = await client.query('sys_security_acl', { query: `type=ux_data_broker^name=${b.sys_id}^active=true`, fields: 'sys_id', limit: 1 });
        if (!acl.length) {
          add({ severity: 'medium', check: 'data_brokers', record: { table, sys_id: b.sys_id, name: b.name }, what: 'Data broker has no execute ACL.', why: 'It is denied to everyone, admin included: any page using it renders no data. If it is unused, it is dead code.', fix: 'Add a ux_data_broker execute ACL for the page audience role, or delete the broker if nothing uses it.' });
        }
      }
    }
    return n;
  });

  await check('client_callable_script_includes', async () => {
    const sis = await client.query('sys_script_include', { query: `sys_scope=${S}^client_callable=true^active=true`, fields: 'sys_id,name,script', limit: 200 });
    for (const si of sis) {
      if (!SECURE_READ.test(String(si.script || ''))) {
        add({ severity: 'high', check: 'client_callable_script_includes', record: { table: 'sys_script_include', sys_id: si.sys_id, name: si.name }, what: 'Client-callable script include checks no role.', why: 'Any logged-in user can call it from the browser with GlideAjax.', fix: 'Check gs.hasRole() in each method, or make it not client-callable.' });
      }
    }
    return sis.length;
  });

  await check('app_roles', async () => {
    const roles = await client.query('sys_user_role', { query: `sys_scope=${S}`, fields: 'sys_id,name', limit: 200 });
    if (!roles.length) return 0;
    const contains = await client.query('sys_user_role_contains', { query: `roleIN${ids(roles).join(',')}`, fields: 'role,contains', limit: 500 });
    const inner = contains.length ? await client.query('sys_user_role', { query: `sys_idIN${[...new Set(ids(contains, 'contains'))].join(',')}`, fields: 'sys_id,name', limit: 500 }) : [];
    for (const c of contains) {
      const innerName = inner.find((r) => r.sys_id === c.contains)?.name;
      const hit = innerName && POWERFUL_ROLES[innerName];
      if (hit) {
        const outer = roles.find((r) => r.sys_id === c.role);
        add({ severity: hit[0], check: 'app_roles', record: { table: 'sys_user_role', sys_id: c.role, name: outer?.name }, what: `Role ${outer?.name} contains ${innerName}.`, why: `Granting the app role ${hit[1]}.`, fix: `Remove ${innerName} from the role and grant only what the app needs.` });
      }
    }
    return roles.length;
  });

  await check('atf_coverage', async () => {
    const tests = await client.query('sys_atf_test', { query: `sys_scope=${S}^active=true`, fields: 'sys_id', limit: 1000 });
    if (!tests.length) {
      add({ severity: 'medium', check: 'atf_coverage', record: { table: 'sys_scope', sys_id: S, name: scopeRow.name }, what: 'The app has no active ATF tests.', why: 'Nothing proves the app still works after an upgrade or a change, and access rules are untested.', fix: 'Add ATF tests for the main behaviour and an impersonation test that a user without the role is refused.' });
    }
    return tests.length;
  });

  await check('default_update_set', async () => {
    const sets = await client.query('sys_update_set', { query: `application=${S}^is_default=true`, fields: 'sys_id,name', limit: 5 });
    if (!sets.length) return 0;
    const entries = await client.query('sys_update_xml', { query: `update_setIN${ids(sets).join(',')}`, fields: 'sys_id,name', limit: 1000 });
    if (entries.length) {
      add({ severity: 'low', check: 'default_update_set', record: { table: 'sys_update_set', sys_id: sets[0].sys_id, name: `${scopeRow.name} Default` }, what: `${entries.length} change(s) sit in the app's Default update set.`, why: 'Changes in Default are easy to miss when the app moves to the next instance.', fix: 'Move them into a named update set, or confirm the app moves by publishing rather than by update sets.' });
    }
    return entries.length;
  });

  findings.sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));
  const summary = Object.fromEntries(SEVERITY.map((s) => [s, findings.filter((f) => f.severity === s).length]));
  return { app: { scope: scopeRow.scope, name: scopeRow.name, sys_id: S }, summary, findings, checked, skipped };
}
