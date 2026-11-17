// @ts-check
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { secret } from './config.mjs';

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.code = 'AUTH';
  }
}

/**
 * OAuth against <host>/oauth_token.do. Tokens are cached per instance in
 * ~/.kiwistack/tokens.json, never in the repository.
 */
export class TokenProvider {
  constructor({ loaded, instance, fetchImpl = globalThis.fetch, now = () => Date.now(), persist = true }) {
    this.loaded = loaded;
    this.instance = instance;
    this.fetch = fetchImpl;
    this.now = now;
    this.persist = persist;
    this.cachePath = join(loaded.home, 'tokens.json');
  }

  readCache() {
    if (!this.persist || !existsSync(this.cachePath)) return {};
    try {
      return JSON.parse(readFileSync(this.cachePath, 'utf8'));
    } catch {
      return {};
    }
  }

  writeCache(all) {
    if (!this.persist) return;
    mkdirSync(this.loaded.home, { recursive: true });
    writeFileSync(this.cachePath, JSON.stringify(all, null, 2));
    try {
      chmodSync(this.cachePath, 0o600);
    } catch {
      // Windows ignores POSIX modes; the file lives in the user's profile.
    }
  }

  async token() {
    const all = this.readCache();
    const cached = all[this.instance.host];
    if (cached && cached.expires_at - 60_000 > this.now()) return cached.access_token;
    let fresh;
    if (cached?.refresh_token) {
      fresh = await this.request({ grant_type: 'refresh_token', refresh_token: cached.refresh_token }).catch(() => undefined);
    }
    fresh ||= await this.request(this.grantParams());
    all[this.instance.host] = {
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token || cached?.refresh_token,
      expires_at: this.now() + Number(fresh.expires_in || 1800) * 1000,
    };
    this.writeCache(all);
    return fresh.access_token;
  }

  invalidate() {
    const all = this.readCache();
    if (all[this.instance.host]) {
      all[this.instance.host].expires_at = 0;
      this.writeCache(all);
    }
  }

  grantParams() {
    const a = this.instance.auth;
    const base = {
      client_id: secret(this.loaded, a.client_id_env, 'OAuth client id'),
      client_secret: secret(this.loaded, a.client_secret_env, 'OAuth client secret'),
    };
    if (a.grant === 'client_credentials') return { grant_type: 'client_credentials', ...base };
    return {
      grant_type: 'password',
      ...base,
      username: secret(this.loaded, a.username_env, 'ServiceNow username'),
      password: secret(this.loaded, a.password_env, 'ServiceNow password'),
    };
  }

  async request(params) {
    const a = this.instance.auth;
    const body = new URLSearchParams(params);
    if (params.grant_type === 'refresh_token') {
      body.set('client_id', secret(this.loaded, a.client_id_env, 'OAuth client id'));
      body.set('client_secret', secret(this.loaded, a.client_secret_env, 'OAuth client secret'));
    }
    const res = await this.fetch(`https://${this.instance.host}/oauth_token.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = {};
    }
    if (!res.ok || !json.access_token) {
      throw new AuthError(`OAuth ${params.grant_type} failed on ${this.instance.host} (HTTP ${res.status}): ${json.error_description || json.error || text.slice(0, 200)}`);
    }
    return json;
  }
}
