# Release prep

Get finished work ready to move to test. kiwistack never promotes, completes or commits anything to another instance itself.

1. Restate what is moving and where it goes next. Check: the update set names, or the app and version.
2. Completeness. `sn_update_set` action `contents` for each set. Compare against what the task built: every page record, script, ACL, role and property is there. Look for the usual misses: data broker ACLs, `sys_ui_policy_action`, choice lists, roles, properties, records that landed in Default. Check: a list of anything missing, or none.
3. Dependencies. Records outside the scope, plugins the work assumes, data the page needs (lifecycle event types, HR services, assignment groups). Check: a dependency list.
4. Run the full ATF suite for the app. Check: green, or each failure explained.
5. For SDK work, confirm the repo has the full source and builds clean (**fluent-sdk**). Check: `now-sdk build` succeeds from a clean checkout.
6. Write hand-off notes: what changed, how to verify after moving, the dependencies, and the rollback.
7. Ask the user before marking any update set complete. Never move it yourself. Reply with the notes.
