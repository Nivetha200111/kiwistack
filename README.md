# kiwistack

An agent stack for ServiceNow development, in the style of poteto's [pstack](https://github.com/cursor/plugins/tree/main/pstack).

Tell it what you want in plain words:

```
/kiwi-mode use UI Builder to build a page that shows the HRSD onboarding process
```

kiwistack then does the following:
- reads your dev instance to learn what's actually there;
- designs a page that looks like a product, not an admin list;
- builds it into its own `kiwi/` update set in your scoped app;
- proves it works with ATF and screenshots;
- has an independent reviewer check it before reporting back.

It works across modules: HRSD, ITSM, CSM, SPM, IRM, FSM, CMDB and HAM/SAM.

## How it's put together

It has the same shape as pstack. One orchestrator routes each request to a playbook. Playbooks call workflow skills, principles and domain skills. A guarded MCP server does the instance work.

```
plugins/kiwistack/
  skills/kiwi-mode/          orchestrator + playbooks (build a page, feature, bug fix, flow, review, ...)
  skills/sn-recon|sn-architect|sn-interrogate|sn-verify|reflect     workflow skills
  skills/ui-builder|next-experience-design|fluent-sdk|server-scripting|client-scripting|flow-designer|atf
  skills/sn-modules/         starting maps per module (tables, lifecycles, page ideas)
  skills/principle-*         short rules: scope, never modify OOTB, update set discipline, query hygiene, ...
  agents/kiwi-agent.md       worker for delegated build steps
  agents/kiwi-reviewer.md    read-only independent reviewer
  mcp/servicenow/            guarded ServiceNow MCP server (Node, zero dependencies)
  hooks/                     forces a permission prompt for deletes and approved out-of-scope writes
tools/lint-skills.mjs        checks skills, links and tool names
tools/spike-ux-roundtrip.mjs phase 1 spike: clone a UI Builder page through the API and diff it
```

**How it builds.**
- **SDK first.** Anything the ServiceNow SDK (Fluent) covers is source code in git: tables, ACLs, business rules, script includes, client scripts and ATF tests.
- **UI Builder pages as records.** Fluent can't author UI Builder pages, so kiwistack exports a real page as a bundle of `sys_ux_*` records, edits it, and writes it back through the MCP server.

## Safety model

The MCP server enforces these. They don't rely on prompts alone.

- **Allowlisted dev instances only.** It refuses any instance marked prod in the config, and any instance whose `glide.installation.production` property is true.
- **Update sets.** Every metadata write needs a current `kiwi/<task>` update set in the target scope. It refuses Default, closed sets and sets from other apps. Each write is checked as captured in the update set.
- **Approval required.** Edits to OOTB or other apps' records, data-record writes and deletes come back as `needs_approval`. They run only after you say yes in chat, and a hook makes Claude Code ask you again.
- **Secrets stay local.** They live in `~/.kiwistack/`, never in the repo, and agents never type them.

## Install

```bash
/plugin marketplace add <path-or-git-url-of-this-repo>
```

```bash
/plugin install kiwistack@kiwistack
```

Then run `/setup-kiwistack` to connect your dev instance over OAuth.

## Status

Built and tested locally against a fake in-memory instance (26 tests). **Not yet run against a real instance.** Before relying on page building, run the Phase 1 spike:

1. Build a small page by hand in UI Builder, in your scoped app, on the dev instance.
2. Run the spike against it:

   ```bash
   node tools/spike-ux-roundtrip.mjs --from sys_ux_screen_type:<sys_id>
   ```

3. Open both pages and compare them. Record what round-tripped in `plugins/kiwistack/skills/ui-builder/references/record-model-ux.md`.

## Development

```bash
npm test
```

This runs the MCP server tests and the skill linter.
