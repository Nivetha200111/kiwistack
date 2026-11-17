#!/usr/bin/env node
// stdio transport: one JSON-RPC message per line in, one per line out. Logs go to stderr.
import { createInterface } from 'node:readline';
import { createServer } from './server.mjs';

const server = createServer();
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
    return;
  }
  try {
    const res = await server.handle(msg);
    if (res) process.stdout.write(JSON.stringify(res) + '\n');
  } catch (e) {
    process.stderr.write(`kiwistack-servicenow: ${e.stack || e}\n`);
    if (msg?.id !== undefined) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(e.message || e) } }) + '\n');
    }
  }
});
