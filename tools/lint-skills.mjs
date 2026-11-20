#!/usr/bin/env node
// Checks the skills and agents of both plugins (plugins/kiwistack and the text-only plugins/kiwistack-skills):
// - frontmatter present, name matches its folder or file, description present and under 1024 chars
// - every **kebab-case** bold reference names an existing skill or agent
// - every relative .md path in backticks or links resolves
// - every `sn_*` MCP tool name mentioned exists in the server
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkDirectoryRules } from './directory-rules.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const full = join(root, 'plugins', 'kiwistack');
const { TOOLS } = await import(pathToFileURL(join(full, 'mcp', 'servicenow', 'src', 'tools.mjs')).href);
const TOOL_TOKEN = /^sn_(instance|query|get|schema|plugins|component|update_set|upsert|delete|ux_|atf)/;

const errors = [];
const err = (file, msg) => errors.push(`${relative(root, file)}: ${msg}`);
const summaries = [];

// Each plugin: its folder, the server tools its skills may name (none for the text-only edition),
// and the one skill allowed to load on its own (see "1. Trigger" below).
const PLUGINS = [
  { dir: full, tools: new Set(TOOLS.map((t) => t.name)), modelInvoked: new Set(['kiwi-mode']), playbooks: 'kiwi-mode' },
  { dir: join(root, 'plugins', 'kiwistack-skills'), tools: new Set(), modelInvoked: new Set(['kiwi-skills']), directory: true },
];

function frontmatter(file, text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) {
    err(file, 'missing frontmatter');
    return {};
  }
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
  });
}

