---
name: sn-recon
description: Reads a ServiceNow instance before anyone designs or changes anything. Confirms plugins, tables, fields, states, real data volumes, existing customisations, and the experiences and pages a new UI would live beside. Use at the start of every kiwistack playbook, or for "how does X work on our instance".
disable-model-invocation: true
---

# sn recon

The instance is the source of truth. Module references, docs and memory are starting maps. Recon turns guesses into facts you can cite.

**ServiceNow silently ignores query conditions on fields that don't exist.** A filter like `major_incident_state=1` on an instance without Major Incident Management returns every row as if it had matched. So confirm each field with `sn_schema` before you filter on it, and distrust a result that looks unfiltered.

Keep output small. Ask for few fields and low limits. Send big exports or schema dumps to a subagent and keep its summary.

## What to establish

Collect what the task needs, not all of it.

1. **Context.** `sn_instance_info`: host, user, scope, update set.
2. **Module presence.** `sn_plugins` with the module's search term (for example `hr`, `csm`, `sow`, `grc`). Workspaces show under `experiences` by their URL path. If you will run ATF, also read `sn_atf.runner.enabled` and check that `sn_cicd` is active (**atf**, "Running"). Read `../sn-modules/references/<module>.md` for the plugin ids and tables to expect. If the plugin isn't active, stop and say so.
3. **Data model.** `sn_schema` for each table you'll read or write, with `include_choices` for state and stage fields. Note the parent chain (for example `sn_hr_le_case` extends `sn_hr_core_case` extends `task`).
4. **Real data.** `sn_query` with a tight filter and limit to see what actual records look like, how many there are, and which fields are populated. A design based on empty fields is wrong.
5. **What already runs on these tables.** Then you won't double up or break it.
   - Business rules: `sys_script` with `collection=<table>^active=true`, fields `name,when,order,filter_condition,sys_scope`.
   - Client scripts: `sys_script_client` with `table=<table>^active=true`.
   - UI policies: `sys_ui_policy` with `table=<table>^active=true`.
   - Flows: `sys_hub_flow` with `active=true` and the trigger table in its name or description, then read the trigger.
   - ACLs: `sys_security_acl` with `nameSTARTSWITH<table>`.
6. **For UI work.**
   - Experiences: `sys_ux_page_registry` with fields `sys_id,title,path,sys_scope`, filtered by title (for example `titleLIKEHR`).
   - Routes in the experience: `sys_ux_app_route`, filtered to the experience's app config.
   - The components available: `sn_component_catalog`.
   - One or two existing pages close to the target. Export them with `sn_ux_export_page` through a subagent, and get back their layout, data resources and components.
7. **Scope fit.** Which of the records you'll touch are in your scope, and which belong to the base system or other apps. The latter are `needs_approval` to edit.

## Output

A short recon note in the task notes:
- What exists: each fact with its `table/sys_id` or query.
- What doesn't exist, or surprised you.
- The constraints for the design: OOTB records to leave alone, plugins needed, data gaps.
