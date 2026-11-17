// @ts-check
// Every instance call passes through the Guard. Hard refusals throw GuardError.
// Writes that need a human (out of scope, OOTB, data records, deletes) come back as
// { needsApproval } and only proceed when the call carries user_approved, which the
// plugin's PreToolUse hook turns into a Claude Code permission prompt.

export class GuardError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const PDI_HOST = /^dev\d+\.service-now\.com$/i;

/** A Personal Developer Instance: declared in config and confirmed by its host name. */
export function isPdi(instance) {
  return instance.pdi === true && PDI_HOST.test(instance.host);
}

export const REASON = {
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  DATA_RECORD: 'DATA_RECORD',
  DELETE: 'DELETE',
};

export class Guard {
  constructor({ instance, client }) {
    this.instance = instance;
    this.client = client;
    this.cache = new Map();
  }

  async memo(key, fn) {
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key);
  }

  /**
   * Refuses instances that report themselves as production. The one exception is a
   * Personal Developer Instance, which can ship with the flag set: only when the config
   * marks it "pdi": true AND the host has the PDI form devNNNN.service-now.com.
   */
  async assertInstance() {
    return this.memo('instance', async () => {
      const rows = await this.client.query('sys_properties', {
        query: 'name=glide.installation.production',
        fields: 'name,value',
        limit: 1,
      });
      if (rows[0] && String(rows[0].value).toLowerCase() === 'true' && !isPdi(this.instance)) {
        throw new GuardError('PRODUCTION', `${this.instance.host} has glide.installation.production=true. kiwistack never works on production.`);
      }
      return true;
    });
  }

  async scopeId() {
    return this.memo('scope', async () => {
      if (this.instance.scope === 'global') return 'global';
      const rows = await this.client.query('sys_scope', { query: `scope=${this.instance.scope}`, fields: 'sys_id,scope,name', limit: 1 });
      if (!rows[0]) throw new GuardError('NO_SCOPE', `App scope ${this.instance.scope} does not exist on ${this.instance.host}. Create the app first (now-sdk init or Studio).`);
      return rows[0].sys_id;
    });
  }

  async preference(name) {
    const user = await this.client.currentUser();
    const rows = await this.client.query('sys_user_preference', {
      query: `user=${user.sys_id}^name=${name}`,
      fields: 'sys_id,name,value',
      limit: 1,
    });
    return rows[0];
  }

  async setPreference(name, value) {
    const user = await this.client.currentUser();
    const existing = await this.preference(name);
    if (existing) return this.client.patch('sys_user_preference', existing.sys_id, { value });
    return this.client.insert('sys_user_preference', { user: user.sys_id, name, value });
  }

  async currentUpdateSet() {
    const scopeId = await this.scopeId();
    const pref = (await this.preference(`updateSetForScope${scopeId}`)) || (await this.preference('sys_update_set'));
    if (!pref?.value) return null;
    return this.client.get('sys_update_set', pref.value, 'sys_id,name,state,application,is_default');
  }

  /** Makes an update set current for the target scope and the session's current application. */
  async setCurrentUpdateSet(updateSetId) {
    const scopeId = await this.scopeId();
    await this.setPreference('apps.current_app', scopeId);
    await this.setPreference(`updateSetForScope${scopeId}`, updateSetId);
    await this.setPreference('sys_update_set', updateSetId);
    this.cache.delete('updateSet');
  }

  async assertUpdateSet() {
    const us = await this.currentUpdateSet();
    if (!us) throw new GuardError('NO_UPDATE_SET', 'No current update set. Call sn_update_set with action "create" first.');
    if (us.name === 'Default' || String(us.is_default) === 'true') {
      throw new GuardError('DEFAULT_UPDATE_SET', 'The current update set is Default. Create a kiwi/<task> update set with sn_update_set first.');
    }
    if (us.state !== 'in progress') throw new GuardError('UPDATE_SET_CLOSED', `Update set "${us.name}" is ${us.state}, not in progress.`);
    const scopeId = await this.scopeId();
    if (us.application !== scopeId) {
      throw new GuardError('UPDATE_SET_SCOPE_MISMATCH', `Update set "${us.name}" belongs to another application than ${this.instance.scope}.`);
    }
    return us;
  }

  async tableHierarchy(table) {
    return this.memo(`hier:${table}`, async () => {
      const chain = [];
      let name = table;
      for (let i = 0; name && i < 12; i++) {
        const rows = await this.client.query('sys_db_object', { query: `name=${name}`, fields: 'sys_id,name,super_class', limit: 1 });
        if (!rows[0]) break;
        chain.push({ name: rows[0].name, sys_id: rows[0].sys_id });
        const superId = rows[0].super_class;
        if (!superId) break;
        const parent = await this.client.get('sys_db_object', superId, 'name');
        name = parent?.name;
      }
      if (!chain.length) throw new GuardError('NO_TABLE', `Table ${table} does not exist on ${this.instance.host}.`);
      return chain.map((t) => t.name);
    });
  }

  async isMetadataTable(table) {
    const chain = await this.tableHierarchy(table);
    return chain.includes('sys_metadata');
  }

  /**
   * Decides whether a write may run.
   * @param {{table: string, existing?: any, isDelete?: boolean, userApproved?: boolean}} p
   */
  async checkWrite({ table, existing, isDelete = false, userApproved = false }) {
    await this.assertInstance();
    const scopeId = await this.scopeId();
    const metadata = await this.isMetadataTable(table);
    const reasons = [];
    let updateSet = null;
    if (metadata) {
      updateSet = await this.assertUpdateSet();
      if (existing && existing.sys_scope && existing.sys_scope !== scopeId) {
        reasons.push({ code: REASON.OUT_OF_SCOPE, detail: `${table}/${existing.sys_id} belongs to scope ${existing.sys_scope}, not ${this.instance.scope}. Editing it changes OOTB or another app's files.` });
      }
    } else {
      reasons.push({ code: REASON.DATA_RECORD, detail: `${table} is a data table. Writes are not captured in an update set and change shared dev data.` });
    }
    if (isDelete) reasons.push({ code: REASON.DELETE, detail: `Deleting ${table}/${existing?.sys_id}.` });
    if (reasons.length && !userApproved) return { ok: false, needsApproval: reasons, metadata, updateSet, scopeId };
    return { ok: true, approvedReasons: reasons, metadata, updateSet, scopeId };
  }

  /** Checks that the instance captured a metadata write in the current update set. */
  async captured(updateSetId, table, sysId) {
    const rows = await this.client.query('sys_update_xml', {
      query: `update_set=${updateSetId}^name=${table}_${sysId}`,
      fields: 'sys_id,name,action',
      limit: 1,
    });
    return Boolean(rows[0]);
  }
}
