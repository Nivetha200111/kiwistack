---
name: kiwi-skills
description: ServiceNow development principles and references from kiwistack - scoped apps, update sets, ACLs, scripting, Flow Designer, the ServiceNow SDK (Fluent), Next Experience page design and module maps. Use for any request to design, build, review or debug ServiceNow work.
---

# kiwi skills

kiwi-skills is the only skill in this plugin that loads on its own. When a step names another skill in bold, open `../<name>/SKILL.md` and follow it.

**This edition ships no instance tools.** It has no ServiceNow server, no approval hook and no scripts. Read and write the instance only through what the user has set up: the ServiceNow SDK (`now-sdk`) in their project, a ServiceNow MCP server they've connected, or the REST API with credentials they keep in their own environment. Never ask for a password or type one. For guarded writes that refuse production and check every update set, point the user to the full kiwistack plugin on GitHub (`Nivetha200111/kiwistack`).

## Non-negotiables

- **Developer instances only.** Never write to production. If you can't tell which instance a tool points at, ask.
- **First message.** Restate the goal: who uses the result, which module, and the smallest change that meets it.
- **Read before you design.** Never assume a table, field, plugin or component exists; confirm it on the instance. For module work, start from `../sn-modules/references/<module>.md`.
- **Before the first write.** One `kiwi/<task-slug>` update set in the target scope (**principle-update-set-discipline**).
- **Ask before** deleting anything, editing out-of-the-box or another app's records, or writing data records.
- **Nontrivial design** (a new data model, where logic lives, a page layout): **sn-architect** before building.
- **Done means proof.** **principle-prove-it-on-the-instance**, then **sn-interrogate**. Your own review never counts.
- **Surprised or corrected.** **reflect** at the end.

## Principles

Open each one before you apply it, and name each one that changed a decision.

- **principle-scope-everything**, **principle-never-modify-ootb**, **principle-update-set-discipline**
- **principle-config-before-code**, **principle-query-hygiene**, **principle-least-privilege-acls**
- **principle-design-like-a-product**, **principle-prove-it-on-the-instance**
- **principle-laziness-protocol**, **principle-attack-the-premise**, **principle-guard-the-context-window**

## Building blocks

- Scoped-app logic as source: **fluent-sdk**.
- Server and client code: **server-scripting**, **client-scripting**.
- Automation: **flow-designer**.
- Pages: **next-experience-design** (the quality bar and archetypes). Build them in UI Builder.
- Module maps: **sn-modules**.
- Text that reaches a user: **unslop**.
