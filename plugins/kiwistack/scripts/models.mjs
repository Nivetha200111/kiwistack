#!/usr/bin/env node
// Resolves which model and effort each kiwistack role runs on.
// Order: <project>/.kiwi/models.json, then ~/.kiwistack/models.json, then the defaults below.
// Usage: node models.mjs [projectDir]   -> prints JSON { roles: { role: { model, effort, source } }, warnings }
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULTS = { recon: 'sonnet', domain: 'opus', designer: 'opus', builder: 'opus', qa: 'sonnet', security: 'sonnet', reviewer: 'opus', slop: 'sonnet' };
export const MODELS = new Set(['sonnet', 'opus', 'haiku', 'fable', 'inherit']);
export const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

function readSheet(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { error: `${path} is not valid JSON: ${e.message}` };
  }
}

export function resolveModels({ projectDir = process.cwd(), home = process.env.KIWISTACK_HOME || join(homedir(), '.kiwistack') } = {}) {
  const sheets = [
    ['project', join(projectDir, '.kiwi', 'models.json')],
    ['user', join(home, 'models.json')],
  ].map(([source, path]) => ({ source, path, sheet: readSheet(path) }));
  const warnings = sheets.filter((s) => s.sheet?.error).map((s) => s.sheet.error);
  const roles = {};
  for (const role of Object.keys(DEFAULTS)) {
    const hit = sheets.find((s) => s.sheet && !s.sheet.error && s.sheet.roles?.[role]);
    const raw = hit ? String(hit.sheet.roles[role]) : DEFAULTS[role];
    let [model, effort] = raw.split('@');
    const defaultEffort = sheets.find((s) => s.sheet?.default_effort)?.sheet.default_effort;
    effort = effort || defaultEffort || null;
    if (!MODELS.has(model)) {
      warnings.push(`${role}: unknown model "${model}" from the ${hit?.source} sheet; using default ${DEFAULTS[role]}.`);
      model = DEFAULTS[role];
    }
    if (effort && !EFFORTS.has(effort)) {
      warnings.push(`${role}: unknown effort "${effort}"; ignoring it.`);
      effort = null;
    }
    roles[role] = { model, effort, source: hit ? hit.source : 'default' };
  }
  for (const s of sheets) {
    for (const role of Object.keys(s.sheet?.roles || {})) if (!DEFAULTS[role]) warnings.push(`${s.source} sheet names unknown role "${role}".`);
  }
  if (roles.reviewer.model === roles.builder.model && roles.builder.model !== 'inherit') {
    warnings.push(`reviewer and builder both run on ${roles.builder.model}: kiwi-team adds a second reviewer on another model.`);
  }
  return { roles, warnings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(resolveModels({ projectDir: process.argv[2] || process.cwd() }), null, 2));
}
