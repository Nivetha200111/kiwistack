// @ts-check
// Minimal MCP server over JSON-RPC 2.0. Transport-agnostic: handle() takes one parsed
// message and returns the response object, or null for notifications.
import { TOOLS } from './tools.mjs';
import { loadConfig, resolveInstance } from './config.mjs';
import { TokenProvider } from './auth.mjs';
import { SnClient } from './client.mjs';
import { Guard } from './guard.mjs';

export const SERVER_INFO = { name: 'kiwistack-servicenow', version: '0.4.1' };
const DEFAULT_PROTOCOL = '2025-06-18';

/** Builds one { instance, client, guard } per instance profile, on first use. */
export function defaultContextFactory({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const contexts = new Map();
  let loaded;
  return (name) => {
    loaded ||= loadConfig(env);
    const instance = resolveInstance(loaded, name);
    if (!contexts.has(instance.name)) {
      const tokens = new TokenProvider({ loaded, instance, fetchImpl });
      const client = new SnClient({ host: instance.host, tokens, fetchImpl });
      contexts.set(instance.name, { instance, client, guard: new Guard({ instance, client }) });
    }
    return contexts.get(instance.name);
  };
}

export function createServer({ contextFor = defaultContextFactory(), tools = TOOLS } = {}) {
  const byName = new Map(tools.map((t) => [t.name, t]));

  async function callTool(name, args) {
    const tool = byName.get(name);
    if (!tool) return { content: [{ type: 'text', text: `Unknown tool ${name}.` }], isError: true };
    try {
      const ctx = contextFor(args?.instance);
      const result = await tool.handler(args || {}, ctx);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      const err = /** @type {any} */ (e);
      const payload = {
        error: err.code || 'ERROR',
        message: err.message,
        ...(err.status ? { http_status: err.status } : {}),
        ...(err.detail ? { detail: err.detail } : {}),
        ...(err.body ? { body: err.body } : {}),
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError: true };
    }
  }

  async function handle(msg) {
    const { id, method, params } = msg || {};
    const reply = (result) => ({ jsonrpc: '2.0', id, result });
    const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
    if (id === undefined || id === null) return null;
    switch (method) {
      case 'initialize':
        return reply({
          protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: 'Guarded ServiceNow access for kiwistack. Start with sn_instance_info. Every metadata write needs a current kiwi/ update set.',
        });
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case 'tools/call':
        return reply(await callTool(params?.name, params?.arguments));
      default:
        return fail(-32601, `Method not found: ${method}`);
    }
  }

  return { handle, callTool };
}
