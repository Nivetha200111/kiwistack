---
name: ui-builder
description: How kiwistack builds UI Builder (Next Experience) pages as records through the servicenow MCP server. Covers the sys_ux_* record model, starting from an exported template, editing compositions, data resources, client states and events, adding routes and variants, and page archetypes. Use for any UI Builder page, workspace view or variant in any module.
---

# UI Builder

The ServiceNow SDK can't author UI Builder pages, so kiwistack builds them as records. There are two ways.

## First choice: the page compiler

`sn_ux_build_page` turns a short spec into a complete workspace page and writes it in about a minute:
- route, screen type and screen;
- the page and 7 client scripts;
- a render include;
- the open-record event;
- an audience.

It builds an **attention board**:
- summary cards (one for "needs you now", one per reason) that filter the page;
- a list of the records that need attention, with the reasons on each row (SLA-breached rows first);
- a breakdown by group that also filters;
- loading, empty, error and no-access states.

It runs on the OOTB GraphQL record query, so reads go through the tables' own ACLs and no new ACL is needed.

- **Reasons** are `empty` (a field is blank), `equals` (a field has a value) or `sla_breached` (a breached `task_sla` on the record). List the most urgent first: it sets the row colour and sort order.
- **Rebuilds.** Calling it again with the same `route` updates the same records. Fix rounds are a spec change, not a JSON edit.
- **Verified** on a Brazil PDI in Service Operations Workspace with `incident` (with SLA) and `change_request` (with `equals` and `empty` reasons). Counts matched the instance, and the card filters worked.
- **Limits.** One table per page. The SLA reason needs a table that extends `task`. The breakdown field must be a reference, normally `assignment_group`. For any other shape, use the template path below.

## Template path: export, edit, upsert

kiwistack exports a real page as a bundle, edits the bundle, and writes it back with `sn_ux_upsert_page` into the current `kiwi/` update set.

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

1. Export straight to a file: `sn_ux_export_page` with `out_path` (an absolute `.json` path in the scratchpad) returns only a summary. Exporting a sub-page stops at its parent page: the shell's macroponent and client scripts become `external_refs`. Check `routes` and `unresolved_ids` in the summary.
2. Summarise it: the layout tree (element ids, component names, slots), the data resources (their type, inputs and bound properties), the client states, the event handlers, and the client scripts.
3. Make the edits as a script over the JSON (Node), not by hand in chat. The script is the artifact a reviewer can rerun.
   - Change the labels, titles and route names to the new page's.
   - Replace or add elements in the composition, copying the element shape from an existing element of the same component.
   - Point data resources at your data broker or at the module's tables, with the fields from the page brief.
   - Remove elements the new page doesn't need. Removing beats hiding.
4. Validate locally. Parse every JSON field, check every element id is unique, and check every binding refers to an existing data resource or client state.
5. Write with `sn_ux_upsert_page` and `bundle_path` (the edited file): dry run, then real. To change one large field, such as a macroponent's composition, use `sn_upsert` with `values_from_files` rather than pasting the JSON into the call.

## Data

Pick the data path in this order. The first two need no new ACL, so the MCP route can build them end to end.

1. **OOTB GraphQL or record data resources.** For example *GlideRecord Collection Query*, record lists and aggregates. They read through the tables' existing ACLs, so nothing new is exposed. Copy the data resource's shape from an exported page that uses it, set the table, the encoded query, the fields and a limit. Shape the result in a client script include if needed: grouping and counting a bounded result (a few hundred rows) client-side is fine.
2. **Several OOTB data resources combined.** One per table, each bounded, joined in a client script include.
3. **A transform data broker** whose server script calls a script include in your scope (**server-scripting**, **principle-query-hygiene**), with an ATF test. Use it only when 1 and 2 can't answer the question (heavy aggregation, data the user may not read row by row). It needs an execute ACL (**principle-least-privilege-acls**). **Without that ACL the broker is denied to everyone, admin included**, and returns an unwrapped `acl_failure_result`. The MCP server can't create ACLs (`sn_upsert` refuses with `NEEDS_SECURITY_ADMIN`), so ship the broker and its ACL through the SDK (**fluent-sdk**), or ask the user to create the ACL before you build the page on it. Decide this at design time, not after the page renders empty.

Return only the fields the page shows.

## Browser fallbacks

When something has to be done in the browser (UI Builder, a form the Table API can't fill), first switch the application picker to your scope and the update set picker to the `kiwi/` set. Saves otherwise land in the app's **Default** set, and switching applications in the browser also resets the update set the MCP server writes to. Afterwards run `sn_instance_info` (check `update_set_ok`) and `sn_update_set` action `contents`.

## Routes and variants

- **A new page in an existing experience.** A new screen type, screen and route in your scope that point at the experience's app config. Inserts in your scope don't need approval.
- **A variant of an OOTB page.** A new screen on the OOTB screen type, with your condition or audience and an order before the OOTB screen. The OOTB records stay untouched.
- **Restricting a page to a role.** `sys_ux_screen` has no roles field. Create an audience (`sys_ux_applicability`, its `roles` field holds the role) and link it to the screen through the screen-to-audience m2m table. Find that table's name with `sn_query` on `sys_db_object`, `nameLIKEapplicability`, and confirm its fields with `sn_schema`. Both records are metadata in your scope.
- **A new experience.** Only when no existing workspace or app fits the persona. Clone the smallest existing experience shell and say why in the reply.

## Keeping source complete

UI Builder records live in the update set. If the app is also an SDK project, follow **fluent-sdk** "Keeping source complete" after the page is done, so the repo doesn't fall behind the instance.
