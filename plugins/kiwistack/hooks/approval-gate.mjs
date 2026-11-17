#!/usr/bin/env node
// Forces a human permission prompt for ServiceNow calls the agent must not approve itself:
// every delete, and any call that sets user_approved (out-of-scope, OOTB or data-record writes).
import { readFileSync } from 'node:fs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const tool = String(input.tool_name || '');
const args = input.tool_input || {};
const reasons = [];
if (/__sn_delete$/.test(tool)) reasons.push(`delete ${args.table}/${args.sys_id}`);
if (args.user_approved === true) reasons.push('call is flagged user_approved (out-of-scope, OOTB or data-record write)');

if (reasons.length) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `kiwistack: ${reasons.join('; ')}. Approve only if you asked for this.`,
    },
  }));
}
process.exit(0);
