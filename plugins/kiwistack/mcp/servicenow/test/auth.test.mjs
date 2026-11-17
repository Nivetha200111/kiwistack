import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenProvider } from '../src/auth.mjs';
import { SnClient } from '../src/client.mjs';

const loaded = { home: '/nowhere', secrets: { ID: 'id', SECRET: 'sec', USER: 'u', PW: 'p' } };
const instance = (auth) => ({ host: 'kiwi-dev.service-now.com', auth: { grant: 'password', client_id_env: 'ID', client_secret_env: 'SECRET', username_env: 'USER', password_env: 'PW', ...auth } });

async function tokenBody(auth) {
  let sent;
  const fetchImpl = async (_url, init) => {
    sent = new URLSearchParams(init.body);
    return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 't', expires_in: 1800 }) };
  };
  await new TokenProvider({ loaded, instance: instance(auth), fetchImpl, persist: false }).token();
  return sent;
}

test('token requests ask for the useraccount scope by default (Zurich+ rejects unscoped tokens)', async () => {
  assert.equal((await tokenBody({})).get('scope'), 'useraccount');
});

test('a configured auth scope is sent instead, and an empty one sends none', async () => {
  assert.equal((await tokenBody({ scope: 'kiwistack_api' })).get('scope'), 'kiwistack_api');
  assert.equal((await tokenBody({ scope: '' })).has('scope'), false);
});

test('an "unscoped api" rejection explains how to fix the OAuth client', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 403,
    text: async () => JSON.stringify({ error: { message: 'User Not Authorized', detail: 'Access to unscoped api is not allowed' } }),
  });
  const client = new SnClient({ host: 'kiwi-dev.service-now.com', tokens: { token: async () => 't', invalidate() {} }, fetchImpl });
  await assert.rejects(client.query('incident'), /useraccount.*auth scope/);
});
