// @ts-check
import { SYS_ID } from './client.mjs';
import { GuardError, CHILD_OF_METADATA } from './guard.mjs';
import { readJsonFile, valuesFromFiles, writeJsonFile } from './files.mjs';
import { exportBundle, orderRecords, remapIds, stripSystemFields, validateBundle } from './bundle.mjs';
import { auditApp } from './audit.mjs';
import { compileBoard, normalizeSpec } from './pagegen.mjs';

const instanceProp = {
  instance: { type: 'string', description: 'Instance profile name from ~/.kiwistack/config.json. Omit for the default.' },
};
const approvedProp = {
  user_approved: {
    type: 'boolean',
    description: 'Set only after the user approved this exact change in chat. Triggers a permission prompt.',
  },
};

function needsApproval(reasons, what) {
  return {
    status: 'needs_approval',
    what,
    reasons,
    next_step: 'Explain the reasons to the user in chat. If they agree, repeat the call with user_approved: true; Claude Code will show them a permission prompt.',
  };
}

function assertTable(name) {
  if (!/^[a-z0-9_]+$/.test(name || '')) throw new GuardError('BAD_INPUT', `"${name}" is not a valid table name.`);
}
function assertSysId(id) {
  if (!SYS_ID.test(id || '')) throw new GuardError('BAD_INPUT', `"${id}" is not a 32-character sys_id.`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Update set entries for ATF schedule records, which a CI/CD suite run creates as a side effect. */
async function atfScheduleEntries(client, updateSetId) {
  return client.query('sys_update_xml', { query: `update_set=${updateSetId}^nameSTARTSWITHsys_atf_schedule`, fields: 'name,type,target_name,action', limit: 100 });
}

/** @type {Array<{name: string, description: string, inputSchema: any, handler: (args: any, ctx: any) => Promise<any>}>} */
export const TOOLS = [
  {
    name: 'sn_instance_info',
    description: 'Who and where kiwistack is connected: host, environment, acting user, target scope and the current update set. Call this first in every task.',
    inputSchema: { type: 'object', properties: { ...instanceProp } },
    async handler(_args, { instance, client, guard }) {
      await guard.assertInstance();
      const [user, scopeId, us] = await Promise.all([client.currentUser(), guard.scopeId(), guard.currentUpdateSet()]);
      const problem = !us
        ? 'No current update set. Create one with sn_update_set action "create".'
        : us.name === 'Default' || String(us.is_default) === 'true'
          ? 'The current update set is Default.'
          : us.state !== 'in progress'
            ? `The current update set is ${us.state}.`
            : us.application !== scopeId
              ? `The current update set belongs to application ${us.application}, not ${instance.scope} (${scopeId}).`
              : null;
      return {
        instance: instance.name,
        host: instance.host,
        environment: instance.environment,
        user: { sys_id: user.sys_id, user_name: user.user_name },
        scope: { name: instance.scope, sys_id: scopeId },
        current_update_set: us,
        update_set_ok: !problem,
        ...(problem ? { update_set_problem: problem } : {}),
      };
    },
  },
  {
    name: 'sn_query',
    description: 'Query any table with an encoded query. Returns raw values (sys_ids for references). Keep fields and limit small.',
    inputSchema: {
      type: 'object',
      required: ['table'],
      properties: {
        ...instanceProp,
        table: { type: 'string' },
        query: { type: 'string', description: 'Encoded query, e.g. active=true^priority=1' },
        fields: { type: 'string', description: 'Comma-separated field names.' },
        limit: { type: 'integer', default: 20, maximum: 1000 },
        offset: { type: 'integer' },
        order_by: { type: 'string', description: 'Field to sort by.' },
        order_desc: { type: 'boolean', default: false },
      },
    },
    async handler(a, { client, guard }) {
      assertTable(a.table);
      await guard.assertInstance();
      const query = a.order_by && a.order_desc ? [a.query, `ORDERBYDESC${a.order_by}`].filter(Boolean).join('^') : a.query;
      const orderBy = a.order_desc ? undefined : a.order_by;
      const rows = await client.query(a.table, { query, fields: a.fields, limit: a.limit ?? 20, offset: a.offset, orderBy });
      return { count: rows.length, rows };
    },
  },
  {
    name: 'sn_get',
    description: 'Read one record by sys_id, all fields or the listed ones. Long field values are cut at max_field_chars; use out_path to get the whole record as a file.',
    inputSchema: {
      type: 'object',
      required: ['table', 'sys_id'],
      properties: {
        ...instanceProp,
        table: { type: 'string' },
        sys_id: { type: 'string' },
        fields: { type: 'string' },
        max_field_chars: { type: 'integer', default: 4000, description: 'Longer string values are truncated in the reply and listed in truncated_fields.' },
        out_path: { type: 'string', description: 'Absolute .json path. Writes the full record there and returns field sizes instead.' },
      },
    },
    async handler(a, { client, guard }) {
      assertTable(a.table);
      assertSysId(a.sys_id);
      await guard.assertInstance();
      const record = await client.get(a.table, a.sys_id, a.fields);
      if (!record) return { record: null };
      if (a.out_path) {
        const bytes = writeJsonFile(a.out_path, record);
        const field_chars = Object.fromEntries(Object.entries(record).map(([k, v]) => [k, String(v ?? '').length]));
        return { status: 'written', out_path: a.out_path, bytes, field_chars };
      }
      const max = a.max_field_chars ?? 4000;
      const truncated = {};
      for (const [k, v] of Object.entries(record)) {
        if (typeof v === 'string' && v.length > max) {
          truncated[k] = v.length;
          record[k] = `${v.slice(0, max)}... [truncated: ${v.length} chars]`;
        }
      }
      return { record, ...(Object.keys(truncated).length ? { truncated_fields: truncated, hint: 'Pass out_path to read the full values from a file.' } : {}) };
    },
  },
  {
    name: 'sn_schema',
    description: 'Fields of a table including inherited ones (sys_dictionary), with types, references and mandatory flags. Optionally choice values.',
    inputSchema: {
      type: 'object',
      required: ['table'],
      properties: { ...instanceProp, table: { type: 'string' }, include_choices: { type: 'boolean', default: false } },
    },
    async handler(a, { client, guard }) {
      assertTable(a.table);
      await guard.assertInstance();
      const hierarchy = await guard.tableHierarchy(a.table);
      const fields = await client.query('sys_dictionary', {
        query: `nameIN${hierarchy.join(',')}^elementISNOTEMPTY`,
        fields: 'name,element,column_label,internal_type,reference,mandatory,max_length,active',
        limit: 1000,
      });
      const out = { table: a.table, hierarchy, fields };
      if (a.include_choices) {
        out.choices = await client.query('sys_choice', {
          query: `nameIN${hierarchy.join(',')}^inactive=false`,
          fields: 'name,element,value,label,sequence',
          limit: 1000,
        });
      }
      return out;
    },
  },
  {
    name: 'sn_plugins',
    description: 'Which plugins, store apps and workspaces are installed and active (for example HRSD, CSM, Service Operations Workspace). search matches plugin names and ids, app names and scopes, and workspace titles and URL paths (e.g. "sow"). Use before designing anything module-specific.',
    inputSchema: { type: 'object', properties: { ...instanceProp, search: { type: 'string', description: 'Substring of a name, id, scope, or workspace path.' } } },
    async handler(a, { client, guard }) {
      await guard.assertInstance();
      const s = a.search ? `^nameLIKE${a.search}^ORidLIKE${a.search}` : '';
      const ss = a.search ? `^nameLIKE${a.search}^ORscopeLIKE${a.search}` : '';
      const out = { plugins: [], store_apps: [], experiences: [], warnings: [] };
      try {
        out.plugins = await client.query('v_plugin', { query: `active=active${s}`, fields: 'id,name,active,version', limit: 200 });
      } catch (e) {
        out.warnings.push(`v_plugin: ${e.message}`);
      }
      try {
        out.store_apps = await client.query('sys_store_app', { query: `active=true${ss}`, fields: 'name,scope,version', limit: 200 });
      } catch (e) {
        // sys_store_app is often blocked for REST by an API-level ACL; its parent sys_scope is readable.
        try {
          out.store_apps = await client.query('sys_scope', { query: `active=true${ss}`, fields: 'name,scope,version,sys_class_name', limit: 200 });
          out.warnings.push(`sys_store_app is not readable (${e.message}); store_apps come from sys_scope instead, which also lists custom apps.`);
        } catch (e2) {
          out.warnings.push(`sys_store_app: ${e.message}; sys_scope: ${e2.message}`);
        }
      }
      try {
        // Workspaces are store apps whose names rarely contain their short name, but their URL path does (/now/sow).
        const rs = a.search ? `^pathLIKE${a.search}^ORtitleLIKE${a.search}` : '';
        out.experiences = await client.query('sys_ux_page_registry', { query: `active=true${rs}`, fields: 'sys_id,title,path,sys_scope', limit: a.search ? 50 : 200 });
      } catch (e) {
        out.warnings.push(`sys_ux_page_registry: ${e.message}`);
      }
      return out;
    },
  },
  {
    name: 'sn_component_catalog',
    description: 'Next Experience components available to UI Builder on this instance: the component and primitive macroponents (sys_ux_macroponent) that page compositions reference by sys_id in definition.id. Only design with components listed here.',
    inputSchema: { type: 'object', properties: { ...instanceProp, search: { type: 'string', description: 'Substring of the component name, e.g. "Highlighted value".' }, limit: { type: 'integer', default: 100 } } },
    async handler(a, { client, guard }) {
      await guard.assertInstance();
      const q = ['categoryINcomponent,primitives', a.search ? `nameLIKE${a.search}` : ''].filter(Boolean).join('^');
      const rows = await client.query('sys_ux_macroponent', { query: q, fields: 'sys_id,name,category,sys_scope', limit: a.limit ?? 100, orderBy: 'name' });
      return { count: rows.length, components: rows };
    },
  },
  {
    name: 'sn_update_set',
    description: 'Manage the update set every write lands in. Actions: current, create (name is prefixed kiwi/), set_current, contents.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        ...instanceProp,
        action: { type: 'string', enum: ['current', 'create', 'set_current', 'contents'] },
        name: { type: 'string', description: 'For create: short task slug.' },
        description: { type: 'string' },
        sys_id: { type: 'string', description: 'For set_current or contents.' },
      },
    },
    async handler(a, { instance, client, guard }) {
      await guard.assertInstance();
      if (a.action === 'current') return { update_set: await guard.currentUpdateSet() };
      if (a.action === 'create') {
        if (!a.name) throw new GuardError('BAD_INPUT', 'create needs a name.');
        const name = a.name.startsWith('kiwi/') ? a.name : `kiwi/${a.name}`;
        const scopeId = await guard.scopeId();
        const existing = await client.query('sys_update_set', { query: `name=${name}^application=${scopeId}^state=in progress`, fields: 'sys_id,name,state,application', limit: 1 });
        let us = existing[0];
        if (!us) {
          // The instance stamps a new update set with the session's current application and
          // ignores the application sent in the body, so switch the application first.
          await guard.setCurrentApplication();
          const inserted = await client.insert('sys_update_set', { name, application: scopeId, state: 'in progress', description: a.description || 'Created by kiwistack.' });
          us = (await client.get('sys_update_set', inserted.sys_id, 'sys_id,name,state,application')) || inserted;
          if (us.application !== scopeId) {
            throw new GuardError(
              'UPDATE_SET_SCOPE_MISMATCH',
              `The instance created update set "${name}" (${us.sys_id}) in application ${us.application || '(empty)'}, not ${instance.scope} (${scopeId}). It was not made current, and nothing was written into it. Ask the user before deleting it; check that the acting user can switch to ${instance.scope} (apps.current_app).`,
            );
          }
        }
        await guard.setCurrentUpdateSet(us.sys_id);
        const current = await guard.currentUpdateSet();
        if (current?.sys_id !== us.sys_id) {
          throw new GuardError('UPDATE_SET_NOT_CURRENT', `Update set "${name}" (${us.sys_id}) exists in ${instance.scope} but did not become current; the current one is ${current ? `"${current.name}"` : 'none'}.`);
        }
        return { update_set: current, reused: Boolean(existing[0]) };
      }
      if (a.action === 'set_current') {
        assertSysId(a.sys_id);
        await guard.setCurrentUpdateSet(a.sys_id);
        return { update_set: await guard.assertUpdateSet() };
      }
      if (a.action === 'contents') {
        const id = a.sys_id || (await guard.currentUpdateSet())?.sys_id;
        if (!id) throw new GuardError('NO_UPDATE_SET', 'No update set given and none is current.');
        const rows = await client.query('sys_update_xml', { query: `update_set=${id}`, fields: 'name,type,target_name,action,sys_updated_on', limit: 1000, orderBy: 'type' });
        return { update_set: id, count: rows.length, entries: rows };
      }
      throw new GuardError('BAD_INPUT', `Unknown action ${a.action}.`);
    },
  },
  {
    name: 'sn_upsert',
    description: 'Insert or update one record. Identify an existing record by sys_id or by match_query (must match at most one). Metadata writes must land in the current kiwi/ update set; the result says whether the instance captured it. ATF step inputs (sys_variable_value rows of an in-scope step) count as part of the step. Large field values can come from files (values_from_files).',
    inputSchema: {
      type: 'object',
      required: ['table'],
      properties: {
        ...instanceProp,
        ...approvedProp,
        table: { type: 'string' },
        values: { type: 'object' },
        values_from_files: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Field name -> absolute file path. The field gets the file\'s text; a .json file is stored as compact JSON (e.g. a macroponent composition). Merged over values.',
        },
        sys_id: { type: 'string', description: 'Update this record, or insert with this sys_id when it does not exist.' },
        match_query: { type: 'string', description: 'Encoded query that finds the record to update.' },
      },
    },
    async handler(a, { client, guard }) {
      assertTable(a.table);
      if (a.sys_id) assertSysId(a.sys_id);
      const values = { ...(a.values || {}), ...valuesFromFiles(a.values_from_files) };
      delete values.sys_id;
      if (!Object.keys(values).length) throw new GuardError('BAD_INPUT', 'Give values or values_from_files.');
      const child = CHILD_OF_METADATA[a.table];
      const lookupFields = ['sys_id', 'sys_scope', ...(child ? [child.table, child.id] : [])].join(',');
      let existing = null;
      if (a.sys_id) existing = await client.get(a.table, a.sys_id, lookupFields);
      else if (a.match_query) {
        const rows = await client.query(a.table, { query: a.match_query, fields: lookupFields, limit: 2 });
        if (rows.length > 1) throw new GuardError('AMBIGUOUS', `match_query matched more than one ${a.table} record.`);
        existing = rows[0] || null;
      }
      const verdict = await guard.checkWrite({ table: a.table, existing, values, userApproved: a.user_approved === true });
      if (!verdict.ok) return needsApproval(verdict.needsApproval, `${existing ? 'update' : 'insert'} ${a.table}`);
      const result = existing
        ? await client.patch(a.table, existing.sys_id, values)
        : await client.insert(a.table, a.sys_id ? { ...values, sys_id: a.sys_id } : values);
      const out = { action: existing ? 'updated' : 'inserted', table: a.table, sys_id: result.sys_id };
      if (verdict.metadata) {
        const owner = verdict.captureAs || { table: a.table, sys_id: result.sys_id, sys_scope: result.sys_scope };
        out.update_set = verdict.updateSet.name;
        if (verdict.captureAs) out.captured_as = `${owner.table}/${owner.sys_id}`;
        out.captured_in_update_set = await guard.captured(verdict.updateSet.sys_id, owner.table, owner.sys_id);
        out.record_scope_ok = owner.sys_scope === verdict.scopeId;
        if (!out.captured_in_update_set || !out.record_scope_ok) out.warning = 'The write did not land where expected. Stop and report it; do not keep writing.';
      }
      return out;
    },
  },
  {
    name: 'sn_delete',
    description: 'Delete one record. Always needs the user\'s explicit approval and always shows a permission prompt.',
    inputSchema: {
      type: 'object',
      required: ['table', 'sys_id'],
      properties: { ...instanceProp, ...approvedProp, table: { type: 'string' }, sys_id: { type: 'string' } },
    },
    async handler(a, { client, guard }) {
      assertTable(a.table);
      assertSysId(a.sys_id);
      const existing = await client.get(a.table, a.sys_id, 'sys_id,sys_scope');
      if (!existing) return { status: 'not_found', table: a.table, sys_id: a.sys_id };
      const verdict = await guard.checkWrite({ table: a.table, existing, isDelete: true, userApproved: a.user_approved === true });
      if (!verdict.ok) return needsApproval(verdict.needsApproval, `delete ${a.table}/${a.sys_id}`);
      await client.del(a.table, a.sys_id);
      return { action: 'deleted', table: a.table, sys_id: a.sys_id };
    },
  },
  {
    name: 'sn_ux_export_page',
    description: 'Export one UI Builder page (start from its sys_ux_screen, sys_ux_screen_type, sys_ux_macroponent or sys_ux_app_route) as a kiwi bundle: every sys_ux_* record it owns in its own scope, plus external_refs it needs. Use it to study OOTB pages and as a template for new ones.',
    inputSchema: {
      type: 'object',
      required: ['table', 'sys_id'],
      properties: {
        ...instanceProp,
        table: { type: 'string' },
        sys_id: { type: 'string' },
        max_records: { type: 'integer', default: 300 },
        out_path: { type: 'string', description: 'Absolute .json path. Writes the bundle there and returns only a summary. Use it for anything but tiny pages.' },
      },
    },
    async handler(a, { instance, client, guard }) {
      assertTable(a.table);
      assertSysId(a.sys_id);
      await guard.assertInstance();
      const bundle = await exportBundle(client, { table: a.table, sys_id: a.sys_id, maxRecords: a.max_records ?? 300, host: instance.host });
      if (!a.out_path) return bundle;
      const bytes = writeJsonFile(a.out_path, bundle);
      const byTable = {};
      for (const r of bundle.records) byTable[r.table] = (byTable[r.table] || 0) + 1;
      return {
        status: 'written',
        out_path: a.out_path,
        bytes,
        root: bundle.root,
        records: bundle.records.length,
        records_by_table: byTable,
        external_refs: bundle.external_refs.length,
        routes: bundle.routes,
        unresolved_ids: bundle.unresolved_ids,
        warnings: bundle.warnings,
      };
    },
  },
  {
    name: 'sn_ux_upsert_page',
    description: 'Write a kiwi bundle (from sn_ux_export_page or hand-built) into the current kiwi/ update set, in dependency order. Pass it inline (bundle) or, for anything large, as a file (bundle_path). remap_ids gives every record a fresh sys_id, which is how you clone a template. Nothing is written if any record needs approval.',
    inputSchema: {
      type: 'object',
      properties: {
        ...instanceProp,
        ...approvedProp,
        bundle: { type: 'object' },
        bundle_path: { type: 'string', description: 'Absolute path of a bundle JSON file, instead of bundle.' },
        remap_ids: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
      },
    },
    async handler(a, { client, guard }) {
      if (Boolean(a.bundle) === Boolean(a.bundle_path)) throw new GuardError('BAD_INPUT', 'Give exactly one of bundle or bundle_path.');
      const input = a.bundle_path ? readJsonFile(a.bundle_path, 'bundle_path') : a.bundle;
      const errors = validateBundle(input);
      if (errors.length) return { status: 'invalid_bundle', errors };
      const bundle = a.remap_ids ? remapIds(input) : input;

      const externalIds = (bundle.external_refs || []).map((e) => e.sys_id);
      const missing = [];
      for (let i = 0; i < externalIds.length; i += 50) {
        const chunk = externalIds.slice(i, i + 50);
        const found = await client.query('sys_metadata', { query: `sys_idIN${chunk.join(',')}`, fields: 'sys_id', limit: chunk.length });
        const have = new Set(found.map((f) => f.sys_id));
        for (const id of chunk) if (!have.has(id)) missing.push(bundle.external_refs.find((e) => e.sys_id === id));
      }
      if (missing.length) return { status: 'missing_external_refs', missing };

      const ordered = orderRecords(bundle.records);
      const plan = [];
      const approvals = [];
      for (const r of ordered) {
        assertTable(r.table);
        const existing = await client.get(r.table, r.sys_id, 'sys_id,sys_scope');
        const verdict = await guard.checkWrite({ table: r.table, existing, values: r.values, userApproved: a.user_approved === true });
        if (!verdict.ok) approvals.push(...verdict.needsApproval);
        plan.push({ record: r, existing, verdict });
      }
      if (approvals.length) return needsApproval(approvals, `write ${ordered.length} UI Builder records`);
      if (a.dry_run) return { status: 'dry_run', order: plan.map((p) => ({ table: p.record.table, sys_id: p.record.sys_id, action: p.existing ? 'update' : 'insert' })) };

      const written = [];
      for (const p of plan) {
        const values = stripSystemFields(p.record.values);
        delete values.sys_id;
        const res = p.existing
          ? await client.patch(p.record.table, p.record.sys_id, values)
          : await client.insert(p.record.table, { ...values, sys_id: p.record.sys_id });
        const updateSet = p.verdict.updateSet;
        written.push({
          table: p.record.table,
          sys_id: res.sys_id,
          action: p.existing ? 'updated' : 'inserted',
          captured_in_update_set: updateSet
            ? await guard.captured(updateSet.sys_id, p.verdict.captureAs?.table || p.record.table, p.verdict.captureAs?.sys_id || res.sys_id)
            : null,
        });
      }
      const uncaptured = written.filter((w) => w.captured_in_update_set === false);
      return {
        status: 'written',
        root: bundle.root,
        id_map: bundle.id_map,
        written,
        ...(uncaptured.length ? { warning: `${uncaptured.length} records were not captured in the update set. Stop and report it.` } : {}),
      };
    },
  },
  {
    name: 'sn_atf_run_suite',
    description: 'Run an ATF test suite through the CI/CD API and wait for the result. Needs the sn_cicd plugin and the sn_cicd.sys_ci_automation role.',
    inputSchema: {
      type: 'object',
      properties: {
        ...instanceProp,
        suite_sys_id: { type: 'string' },
        suite_name: { type: 'string' },
        wait_seconds: { type: 'integer', default: 600 },
      },
    },
    async handler(a, { client, guard }) {
      await guard.assertInstance();
      if (!a.suite_sys_id && !a.suite_name) throw new GuardError('BAD_INPUT', 'Give suite_sys_id or suite_name.');

      // The CI/CD API answers a bare HTTP 400 when the ATF runner is off, and still
      // creates schedule records, so check the property before starting a run.
      const runner = (await client.query('sys_properties', { query: 'name=sn_atf.runner.enabled', fields: 'name,value', limit: 1 }))[0];
      if (runner && String(runner.value).toLowerCase() === 'false') {
        return {
          status: 'atf_runner_disabled',
          message: 'sn_atf.runner.enabled is false on this instance, so no ATF test can run (the CI/CD API would answer HTTP 400). It is an OOTB system property: ask the user to set it to true (System Properties, or sn_upsert on sys_properties with their approval), then run the suite again.',
        };
      }

      const usBefore = await guard.currentUpdateSet();
      const strayBefore = usBefore ? await atfScheduleEntries(client, usBefore.sys_id) : [];
      const strays = async () => {
        if (!usBefore) return {};
        const after = await atfScheduleEntries(client, usBefore.sys_id);
        const known = new Set(strayBefore.map((e) => e.name));
        const added = after.filter((e) => !known.has(e.name));
        return added.length
          ? {
              stray_update_set_entries: added,
              warning: `The run created ${added.length} ATF schedule record(s) captured in "${usBefore.name}". They are not part of the work: tell the user and back them out of the update set before it is completed (needs their approval).`,
            }
          : {};
      };

      let started;
      try {
        started = await client.request('POST', '/api/sn_cicd/testsuite/run', {
          query: a.suite_sys_id ? { test_suite_sys_id: a.suite_sys_id } : { test_suite_name: a.suite_name },
        });
      } catch (e) {
        const err = /** @type {any} */ (e);
        if (!err.status) throw e;
        return {
          status: 'run_failed',
          http_status: err.status,
          message: err.message,
          response_body: err.body,
          hint: 'Check that the sn_cicd plugin is active, the acting user has sn_cicd.sys_ci_automation, the suite exists, and sn_atf.runner.enabled is true.',
          ...(await strays()),
        };
      }
      const progressId = started?.result?.links?.progress?.id;
      if (!progressId) return { status: 'unexpected_response', response: started, ...(await strays()) };
      const deadline = Date.now() + (a.wait_seconds ?? 600) * 1000;
      let progress;
      while (Date.now() < deadline) {
        progress = (await client.request('GET', `/api/sn_cicd/progress/${progressId}`))?.result;
        if (['2', '3', '4'].includes(String(progress?.status))) break;
        await sleep(5000);
      }
      const resultsId = progress?.links?.results?.id;
      const results = resultsId ? (await client.request('GET', `/api/sn_cicd/testsuite/results/${resultsId}`))?.result : null;
      return {
        status: { 0: 'pending', 1: 'running', 2: 'successful', 3: 'failed', 4: 'canceled' }[String(progress?.status)] || 'timed_out',
        progress_id: progressId,
        ...(progress?.status_message ? { status_message: progress.status_message } : {}),
        results,
        ...(await strays()),
      };
    },
  },
  {
    name: 'sn_ux_build_page',
    description: 'Compile a short page spec into a complete workspace page and write it: route, screen type, screen, page, client scripts, a render include, the open-record event and an optional role audience. The page is an "attention board": summary cards per reason, a list of the records that need attention with the reason on each row, and a breakdown by group, with loading, empty, error and no-access states. Data comes from the OOTB GraphQL record query, so no new ACL is needed. Rebuilding the same route updates the same records. Use this instead of hand-editing an exported bundle whenever the page fits.',
    inputSchema: {
      type: 'object',
      properties: {
        ...instanceProp,
        ...approvedProp,
        spec: {
          type: 'object',
          description: 'name, route (url segment), title, subtitle, table, query (encoded), noun, reasons: [{key, label, kind: empty|equals|sla_breached, field, value, color: critical|high|warning|info, hint, icon, row_label}], optional fields {number, summary, owner, group, opened}, breakdown_heading, list_heading, summary_label, summary_hint, breakdown_reasons, empty {heading, body}, no_access {heading, body}, limit.',
        },
        spec_path: { type: 'string', description: 'Absolute path of a spec JSON file, instead of spec.' },
        experience: { type: 'string', default: 'sow', description: 'Workspace URL path the page joins, e.g. sow for Service Operations Workspace.' },
        audience_role: { type: 'string', description: 'Role name (e.g. x_acme_app.lead) that may see the page. It must exist; create it with sn_upsert first.' },
        dry_run: { type: 'boolean', default: false },
        out_path: { type: 'string', description: 'Absolute .json path to also write the compiled bundle to.' },
      },
    },
    async handler(a, ctx) {
      const started = Date.now();
      const { instance, client, guard } = ctx;
      if (Boolean(a.spec) === Boolean(a.spec_path)) throw new GuardError('BAD_INPUT', 'Give exactly one of spec or spec_path.');
      const { spec, errors } = normalizeSpec(a.spec_path ? readJsonFile(a.spec_path, 'spec_path') : a.spec);
      if (errors.length) return { status: 'invalid_spec', errors };
      await guard.assertInstance();
      const S = await guard.scopeId();
      const exp = a.experience || 'sow';
      if (!/^[a-z0-9_-]+$/.test(exp)) throw new GuardError('BAD_INPUT', `"${exp}" is not a workspace path.`);
      const registry = (await client.query('sys_ux_page_registry', { query: `path=${exp}`, fields: 'sys_id,title,admin_panel,root_macroponent', limit: 1 }))[0];
      if (!registry?.admin_panel || !registry?.root_macroponent) return { status: 'no_experience', message: `No workspace with path "${exp}" (sys_ux_page_registry) on this instance.` };

      let roleId;
      if (a.audience_role) {
        roleId = (await client.query('sys_user_role', { query: `name=${a.audience_role}`, fields: 'sys_id', limit: 1 }))[0]?.sys_id;
        if (!roleId) return { status: 'no_role', message: `Role ${a.audience_role} does not exist. Create it with sn_upsert on sys_user_role first.` };
      }

      // Reuse the live sys_ids when this route already exists in our scope, so a rebuild updates in place.
      const ids = {};
      const route = (await client.query('sys_ux_app_route', { query: `app_config=${registry.admin_panel}^route_type=${spec.route}`, fields: 'sys_id,screen_type,sys_scope', limit: 1 }))[0];
      if (route && route.sys_scope !== S) return { status: 'route_taken', message: `Route "${spec.route}" already exists in ${registry.title} and belongs to another application. Pick another route.` };
      if (route) {
        Object.assign(ids, { route: route.sys_id, screen_type: route.screen_type });
        const screen = (await client.query('sys_ux_screen', { query: `screen_type=${route.screen_type}^sys_scope=${S}`, fields: 'sys_id,macroponent', limit: 1 }))[0];
        if (screen) Object.assign(ids, { screen: screen.sys_id, macroponent: screen.macroponent });
        if (ids.macroponent) {
          const suffix = { cs_apply: 'apply data', cs_failed: 'show load error', cs_refresh: 'refresh data', cs_filter: 'filter by summary card', cs_group: 'filter by group', cs_showall: 'clear filters', cs_open: 'open record' };
          for (const cs of await client.query('sys_ux_client_script', { query: `macroponent=${ids.macroponent}`, fields: 'sys_id,name', limit: 50 })) {
            const key = Object.keys(suffix).find((k) => cs.name === `${spec.name} - ${suffix[k]}`);
            if (key) ids[key] = cs.sys_id;
          }
        }
        if (ids.screen) {
          const link = (await client.query('sys_ux_applicability_m2m_screen', { query: `screen=${ids.screen}^sys_scope=${S}`, fields: 'sys_id,applicability', limit: 1 }))[0];
          if (link) Object.assign(ids, { audience_link: link.sys_id, audience: link.applicability });
        }
      }
      const probe = compileBoard(spec, { scope: instance.scope, appConfig: registry.admin_panel, shell: registry.root_macroponent, roleId, ids, host: instance.host });
      if (route) {
        const inc = (await client.query('sys_ux_client_script_include', { query: `api_name=${probe.render_api}^sys_scope=${S}`, fields: 'sys_id', limit: 1 }))[0];
        const evt = (await client.query('sys_ux_event', { query: `event_name=${probe.event_name}^sys_scope=${S}`, fields: 'sys_id', limit: 1 }))[0];
        if (inc) ids.render_include = inc.sys_id;
        if (evt) ids.event = evt.sys_id;
      }
      const { bundle } = compileBoard(spec, { scope: instance.scope, appConfig: registry.admin_panel, shell: registry.root_macroponent, roleId, ids: { ...probe.ids, ...ids }, host: instance.host });
      if (a.out_path) writeJsonFile(a.out_path, bundle);

      const upsert = await TOOLS.find((t) => t.name === 'sn_ux_upsert_page').handler({ bundle, dry_run: a.dry_run, user_approved: a.user_approved }, ctx);
      return {
        status: upsert.status,
        page_url: `https://${instance.host}/now/${exp}/${spec.route}`,
        rebuilt: Boolean(route),
        records: bundle.records.length,
        elapsed_ms: Date.now() - started,
        ...(a.out_path ? { bundle_path: a.out_path } : {}),
        upsert,
      };
    },
  },
  {
    name: 'sn_app_audit',
    description: 'Read-only security and hygiene audit of any scoped app, whoever built it (kiwistack, Studio Build Agent, a person). Checks REST endpoints any employee can call, client-callable script includes without role checks, tables without ACLs, data brokers without ACLs, risky cross-scope privileges, app roles that contain admin/itil, missing ATF tests and changes stuck in the Default update set. Returns findings ranked by severity, each with the record and the fix.',
    inputSchema: {
      type: 'object',
      properties: {
        ...instanceProp,
        scope: { type: 'string', description: 'App scope to audit, e.g. x_acme_app. Defaults to the configured target scope.' },
        out_path: { type: 'string', description: 'Absolute .json path to also write the full report to.' },
      },
    },
    async handler(a, { instance, client, guard }) {
      await guard.assertInstance();
      const scope = a.scope || instance.scope;
      if (!/^[a-z0-9_]+$/.test(scope)) throw new GuardError('BAD_INPUT', `"${scope}" is not a valid scope name.`);
      const report = await auditApp(client, { scope });
      if (a.out_path) report.written_to = { path: a.out_path, bytes: writeJsonFile(a.out_path, report) };
      return report;
    },
  },
];