function lintPlugin(p) {
  const skillsDir = join(p.dir, 'skills');
  const agentsDir = join(p.dir, 'agents');
  const toolNames = p.tools;
  const skillNames = new Set(readdirSync(skillsDir).filter((n) => existsSync(join(skillsDir, n, 'SKILL.md'))));
  const agentNames = new Set(readdirSync(agentsDir).filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)));

  for (const name of readdirSync(skillsDir)) {
    const file = join(skillsDir, name, 'SKILL.md');
    if (!existsSync(file)) {
      err(join(skillsDir, name), 'skill folder has no SKILL.md');
      continue;
    }
    const fm = frontmatter(file, readFileSync(file, 'utf8'));
    if (fm.name !== name) err(file, `frontmatter name "${fm.name}" does not match folder "${name}"`);
    if (!fm.description) err(file, 'missing description');
    else if (fm.description.length > 1024) err(file, `description is ${fm.description.length} chars (max 1024)`);
  }

  for (const n of agentNames) {
    const file = join(agentsDir, `${n}.md`);
    const fm = frontmatter(file, readFileSync(file, 'utf8'));
    if (fm.name !== n) err(file, `frontmatter name "${fm.name}" does not match file "${n}"`);
    if (!fm.description) err(file, 'missing description');
  }

  for (const file of [...walk(skillsDir), ...walk(agentsDir)]) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\*\*([a-z0-9]+(?:-[a-z0-9]+)+)\*\*/g)) {
      if (!skillNames.has(m[1]) && !agentNames.has(m[1])) err(file, `**${m[1]}** is not a skill or agent`);
    }
    const paths = [...text.matchAll(/`([^`\s]+\.md)`/g), ...text.matchAll(/\]\(([^)\s]+\.md)\)/g)].map((m) => m[1]);
    for (const p of paths) {
      if (p.includes('<') || p.startsWith('~') || p.startsWith('/') || /^[a-z]+:/.test(p)) continue;
      if (!/^(\.|references\/|playbooks\/)/.test(p)) continue;
      if (!existsSync(resolve(dirname(file), p))) err(file, `path ${p} does not resolve`);
    }
    for (const m of text.matchAll(/`(sn_[a-z_]+)`/g)) {
      if (TOOL_TOKEN.test(m[1]) && !toolNames.has(m[1])) err(file, `\`${m[1]}\` is not a tool this plugin ships`);
    }
  }

  // The skill checklist from "Building Great Agent Skills: The Missing Manual" (Matt Pocock), as checks.
  // 1. Trigger. Every model-invoked skill adds its description to every session (context load), so
  //    only the entry point is model-invoked. Any other skill must set disable-model-invocation.
  const MODEL_INVOKED = p.modelInvoked;
  // 2. Structure. SKILL.md stays small; material only one branch needs goes behind a pointer in references/.
  const SKILL_WORDS = 900;
  const DESC = { modelSkill: 350, agent: 160 };
  let alwaysOn = 0;
  for (const name of skillNames) {
    const file = join(skillsDir, name, 'SKILL.md');
    const text = readFileSync(file, 'utf8');
    const fm = frontmatter(file, text);
    const userOnly = fm['disable-model-invocation'] === 'true';
    if (MODEL_INVOKED.has(name)) {
      if (userOnly) err(file, 'listed as model-invoked in lint-skills.mjs but sets disable-model-invocation');
      if ((fm.description || '').length > DESC.modelSkill) err(file, `model-invoked description is ${fm.description.length} chars (max ${DESC.modelSkill}): it loads into every session`);
      alwaysOn += (fm.description || '').length;
    } else if (!userOnly) {
      err(file, 'decide the trigger: add "disable-model-invocation: true", or add the skill to MODEL_INVOKED in lint-skills.mjs with a reason');
    }
    const words = text.replace(/^---[\s\S]*?\n---/, '').split(/\s+/).filter(Boolean).length;
    if (words > SKILL_WORDS) err(file, `SKILL.md is ${words} words (max ${SKILL_WORDS}): move material only one branch needs into references/ behind a pointer`);
  }
  for (const n of agentNames) {
    const file = join(agentsDir, `${n}.md`);
    const fm = frontmatter(file, readFileSync(file, 'utf8'));
    if ((fm.description || '').length > DESC.agent) err(file, `agent description is ${fm.description.length} chars (max ${DESC.agent}): it loads into every session`);
    alwaysOn += (fm.description || '').length;
  }
  // 4. Pruning. One source of truth: a long sentence that appears word for word in two files is duplication.
  const seen = new Map();
  for (const file of [...walk(skillsDir), ...walk(agentsDir)]) {
    const body = readFileSync(file, 'utf8').replace(/^---[\s\S]*?\n---/, '').replace(/```[\s\S]*?```/g, ' ');
    for (const raw of body.split(/(?<=[.!?])\s+|\n+/)) {
      const s = raw.replace(/^[\s>*#-]+|\*\*/g, '').trim();
      if (s.split(/\s+/).length < 14) continue;
      const key = s.toLowerCase();
      if (seen.has(key) && seen.get(key) !== file) err(file, `duplicates a sentence in ${relative(root, seen.get(key))}: "${s.slice(0, 70)}..."`);
      else seen.set(key, file);
    }
  }

  if (p.playbooks) {
    const mode = readFileSync(join(skillsDir, p.playbooks, 'SKILL.md'), 'utf8');
    for (const pb of readdirSync(join(skillsDir, p.playbooks, 'playbooks'))) {
      if (!mode.includes(`playbooks/${pb}`)) err(join(skillsDir, p.playbooks, 'playbooks', pb), `playbook is not listed in ${p.playbooks}`);
    }
  }
  if (p.directory) for (const [file, msg] of checkDirectoryRules(p.dir)) err(file, msg);
  summaries.push(`${relative(root, p.dir)}: ${skillNames.size} skills (${MODEL_INVOKED.size} model-invoked), ${agentNames.size} agents, ${toolNames.size} tools. Always-on descriptions: ${alwaysOn} chars.`);
}
for (const p of PLUGINS) lintPlugin(p);

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}
console.log(`lint-skills OK\n  ${summaries.join('\n  ')}`);
