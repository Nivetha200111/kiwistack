# Feature

New or changed behaviour in the scoped app: tables, business rules, script includes, client scripts, UI policies, UI actions, ACLs.

1. Restate the goal, the persona and the smallest change that meets it. Check: you can say what the user will observe when it works.
2. Call `sn_instance_info`. Make sure the SDK project exists (**fluent-sdk**) and create `kiwi/<feature-slug>` with `sn_update_set` for anything the SDK can't cover. Check: `update_set_ok` is true.
3. Recon with **sn-recon**: the tables, existing rules and flows on them, OOTB behaviour you must not break. Check: you can list what already fires on the affected tables.
4. Name the data shape first: new tables and fields, states and their transitions, who reads and writes what. Use **sn-architect** when it crosses more than one table or touches the client and server. Check: the shape is written in the task notes.
5. Choose the mechanism per **principle-config-before-code**: UI policy before client script, flow before business rule for orchestration, business rule before script include, script include for anything reused. Check: one sentence per piece on why this mechanism.
6. Write the ATF test first, in Fluent, from the observable behaviour (**atf**). Check: it fails for the right reason before the change.
7. Build in Fluent (**server-scripting**, **client-scripting**, **principle-query-hygiene**, **principle-least-privilege-acls**). `now-sdk build`, then `now-sdk install` (ask the first time). Check: the build is clean and the install succeeds.
8. Prove it with **sn-verify**: run the ATF suite and exercise the behaviour once in the browser when it has a UI. Check: green suite, screenshot if UI.
9. Review gate with **sn-interrogate**. Check: the reviewer's verdict, with every finding fixed or dismissed with a reason.
10. Reply per kiwi-mode's "Writing the reply".
