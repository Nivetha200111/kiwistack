#!/usr/bin/env node
// Checks the kiwistack plugin's skills and agents:
// - frontmatter present, name matches its folder or file, description present and under 1024 chars
// - every **kebab-case** bold reference names an existing skill or agent
// - every relative .md path in backticks or links resolves
// - every `sn_*` MCP tool name mentioned exists in the server
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = join(root, 'plugins', 'kiwistack');
const skillsDir = join(plugin, 'skills');
const agentsDir = join(plugin, 'agents');
const { TOOLS } = await import(pathToFileURL(join(plugin, 'mcp', 'servicenow', 'src', 'tools.mjs')).href);
const toolNames = new Set(TOOLS.map((t) => t.name));
const TOOL_TOKEN = /^sn_(instance|query|get|schema|plugins|component|update_set|upsert|delete|ux_|atf)/;

const errors = [];
const err = (file, msg) => errors.push(`${relative(root, file)}: ${msg}`);

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
    if (TOOL_TOKEN.test(m[1]) && !toolNames.has(m[1])) err(file, `\`${m[1]}\` is not a servicenow MCP tool`);
  }
}

const kiwiMode = readFileSync(join(skillsDir, 'kiwi-mode', 'SKILL.md'), 'utf8');
for (const pb of readdirSync(join(skillsDir, 'kiwi-mode', 'playbooks'))) {
  if (!kiwiMode.includes(`playbooks/${pb}`)) err(join(skillsDir, 'kiwi-mode', 'playbooks', pb), 'playbook is not listed in kiwi-mode');
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}
console.log(`lint-skills: ${skillNames.size} skills, ${agentNames.size} agents, ${toolNames.size} tools. OK.`);
