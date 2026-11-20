// Builds plugins/kiwistack-skills, the text-only edition of kiwistack for the Claude plugin directory.
// The directory takes only Markdown, JSON, YAML and images from plugins that aren't from a Verified
// organization, so the edition has no MCP server, no hooks and no scripts. Its skills are copied from
// plugins/kiwistack and rewritten so they don't depend on the guarded ServiceNow server.
//
//   node tools/build-skills-edition.mjs          rebuild the copied skills
//   node tools/build-skills-edition.mjs --check  fail if the edition is out of date (run by npm test)
//
// Every rewrite names text that must exist in the source. When a source skill changes, the build
// fails here instead of shipping a stale or half-rewritten edition.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'plugins', 'kiwistack', 'skills');
const out = join(root, 'plugins', 'kiwistack-skills', 'skills');
const overrides = join(root, 'tools', 'skills-edition');
const check = process.argv.includes('--check');

// Skills copied into the edition. Left out: kiwi-mode, kiwi-team, kiwi-models, kiwi-help, setup-kiwistack,
// sn-recon, sn-verify, ui-builder and atf, which drive the guarded server's tools.
const SKILLS = [
  'principle-attack-the-premise', 'principle-config-before-code', 'principle-design-like-a-product',
  'principle-guard-the-context-window', 'principle-laziness-protocol', 'principle-least-privilege-acls',
  'principle-never-modify-ootb', 'principle-prove-it-on-the-instance', 'principle-query-hygiene',
  'principle-scope-everything', 'principle-update-set-discipline',
  'client-scripting', 'server-scripting', 'flow-designer', 'fluent-sdk', 'next-experience-design',
  'sn-architect', 'sn-interrogate', 'sn-modules', 'unslop', 'reflect',
];
// Single reference files the edition needs from skills it doesn't copy: [from, to], relative to skills/.
const EXTRA = [
  ['kiwi-team/references/findings.md', 'sn-interrogate/references/findings.md'],
  ['ui-builder/references/archetypes.md', 'next-experience-design/references/archetypes.md'],
];

