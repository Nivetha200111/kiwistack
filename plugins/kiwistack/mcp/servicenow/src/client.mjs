// @ts-check

export class SnHttpError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.code = 'HTTP';
    this.status = status;
    this.detail = detail;
    /** @type {string | undefined} The response body, truncated, so a bare status is never all the caller sees. */
    this.body = undefined;
  }
}

export const SYS_ID = /^[0-9a-f]{32}$/;

/** Thin REST client for one instance. All Table API calls return raw (non-display) values. */
export class SnClient {
  constructor({ host, tokens, fetchImpl = globalThis.fetch }) {
    this.host = host;
    this.tokens = tokens;
    this.fetch = fetchImpl;
    this.userCache = undefined;
  }

  async request(method, path, { query, body } = {}) {
    const url = new URL(`https://${this.host}${path}`);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.tokens.token();
      const res = await this.fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401 && attempt === 0) {
        this.tokens.invalidate();
        continue;
      }
      if (res.status === 204) return null;
      const text = await res.text();
      let json;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text.slice(0, 500) };
      }
      if (!res.ok) {
        // Table API errors use error.message; scoped APIs such as CI/CD put it in result.
        const msg = json?.error?.message || json?.error || json?.result?.error || json?.result?.status_message || `HTTP ${res.status}`;
        const detail = json?.error?.detail || json?.result?.status_detail;
        const hint = /unscoped api/i.test(String(detail))
          ? ' The OAuth client is "Securely scoped". On its Application Registry record set Scope Restriction to "Useraccount scoped" (with a "useraccount" auth scope linked) or "Broadly scoped"; see /setup-kiwistack.'
          : /ACL Exception/i.test(String(msg))
            ? ' Writing ACLs needs security_admin elevation, which an OAuth token cannot do; see principle-least-privilege-acls.'
            : '';
        const err = new SnHttpError(res.status, `${method} ${url.pathname} failed: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}${detail ? ` (${detail})` : ''}.${hint}`, detail);
        err.body = text ? text.slice(0, 2000) : '(empty body)';
        throw err;
      }
      return json;
    }
    throw new SnHttpError(401, 'Unauthorized after token refresh.');
  }

  async query(table, { query, fields, limit = 100, offset, orderBy } = {}) {
    const q = [query, orderBy ? `ORDERBY${orderBy}` : ''].filter(Boolean).join('^');
    const json = await this.request('GET', `/api/now/table/${encodeURIComponent(table)}`, {
      query: {
        sysparm_query: q,
        sysparm_fields: Array.isArray(fields) ? fields.join(',') : fields,
        sysparm_limit: limit,
        sysparm_offset: offset,
        sysparm_display_value: 'false',
        sysparm_exclude_reference_link: 'true',
      },
    });
    return json?.result || [];
  }

  async get(table, sysId, fields) {
    try {
      const json = await this.request('GET', `/api/now/table/${encodeURIComponent(table)}/${sysId}`, {
        query: {
          sysparm_fields: Array.isArray(fields) ? fields.join(',') : fields,
          sysparm_display_value: 'false',
          sysparm_exclude_reference_link: 'true',
        },
      });
      return json?.result || null;
    } catch (e) {
      if (e instanceof SnHttpError && e.status === 404) return null;
      throw e;
    }
  }

  async insert(table, values) {
    const json = await this.request('POST', `/api/now/table/${encodeURIComponent(table)}`, {
      query: { sysparm_exclude_reference_link: 'true', sysparm_input_display_value: 'false' },
      body: values,
    });
    return json?.result;
  }

  async patch(table, sysId, values) {
    const json = await this.request('PATCH', `/api/now/table/${encodeURIComponent(table)}/${sysId}`, {
      query: { sysparm_exclude_reference_link: 'true', sysparm_input_display_value: 'false' },
      body: values,
    });
    return json?.result;
  }

  async del(table, sysId) {
    await this.request('DELETE', `/api/now/table/${encodeURIComponent(table)}/${sysId}`);
  }

  /** The user the OAuth token acts as. */
  async currentUser() {
    if (this.userCache) return this.userCache;
    const rows = await this.query('sys_user', {
      query: 'sys_id=javascript:gs.getUserID()',
      fields: 'sys_id,user_name,name',
      limit: 1,
    });
    if (!rows[0]) throw new SnHttpError(500, 'Could not resolve the current user (sys_id=javascript:gs.getUserID() returned nothing).');
    this.userCache = rows[0];
    return rows[0];
  }
}
