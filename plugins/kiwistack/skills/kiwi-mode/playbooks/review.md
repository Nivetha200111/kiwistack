# Review

Review an update set, a Fluent diff, a page, or a set of existing customisations.

1. Restate what is being reviewed and against what bar (pre-merge, pre-release, health check). Check: the target is a concrete update set, branch or page.
2. Collect it. For an update set use `sn_update_set` action `contents`, then read each changed record with `sn_get`. For Fluent use `git diff`. For a page, export it with `sn_ux_export_page` and open it with **sn-verify**.
3. Run **sn-interrogate**. Reviewers check the ServiceNow principles (scope, OOTB edits, query hygiene, ACLs, client/server split, update set completeness), correctness, and for pages the design rubric. Check: every finding names a record and a line or field.
4. Triage each finding as fix, dismiss (with a concrete reason) or ask. Check: no finding is left untriaged.
5. Reply with the findings ranked by severity, then what you fixed if you were asked to fix.