const GO_AHEAD = "the user's go-ahead";
// Rewrites per output file (relative to skills/): [exact text, replacement].
const REWRITE = {
  'principle-attack-the-premise/SKILL.md': [
    ['Check `captured_in_update_set`.', "Check the record's `sys_update_xml` entry in the set."],
    ['(`sn_query`, an ATF step, the browser network panel)', '(a read-only query, an ATF step, the browser network panel)'],
  ],
  'principle-guard-the-context-window/SKILL.md': [
    ['- `sn_ux_export_page` bundles, often hundreds of records with long JSON fields.', '- UI Builder page exports, often hundreds of records with long JSON fields.'],
    ['- `sn_schema` on task-based tables, often hundreds of fields.', '- Dictionary reads on task-based tables, often hundreds of fields.'],
    ['- `sn_query` without tight `fields` and `limit`.', '- Table queries without a tight `sysparm_fields` and `sysparm_limit`.'],
  ],
  'principle-laziness-protocol/SKILL.md': [
    ['Deleting is `needs_approval`, so propose it.', `Deleting needs ${GO_AHEAD}, so propose it.`],
  ],
  'principle-least-privilege-acls/SKILL.md': [
    [' The MCP server refuses ACL writes up front with `NEEDS_SECURITY_ADMIN`.', ''],
    [' (**ui-builder**, "Routes and variants")', ''],
  ],
  'principle-never-modify-ootb/SKILL.md': [
    ['or a tool returns OUT_OF_SCOPE.', 'or a write lands outside your scope.'],
    ['Editing in place is `needs_approval`, and', `Editing in place needs ${GO_AHEAD}, and`],
  ],
  'principle-prove-it-on-the-instance/SKILL.md': [
    ['matched against `sn_query`', 'matched against a query you ran yourself'],
    ['- `captured_in_update_set: true` for each write, and the update set contents listed.', '- Every write found in the update set (`sys_update_xml`), and the contents listed.'],
  ],
  'principle-scope-everything/SKILL.md': [
    ['- Check that `sn_instance_info` shows the right scope and that `update_set_ok` is true before the first write.',
      "- Before the first write, check the application picker shows the target scope and the update set picker shows the task's set, not Default."],
    ['- When `sn_upsert` reports `record_scope_ok: false`, stop.', '- When a record you wrote lands in another scope, stop.'],
  ],
  'principle-update-set-discipline/SKILL.md': [
    ['whenever a write reports captured_in_update_set false.', "whenever a write doesn't land in the set."],
    ['- `sn_update_set` action `create` before the first write. If a set with that name is already in progress, it is reused.',
      '- Create the set before the first write. If a set with that name is already in progress, reuse it.'],
    ["- After each write, read `captured_in_update_set`. If it's `false`, or there's a `warning`, stop and report.",
      "- After each write, check that the record's `sys_update_xml` entry is in the set. If it isn't, stop and report."],
    ['Writing them is `needs_approval`.', `Write them only with ${GO_AHEAD}.`],
    ['- Finish with `sn_update_set` action `contents`, and list it in the reply.', "- Finish by listing the set's contents (its `sys_update_xml` records) in the reply."],
  ],
  'server-scripting/SKILL.md': [
    ['Confirm them on the instance with **sn-recon**.', 'Confirm them on the instance before you use them.'],
  ],
  'sn-architect/SKILL.md': [
    ['the recon note from **sn-recon**', 'what you read on the instance'],
    ['(`kiwi-agent`, background)', '(background subagents)'],
    ['(from `sn_component_catalog` only)', "(only components the instance has, from `sys_ux_lib_component`)"],
    ['decide from screenshots (**sn-verify**).', 'decide from screenshots of both.'],
  ],
  'unslop/SKILL.md': [
    ['when kiwi-slop-checker reviews a report', 'when reviewing a report'],
  ],
  'fluent-sdk/SKILL.md': [
    ['They go through **ui-builder**.', "Build them in UI Builder, or with the full kiwistack plugin's page tools."],
    ["If the user can't, build what you can through the MCP server (`sn_upsert` for roles, script includes, ATF tests) and list what's left for them: ACLs can't go through the MCP server.",
      "If the user can't, stop and list what they need to set up. This edition has no other way to write to the instance."],
    ['5. Run the ATF suite (`sn_atf_run_suite`) and verify (**sn-verify**).', '5. Run the ATF suite on the instance, then check the result yourself: the records, the page and the update set.'],
    ['UI Builder records written through the MCP server live on the instance and in the `kiwi/` update set, not in the repo.', 'UI Builder records live on the instance and in the `kiwi/` update set, not in the repo.'],
    ['Treat deletes as `needs_approval`, and', `Treat deletes as needing ${GO_AHEAD}, and`],
  ],
  'sn-interrogate/SKILL.md': [
    ['Use as the review gate in every kiwistack build playbook, or for /sn-interrogate.', 'Use as the review gate before ServiceNow work is called done, or for /sn-interrogate.'],
    ['`../kiwi-team/references/findings.md`', '`references/findings.md`'],
    ['re-verify with **sn-verify**', 'check it again on the instance'],
  ],
  'sn-interrogate/references/findings.md': [
    ['QA, security, the reviewer and the slop checker all report findings in this shape. The evidence gate (`scripts/check-run.mjs`) rejects a findings file where any finding has no `Proof:` line.',
      "Every reviewer reports findings in this shape. A finding with no `Proof:` line doesn't count."],
    ['- Proof: `sn_query cmdb_ci_computer install_status=1^sys_class_name=cmdb_ci_server` returned 41 rows',
      '- Proof: a query on `cmdb_ci_computer` for `install_status=1^sys_class_name=cmdb_ci_server` returned 41 rows'],
    ['- Expected: domain.md defines "laptop" as', '- Expected: the agreed definition of "laptop" is'],
    ['from `goal.md`, `domain.md` or the design rubric.', 'from the goal, the agreed definitions or the design rubric.'],
    ['- A tool call you ran, with its input and the part of the output that shows the problem: `sn_query`, `sn_get`, `sn_update_set` `contents` or `capture_audit`, `sn_app_audit`.',
      "- A query you ran, with its input and the part of the output that shows the problem: a Table API request, a background script on a dev instance, the update set's `sys_update_xml` list, or a ServiceNow MCP tool the user has connected."],
    ['- A screenshot you saved in the run folder, with what it shows.', '- A screenshot you took, with what it shows.'],
    ["and the coordinator doesn't send it to the builder.", "and nobody acts on it until it's proven."],
  ],
  'flow-designer/SKILL.md': [
    ['records** with `sn_upsert`.', 'records** through the Table API or a script.'],
    ['(`sys_flow_context` with `sn_query`)', '(`sys_flow_context`)'],
  ],
  'next-experience-design/SKILL.md': [
    ['`../ui-builder/references/archetypes.md`', '`references/archetypes.md`'],
    ['realistic numbers from **sn-recon**', 'realistic numbers read from the instance'],
    ['(**sn-verify**, `kiwi-reviewer`)', '(a `kiwi-reviewer` agent)'],
  ],
  'next-experience-design/references/rubric.md': [
    ['match `sn_query` for the same filter', 'match a query run for the same filter'],
    ['sn_query returns 11', 'the query returns 11'],
  ],
  'next-experience-design/references/archetypes.md': [
    ['from `sn_component_catalog` on the instance', 'from `sys_ux_lib_component` on the instance'],
  ],
  'sn-modules/SKILL.md': [
    ['before sn-recon confirms the details on the instance.', 'before confirming the details on the instance.'],
    ['**Confirm every table and field with `sn_schema` and every plugin with `sn_plugins` before you use it** (**sn-recon**).',
      "**Confirm every table and field in the instance's dictionary and every plugin in its plugin list before you use them.**"],
    ['run **sn-recon** with `sn_plugins` and `sn_schema`, then add a reference following `../kiwi-mode/playbooks/authoring-a-skill.md`.',
      "read the instance's plugin list and dictionary first, and note what you find in the project's `CLAUDE.md`."],
  ],
};
// Rewrites applied to every file under sn-modules/references after the per-file ones.
const MODULE_REFS = [
  [/with `sn_schema` and `sn_plugins`/g, "against the instance's dictionary and plugin list"],
  [/with `sn_schema`/g, "against the instance's dictionary"],
  [/[Ss]earch `sn_plugins` for/g, (m) => (m[0] === 'S' ? 'Search' : 'search') + ' the plugin list for'],
];
// Tool names of the guarded server. None may survive in the edition.
const SERVER_TOKEN = /\bsn_(query|get|upsert|delete|schema|plugins|instance_info|update_set|ux_[a-z_]+|atf_run_suite|app_audit|component_catalog)\b|needs_approval|captured_in_update_set|\.kiwi\/runs|scripts\//;

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const built = new Map(); // relative path -> text
for (const name of SKILLS) {
  for (const f of files(join(src, name))) built.set(relative(src, f).replaceAll('\\', '/'), readFileSync(f, 'utf8'));
}
for (const [from, to] of EXTRA) built.set(to, readFileSync(join(src, from), 'utf8'));
if (existsSync(overrides)) {
  for (const f of files(overrides)) built.set(relative(overrides, f).replaceAll('\\', '/'), readFileSync(f, 'utf8'));
}

