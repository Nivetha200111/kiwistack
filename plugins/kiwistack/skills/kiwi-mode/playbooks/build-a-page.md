# Build a page

A UI Builder page in a Next Experience workspace or app, for any module. Example: "use UI Builder to build a page that shows the HRSD onboarding process".

1. Restate the goal. Name the persona (HR agent, manager, new hire, service desk lead), the one question the page answers for them, and the module. Check: the goal fits in two sentences.
2. Call `sn_instance_info`. Create `kiwi/<page-slug>` with `sn_update_set`. Check: `update_set_ok` is true.
3. Recon with **sn-recon**. Confirm the module's plugins, the tables and states behind the question, real record counts, the target experience (`sys_ux_page_registry`), and two or three existing pages in that experience. Check: you can name every table and field the page will read, each confirmed with `sn_schema`.
4. Choose an archetype from `../../ui-builder/references/archetypes.md` and write the page brief: persona, primary question, the data shape (each data resource, its fields and filters), client states, events, route and parameters, and the empty, loading and error states. Check: the brief names no component that `sn_component_catalog` did not return.
5. Design with **sn-architect**: two layouts as ASCII wireframes with data bindings, scored against `../../next-experience-design/references/rubric.md`. Pick one, or build both as variants when the scores are close. Check: the chosen layout passes every "must" in the rubric on paper.
6. Get a template. Export the closest existing page with `sn_ux_export_page` (a subagent reads the bundle and returns its structure). Check: the bundle's `warnings` are empty or explained.
7. Build the server side first. Data that needs logic goes in a Fluent script include or a data broker with its own ACL (**fluent-sdk**, **server-scripting**, **principle-least-privilege-acls**), with an ATF test. Check: the ATF test for the data passes.
8. Build the page. Edit the template bundle (composition, data resources, client states, events, labels), then `sn_ux_upsert_page` with `remap_ids: true` and `dry_run: true`, then for real. Check: every written record has `captured_in_update_set: true`.
9. Add the route to the experience. A new route record in your scope is fine. Editing an existing OOTB route or app config is `needs_approval`, so ask. Check: the route URL is known.
10. Verify with **sn-verify**: open the page in the built-in browser at desktop and narrow widths, with real data and with an empty filter. Check: screenshots saved and every rubric "must" holds.
11. Critique loop. `kiwi-reviewer` scores the screenshots against the rubric. Fix and re-verify, at most three rounds, then report what still fails. Check: the reviewer's verdict.
12. List the update set contents with `sn_update_set` action `contents`. If you used the SDK, sync the repo (**fluent-sdk**, "Keeping source complete"). Check: nothing is in Default, and every page record is listed.
13. Reply per kiwi-mode's "Writing the reply", with the page URL, a screenshot and the ATF result.
