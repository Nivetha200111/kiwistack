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
  skills/sn-recon|sn-architect|sn-interrogate|sn-verify|reflect|unslop     workflow skills
  skills/ui-builder|next-experience-design|fluent-sdk|server-scripting|client-scripting|flow-designer|atf
  skills/sn-modules/         starting maps per module (tables, lifecycles, page ideas)
  skills/principle-*         short rules: scope, never modify OOTB, update set discipline, query hygiene, ...
  agents/kiwi-agent.md       worker for delegated build steps
  agents/kiwi-*.md           the team: recon, domain, designer, builder, qa, security, reviewer, slop checker
  mcp/servicenow/            guarded ServiceNow MCP server (Node, zero dependencies)
  hooks/                     forces a permission prompt for deletes and approved out-of-scope writes
  scripts/                   preflight (approval hook check), proof gate, model resolution
tools/lint-skills.mjs        checks skills, links, tool names, triggers, size and duplication
tools/spike-ux-roundtrip.mjs phase 1 spike: clone a UI Builder page through the API and diff it
```

**How the skills are written.** They follow the checklist in Matt Pocock's talk "Building Great Agent Skills: The Missing Manual", and the linter enforces it:
- **Trigger.** Only `kiwi-mode` is model-invoked. Every other skill is user-invoked (`/name`) and opened by path from the step that needs it. Claude Code keeps a user-invoked skill's description out of context, so a session carries about 1,300 characters of kiwistack descriptions (kiwi-mode plus the agents) instead of about 12,000. (`claude plugin details` still estimates every description as always-on.)
- **Structure.** Each `SKILL.md` stays under 900 words. Material only one branch needs, such as UI Builder's template path, sits in `references/` behind a pointer.
- **Pruning.** A long sentence that appears in two files fails the lint.

**How it builds.**
- **SDK first.** Anything the ServiceNow SDK (Fluent) covers is source code in git: tables, ACLs, business rules, script includes, client scripts and ATF tests.
- **UI Builder pages as records.** Fluent can't author UI Builder pages, so kiwistack exports a real page as a bundle of `sys_ux_*` records, edits it, and writes it back through the MCP server.

## A team, not one agent

Every build runs as a team of specialists (`/kiwi-team`, used by `/kiwi-mode`). The coordinator decides and reports; it doesn't do the work or check its own work.

| Role | Does | Writes to instance | Default model |
|-|-|-|-|
| `kiwi-recon` | Instance facts, real counts, traps such as subclasses and ignored fields | No | Sonnet |
| `kiwi-domain` | Turns the business question into exact definitions ("laptop" means servers excluded) | No | Opus |
| `kiwi-designer` | Persona, page spec, rubric check | No (files only) | Opus |
| `kiwi-builder` | Builds through the guarded tools | **Yes**, the only one | Opus |
| `kiwi-qa` | Re-checks every number against the domain definition, clicks, widths, states | ATF only | Sonnet |
| `kiwi-security` | App audit, least privilege, who can see it | No | Sonnet |
| `kiwi-reviewer` | Independent review, on a different model from the builder | No | Opus |
| `kiwi-slop-checker` | Hunts slop: generic or placeholder page text, table names shown to users, invented numbers, leftover records, debug-laden scripts, filler in the report | No | Sonnet |

**How it runs:**
- A preflight first proves the approval hook still asks before deletes and `user_approved` writes. If someone disabled it, the run doesn't start.
- Recon and domain run in parallel, then the design, then the build.
- QA, security, the reviewer and the slop checker then run in parallel, followed by one fix round.
- Every finding carries a proof: the query it ran and what came back, a quoted line, or a screenshot. Suspicions go under "Not proven" and never reach the builder.
- Hand-offs are files in `.kiwi/runs/<task>/`.

**Switch models per role** with `/kiwi-models`, or in a `models.json` per user (`~/.kiwistack/`) or per project (`.kiwi/`), for example `"qa": "opus@xhigh"`.

**Verification is the product.**
- A run isn't done until `scripts/check-run.mjs` passes. It needs:
  - a count table checked against the instance;
  - a screenshot;
  - security, review and slop verdicts;
  - a proof on every finding;
  - a capture audit: every record the run changed is in its `kiwi/` update set, including writes made through the SDK or the browser (`sn_update_set` action `capture_audit`);
  - no unresolved count mismatches;
  - no placeholder text, with the domain's own vocabulary, code and query values exempt;
  - no table names in user-facing labels.
- Anything nobody saw is reported as unverified.

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
/plugin marketplace add Nivetha200111/kiwistack
```

```bash
/plugin install kiwistack@kiwistack
```

Then run `/setup-kiwistack` to connect your dev instance over OAuth.

**Cost.** A team run spends a lot of tokens: eight or nine agents re-checking each other. The HRSD onboarding build took 156 minutes. Use `/kiwi-models` to put roles on cheaper models, and use a single `kiwi-agent` step for small changes.

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

## License

MIT. See [LICENSE](LICENSE). kiwistack is a personal project, not affiliated with or endorsed by ServiceNow.
