# Audit an app

A security and hygiene audit of one scoped app, whoever built it: kiwistack, Studio's Build Agent, a partner, or a person. It's read-only from start to finish.

1. Restate what is being audited, and why: before a release, after a generated build, or a health check. Check: you know the app's scope, for example `x_acme_app`.
2. Call `sn_instance_info`. No update set is needed, because nothing is written.
3. Run `sn_app_audit` with `scope` and `out_path` (a .json file). Check: `skipped` is empty, or each skipped check is listed in the reply with its reason.
4. Confirm each critical and high finding yourself before you report it:
   - **REST endpoints:** read the operation script with `sn_get` (`max_field_chars`) and the ACLs it enforces.
   - **Cross-scope privileges:** check whether any script in the app uses each one (`sn_query` on `sys_script_include`, `sys_ws_operation` and client scripts, filtered with `scriptLIKE<name>`).
   - **Roles:** check who holds the role (`sys_user_has_role`).
   Check: each critical and high finding has a record you read.
5. Where the app has a page, open it with **sn-verify**. If you have a user without the app's role, note what that user can see. Never sign in as that user yourself; ask the user to check.
6. Reply with:
   - the summary counts;
   - each critical and high finding in one sentence: what is exposed, to whom, and the concrete fix with the record to change;
   - medium and low findings grouped by check;
   - what wasn't checked, and why.

   Offer to make the fixes. They run through the normal **Feature** or **Bug fix** playbook, in the app's scope.
