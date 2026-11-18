---
name: ui-builder
description: How kiwistack builds UI Builder (Next Experience) pages as records through the servicenow MCP server. Covers the sys_ux_* record model, starting from an exported template, editing compositions, data resources, client states and events, adding routes and variants, and page archetypes. Use for any UI Builder page, workspace view or variant in any module.
disable-model-invocation: true
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
- **Limits.** One table per page. The SLA reason needs a table that extends `task`. The breakdown field must be a reference, normally `assignment_group`. For any other shape, use the template path.

## Template path

For any other page shape, export a real page, edit the bundle and write it back. Read `references/template-path.md` first: it has the ground rules, the bundle workflow, the data path order, routes and variants, and browser fallbacks.

## Keeping source complete

UI Builder records live in the update set. If the app is also an SDK project, follow **fluent-sdk** "Keeping source complete" after the page is done, so the repo doesn't fall behind the instance.
