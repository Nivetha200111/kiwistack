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

## What kiwistack adds over Studio's Build Agent

Studio's Build Agent (Brazil) builds fast. Same request, same PDI: it shipped a working page in 16 minutes. kiwistack's job is to match that speed and ship something you can trust.

- **Audit any app: `sn_app_audit`.** A read-only security and hygiene audit of any scoped app, including apps the Build Agent made.
  - **What it checks:**
    - REST endpoints any employee can call;
    - client-callable script includes with no role check;
    - tables and data brokers without ACLs;
    - risky cross-scope privileges, such as outbound REST with `setBasicAuth`;
    - app roles that contain `admin` or `itil`;
    - missing ATF tests;
    - changes stuck in the Default update set.
  - **On the PDI** it found 2 high findings in the Build Agent's P1 app in about 6 seconds:
    - the data endpoint any employee can read;
    - five self-granted outbound-REST privileges.
- **Pages in about a minute: `sn_ux_build_page`.** A page compiler. A short spec (table, query, reasons, labels) becomes a complete Service Operations Workspace page:
  - summary cards that filter, a reason-tagged list and a group breakdown;
  - loading, empty, error and no-access states;
  - a role audience, written into a `kiwi/` update set.

  A new change-manager page was built and rendering on the PDI in 66 seconds, with every count matching the instance. Rebuilding the same route updates the page in place.
- **Least privilege by construction.** Pages read through the OOTB GraphQL record query, so table ACLs apply and no new data path is opened. The Build Agent's page exposed its data to every employee.
- **Proof, not "it saved".** Every write is checked as captured in the update set. Pages are verified against live counts, audited, and reviewed by an independent agent before kiwistack calls them done.
- **Works where the Build Agent doesn't.** It runs on any recent release, on instances without Now Assist licensing, and from your own repo and git workflow.

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

**Version 0.2.0.**
- 58 tests run against a fake in-memory instance.
- Proven end to end on a Brazil PDI:
  - a full `/kiwi-mode` page build;
  - pages compiled by `sn_ux_build_page` on `incident` and `change_request`;
  - `sn_app_audit` on two apps.

To check whether hand-edited UI Builder bundles round-trip on your own instance, run the spike:

```bash
node tools/spike-ux-roundtrip.mjs --from sys_ux_screen_type:<sys_id>
```

## Development

```bash
npm test
```

This runs the MCP server tests and the skill linter.