const problems = [];
for (const [rel, edits] of Object.entries(REWRITE)) {
  if (!built.has(rel)) { problems.push(`${rel}: listed in REWRITE but not built`); continue; }
  let text = built.get(rel);
  for (const [from, to] of edits) {
    if (!text.includes(from)) problems.push(`${rel}: source text not found: "${from.slice(0, 80)}"`);
    text = text.split(from).join(to);
  }
  built.set(rel, text);
}
for (const [rel, text] of built) {
  let t = text;
  if (rel.startsWith('sn-modules/references/')) for (const [re, to] of MODULE_REFS) t = t.replace(re, to);
  built.set(rel, t);
  const m = t.match(SERVER_TOKEN);
  if (m) problems.push(`${rel}: still mentions "${m[0]}" from the guarded server; add a rewrite`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

if (check) {
  const stale = [];
  const have = existsSync(out) ? files(out).map((f) => relative(out, f).replaceAll('\\', '/')) : [];
  const own = new Set(have.filter((rel) => !built.has(rel) && rel.split('/')[0] === 'kiwi-skills'));
  for (const [rel, text] of built) {
    const p = join(out, rel);
    if (!existsSync(p) || readFileSync(p, 'utf8') !== text) stale.push(rel);
  }
  for (const rel of have) if (!built.has(rel) && !own.has(rel)) stale.push(`${rel} (not from the source)`);
  if (stale.length) {
    console.error(`kiwistack-skills is out of date. Run node tools/build-skills-edition.mjs\n${stale.join('\n')}`);
    process.exit(1);
  }
  console.log(`build-skills-edition: ${SKILLS.length} skills up to date.`);
} else {
  for (const name of SKILLS) rmSync(join(out, name), { recursive: true, force: true });
  for (const [rel, text] of built) {
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    writeFileSync(join(out, rel), text);
  }
  console.log(`build-skills-edition: wrote ${built.size} files for ${SKILLS.length} skills.`);
}
