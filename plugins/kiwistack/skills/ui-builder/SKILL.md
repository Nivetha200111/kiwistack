---
name: ui-builder
description: How kiwistack builds UI Builder (Next Experience) pages as records through the servicenow MCP server. Covers the sys_ux_* record model, starting from an exported template, editing compositions, data resources, client states and events, adding routes and variants, and page archetypes. Use for any UI Builder page, workspace view or variant in any module.
---

# UI Builder

The ServiceNow SDK can't author UI Builder pages. kiwistack builds them as records. It exports a real page as a bundle, edits the bundle, and writes it back with `sn_ux_upsert_page` into the current `kiwi/` update set.

Before building, read:
- `references/record-model-ux.md`: the tables and how they connect. Its "Verified on" section tells you what the spike has confirmed.
- `references/archetypes.md`: page shapes and their component recipes.
- `../next-experience-design/SKILL.md`: the quality bar.

## Ground rules

- **Always start from an export.** Find the existing page closest to the archetype, preferably in the same experience, and run `sn_ux_export_page` on its screen type or screen. Hand-written compositions miss required fields the platform expects.
- **Only use components from `sn_component_catalog`.** Copy each component's definition reference from an existing composition that uses it. Don't guess ids.
- **Clone, don't edit.** Write with `remap_ids: true` so every record is new and in your scope. Updating an exported OOTB page in place is `needs_approval` (**principle-never-modify-ootb**).
- **Dry-run first.** `dry_run: true` shows the write order and catches records that need approval. Then write for real.
- **Check the result.** Every written record has `captured_in_update_set: true`, and the page renders (**sn-verify**). If the instance rejects the bundle, or the page renders blank, export your written page again and diff it against the template before changing anything else (**principle-attack-the-premise**).

## Working on a bundle

Have a subagent do this. Bundles are large (**principle-guard-the-context-window**).

1. Save the export to a JSON file in the scratchpad.
2. Summarise it: the layout tree (element ids, component names, slots), the data resources (their type, inputs and bound properties), the client states, the event handlers, and the client scripts.
3. Make the edits as a script over the JSON (Node), not by hand in chat. The script is the artifact a reviewer can rerun.
   - Change the labels, titles and route names to the new page's.
   - Replace or add elements in the composition, copying the element shape from an existing element of the same component.
   - Point data resources at your data broker or at the module's tables, with the fields from the page brief.
   - Remove elements the new page doesn't need. Removing beats hiding.
4. Validate locally. Parse every JSON field, check every element id is unique, and check every binding refers to an existing data resource or client state.
5. Write with `sn_ux_upsert_page`: dry run, then real.

## Data

- Prefer OOTB data resources (record lists, aggregates, the GraphQL record queries) when they return what the page needs.
- For shaped or aggregated data, such as progress per hire or counts by owner, write a transform data broker whose server script calls a script include in your scope (**server-scripting**, **principle-query-hygiene**). It needs an execute ACL (**principle-least-privilege-acls**) and an ATF test.
- Return only the fields the page shows. Compute in the server, not in client scripts.

## Routes and variants

- **A new page in an existing experience.** A new screen type, screen and route in your scope that point at the experience's app config. Inserts in your scope don't need approval.
- **A variant of an OOTB page.** A new screen on the OOTB screen type, with your condition or audience and an order before the OOTB screen. The OOTB records stay untouched.
- **A new experience.** Only when no existing workspace or app fits the persona. Clone the smallest existing experience shell and say why in the reply.

## Keeping source complete

UI Builder records live in the update set. If the app is also an SDK project, follow **fluent-sdk** "Keeping source complete" after the page is done, so the repo doesn't fall behind the instance.
