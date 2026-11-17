# Build a page

A UI Builder page in a Next Experience workspace or app, for any module. Example: "use UI Builder to build a page that shows the HRSD onboarding process".

There are two paths:
- **Fast path** (steps 4 to 6): when the page is an attention board, meaning summary cards, a list of what needs attention with the reason on each row, and a breakdown by group. That covers most "show the X that need attention" requests in any module. The compiler builds it in about a minute.
- **Template path** (steps 7 to 9): for every other shape.

1. Restate the goal. Name the persona (HR agent, manager, new hire, service desk lead), the one question the page answers for them, and the module. In the same message, ask for anything only the user can give (**kiwi-mode**, "Fast by default"). Check: the goal fits in two sentences.
2. Call `sn_instance_info`. Create `kiwi/<page-slug>` with `sn_update_set`. Check: `update_set_ok` is true.
3. Recon with **sn-recon**, in parallel where you can:
   - the module's plugins;
   - the table and fields behind the question, with `sn_schema`;
   - real counts for each candidate reason, with `sn_query`;
   - the target workspace's path (`sys_ux_page_registry`);
   - whether the ATF runner is on.
   Check: every field the page reads is confirmed, and each reason matches real records.
4. **Fast path. Write the spec.**
   - Fields: `name`, `route`, `title` in the persona's words, `subtitle`, `table`, `query`, `noun`.
   - `reasons`, most urgent first. Each is `empty` (field blank), `equals` (field = value) or `sla_breached`, with a colour, a hint and an icon.
   - Labels and the breakdown heading.
   - An audience role. Create the role with `sn_upsert` if it doesn't exist, and don't let it contain `itil` or `admin`.
   Check the spec against `../../next-experience-design/references/rubric.md` on paper. Check: no table names in labels, and the most urgent reason comes first.
5. **Fast path. Build.** `sn_ux_build_page` with `dry_run: true`, then for real. Check: `status: written`, and every record has `captured_in_update_set: true`.
6. **Fast path. Adjust.** Change the spec and call `sn_ux_build_page` again. It updates the same records in place. Then go to step 10.
7. **Template path. Design** with **sn-architect** only if no archetype fits: two layouts as ASCII wireframes with data bindings, scored against the rubric. Check: the chosen layout passes every "must" on paper.
8. **Template path. Template and data.**
   - Export the closest existing page with `sn_ux_export_page`, with `out_path` set, and have a subagent summarise it.
   - Choose the data path from **ui-builder** "Data": OOTB GraphQL or record data resources first. A transform data broker needs an ACL that the MCP server can't create (`NEEDS_SECURITY_ADMIN`).
   Check: the data path needs no ACL you can't create.
9. **Template path. Build.** Edit the bundle with a script over the file, then `sn_ux_upsert_page` with `bundle_path`, `remap_ids: true` and `dry_run: true`, then for real. Add the route in your scope. Check: every written record is captured.
10. Verify with **sn-verify**:
    - open the page at desktop and narrow widths;
    - compare each count on screen with `sn_query` for the same filter;
    - click one summary card and one row;
    - check the empty state.
    Check: screenshots saved, counts match, and every rubric "must" holds.
11. `sn_app_audit` on the app. Check: no critical or high finding about what you built.
12. One review round with `kiwi-reviewer` on the screenshots and the update set. Run a second round only if a rubric must or a critical or high finding fails. Check: the reviewer's verdict.
13. List the update set contents with `sn_update_set` action `contents`. Check: nothing is in Default, and every page record is listed.
14. Reply per kiwi-mode's "Writing the reply", with the page URL, a screenshot, the audit summary and the elapsed time.
