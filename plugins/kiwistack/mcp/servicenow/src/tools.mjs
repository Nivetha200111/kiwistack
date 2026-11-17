// @ts-check
import { SYS_ID } from './client.mjs';
import { GuardError } from './guard.mjs';
import { exportBundle, orderRecords, remapIds, stripSystemFields, validateBundle } from './bundle.mjs';

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

/** @type {Array<{name: string, description: string, inputSchema: any, handler: (args: any, ctx: any) => Promise<any>}>} */
export const TOOLS = [
  {
    name: 'sn_instance_info',
    description: 'Who and where kiwistack is connected: host, environment, acting user, target scope and the current update set. Call this first in every task.',
    inputSchema: { type: 'object', properties: { ...instanceProp } },
    async handler(_args, { instance, client, guard }) {
      await guard.assertInstance();
      const [user, scopeId, us] = await Promise.all([client.currentUser(), guard.scopeId(), guard.currentUpdateSet()]);
      return {
        instance: instance.name,
        host: instance.host,
        environment: instance.environment,
        user: { sys_id: user.sys_id, user_name: user.user_name },
        scope: { name: instance.scope, sys_id: scopeId },
        current_update_set: us,
        update_set_ok: Boolean(us && us.name !== 'Default' && us.state === 'in progress' && us.application === scopeId),
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
    description: 'Read one record by sys_id, all fields or the listed ones.',
    inputSchema: {
      type: 'object',
      required: ['table', 'sys_id'],
      properties: { ...instanceProp, table: { type: 'string' }, sys_id: { type: 'string' }, fields: { type: 'string' } },
    },
    async handler(a, { client, guard }) {
      assertTable(a.table);
      assertSysId(a.sys_id);
      await guard.assertInstance();
      return { record: await client.get(a.table, a.sys_id, a.fields) };
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
    description: 'Which plugins and store apps are installed and active (for example HRSD, CSM, Workspace). Use before designing anything module-specific.',
    inputSchema: { type: 'object', properties: { ...instanceProp, search: { type: 'string', description: 'Substring of name or id.' } } },
    async handler(a, { client, guard }) {
      await guard.assertInstance();
      const s = a.search ? `^nameLIKE${a.search}^ORidLIKE${a.search}` : '';
      const out = { plugins: [], store_apps: [], warnings: [] };
      try {
        out.plugins = await client.query('v_plugin', { query: `active=active${s}`, fields: 'id,name,active,version', limit: 200 });
      } catch (e) {
        out.warnings.push(`v_plugin: ${e.message}`);
      }
      try {
        const ss = a.search ? `^nameLIKE${a.search}^ORscopeLIKE${a.search}` : '';
        out.store_apps = await client.query('sys_store_app', { query: `active=true${ss}`, fields: 'name,scope,version', limit: 200 });
      } catch (e) {
        out.warnings.push(`sys_store_app: ${e.message}`);
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
    async handler(a, { client, guard }) {
      await guard.assertInstance();
      if (a.action === 'current') return { update_set: await guard.currentUpdateSet() };
      if (a.action === 'create') {
        if (!a.name) throw new GuardError('BAD_INPUT', 'create needs a name.');
        const name = a.name.startsWith('kiwi/') ? a.name : `kiwi/${a.name}`;
        const scopeId = await guard.scopeId();
        const existing = await client.query('sys_update_set', { query: `name=${name}^application=${scopeId}^state=in progress`, fields: 'sys_id,name,state,application', limit: 1 });
        const us = existing[0] || (await client.insert('sys_update_set', { name, application: scopeId, state: 'in progress', description: a.description || 'Created by kiwistack.' }));
        await guard.setCurrentUpdateSet(us.sys_id);
        return { update_set: await guard.currentUpdateSet(), reused: Boolean(existing[0]) };
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
    description: 'Insert or update one record. Identify an existing record by sys_id or by match_query (must match at most one). Metadata writes must land in the current kiwi/ update set; the result says whether the instance captured it.',
    inputSchema: {
      type: 'object',
      required: ['table', 'values'],
      properties: {
        ...instanceProp,
        ...approvedProp,
        table: { type: 'string' },
        values: { type: 'object' },
        sys_id: { type: 'string', description: 'Update this record, or insert with this sys_id when it does not exist.' },
        match_query: { type: 'string', description: 'Encoded query that finds the record to update.' },
      },
    },
    async handler(a, { client, guard }) {
      assertTable(a.table);
      if (a.sys_id) assertSysId(a.sys_id);
      let existing = null;
      if (a.sys_id) existing = await client.get(a.table, a.sys_id, 'sys_id,sys_scope');
      else if (a.match_query) {
        const rows = await client.query(a.table, { query: a.match_query, fields: 'sys_id,sys_scope', limit: 2 });
        if (rows.length > 1) throw new GuardError('AMBIGUOUS', `match_query matched more than one ${a.table} record.`);
        existing = rows[0] || null;
      }
      const verdict = await guard.checkWrite({ table: a.table, existing, userApproved: a.user_approved === true });
      if (!verdict.ok) return needsApproval(verdict.needsApproval, `${existing ? 'update' : 'insert'} ${a.table}`);
      const values = { ...a.values };
      delete values.sys_id;
      const result = existing
        ? await client.patch(a.table, existing.sys_id, values)
        : await client.insert(a.table, a.sys_id ? { ...values, sys_id: a.sys_id } : values);
      const out = { action: existing ? 'updated' : 'inserted', table: a.table, sys_id: result.sys_id };
      if (verdict.metadata) {
        out.update_set = verdict.updateSet.name;
        out.captured_in_update_set = await guard.captured(verdict.updateSet.sys_id, a.table, result.sys_id);
        out.record_scope_ok = result.sys_scope === verdict.scopeId;
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
      },
    },
    async handler(a, { instance, client, guard }) {
      assertTable(a.table);
      assertSysId(a.sys_id);
      await guard.assertInstance();
      return exportBundle(client, { table: a.table, sys_id: a.sys_id, maxRecords: a.max_records ?? 300, host: instance.host });
    },
  },
  {
    name: 'sn_ux_upsert_page',
    description: 'Write a kiwi bundle (from sn_ux_export_page or hand-built) into the current kiwi/ update set, in dependency order. remap_ids gives every record a fresh sys_id, which is how you clone a template. Nothing is written if any record needs approval.',
    inputSchema: {
      type: 'object',
      required: ['bundle'],
      properties: {
        ...instanceProp,
        ...approvedProp,
        bundle: { type: 'object' },
        remap_ids: { type: 'boolean', default: false },
        dry_run: { type: 'boolean', default: false },
      },
    },
    async handler(a, { client, guard }) {
      const errors = validateBundle(a.bundle);
      if (errors.length) return { status: 'invalid_bundle', errors };
      const bundle = a.remap_ids ? remapIds(a.bundle) : a.bundle;

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
        const verdict = await guard.checkWrite({ table: r.table, existing, userApproved: a.user_approved === true });
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
          captured_in_update_set: updateSet ? await guard.captured(updateSet.sys_id, p.record.table, res.sys_id) : null,
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
      const started = await client.request('POST', '/api/sn_cicd/testsuite/run', {
        query: a.suite_sys_id ? { test_suite_sys_id: a.suite_sys_id } : { test_suite_name: a.suite_name },
      });
      const progressId = started?.result?.links?.progress?.id;
      if (!progressId) return { status: 'unexpected_response', response: started };
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
        results,
      };
    },
  },
];
