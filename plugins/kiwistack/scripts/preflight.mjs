#!/usr/bin/env node
// Preflight for a kiwi-team run: proves the approval hook is registered and still asks.
// It runs the real hook with probe inputs, so a commented-out rule fails here, not halfway through a build.
// Usage: node preflight.mjs   (exit 0 = ready, 1 = refuse the run; prints each problem)
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = (name) => `mcp__plugin_kiwistack_servicenow__${name}`;

// Each probe is a call the hook must turn into a permission prompt, or must let through silently.
export const PROBES = [
  { why: 'a delete', input: { tool_name: TOOL('sn_delete'), tool_input: { table: 'sys_script', sys_id: 'f'.repeat(32) } }, ask: true },
  { why: 'a write flagged user_approved (out-of-scope, OOTB or data record)', input: { tool_name: TOOL('sn_upsert'), tool_input: { table: 'incident', values: {}, user_approved: true } }, ask: true },
  { why: 'a page bundle flagged user_approved', input: { tool_name: TOOL('sn_ux_upsert_page'), tool_input: { bundle: {}, user_approved: true } }, ask: true },
  { why: 'a plain read', input: { tool_name: TOOL('sn_query'), tool_input: { table: 'incident' } }, ask: false },
];

export function preflight({ pluginRoot = PLUGIN_ROOT } = {}) {
  const problems = [];
  const hooksFile = join(pluginRoot, 'hooks', 'hooks.json');
  const hookScript = join(pluginRoot, 'hooks', 'approval-gate.mjs');
  if (!existsSync(hooksFile) || !existsSync(hookScript)) return [`The approval hook is missing (${hooksFile}, ${hookScript}).`];

  let entries = [];
  try {
    entries = JSON.parse(readFileSync(hooksFile, 'utf8')).hooks?.PreToolUse || [];
  } catch (e) {
    return [`hooks/hooks.json is not valid JSON: ${e.message}`];
  }
  const registered = entries.some(
    (e) => e.matcher && new RegExp(`^(?:${e.matcher})$`).test(TOOL('sn_delete')) && new RegExp(`^(?:${e.matcher})$`).test(TOOL('sn_upsert')) &&
      (e.hooks || []).some((h) => /approval-gate\.mjs/.test(h.command || '')),
  );
  if (!registered) problems.push('hooks/hooks.json no longer runs approval-gate.mjs before ServiceNow writes and deletes.');

  for (const p of PROBES) {
    const r = spawnSync(process.execPath, [hookScript], { input: JSON.stringify(p.input), encoding: 'utf8' });
    let decision = null;
    try {
      decision = r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision : null;
    } catch {
      decision = 'unreadable';
    }
    if (p.ask && decision !== 'ask') problems.push(`The approval hook did not ask for ${p.why}. It has been disabled or edited (hooks/approval-gate.mjs).`);
    if (!p.ask && decision) problems.push(`The approval hook asked for ${p.why}; it should stay silent.`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = preflight();
  if (problems.length) {
    console.log(`REFUSE THE RUN: ${problems.length} problem(s)\n- ${problems.join('\n- ')}\nAsk the user to restore the hook. Do not edit it yourself.`);
    process.exit(1);
  }
  console.log('Preflight passed: the approval hook asks for deletes and user_approved writes.');
}
