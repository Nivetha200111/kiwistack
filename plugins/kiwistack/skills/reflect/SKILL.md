---
name: reflect
description: Captures what a kiwistack run learned so the next run doesn't repeat the mistake, by turning it into structure (a guard, a test, a linter rule) or, failing that, a short edit to the right skill or module reference. Use after a correction from the user, a surprise on the instance, a failed approach, or for /reflect.
---

# reflect

## Process

1. **Name the lesson in one sentence**, with the evidence: what you expected, what the instance actually did, and the record or result that showed it.
2. **Choose the strongest place to encode it.**
   1. **The MCP server** (`plugins/kiwistack/mcp/servicenow`). A rule a tool can enforce, such as a guard check or a refusal, with a test in `test/`.
   2. **The linter** (`tools/lint-skills.mjs`). A rule about how skills are written.
   3. **A module reference** (`skills/sn-modules/references/<module>.md`). A fact about tables, states or plugins.
   4. **The UI Builder references** (`skills/ui-builder/references/`). A fact about records, components or archetypes.
   5. **A playbook step or principle.** A procedure or a judgment.
   Encode it once, in the strongest place available. Don't repeat it in several skills.
3. **Make the edit** following `../kiwi-mode/playbooks/authoring-a-skill.md`, and run `node tools/lint-skills.mjs` and the MCP tests.
4. **Report** the lesson, where it now lives, and how the next run will behave differently.

Facts that only hold for one instance (custom tables, local naming) go in the project's own `CLAUDE.md` or notes, not in the plugin.
