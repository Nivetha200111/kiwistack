# Bug fix

A reported defect: wrong value, rule not firing, page not loading, error in the log, ACL denying the wrong user.

1. Restate the defect as expected versus actual, for whom, and since when. Check: one sentence each.
2. Call `sn_instance_info`. Create `kiwi/fix-<slug>` with `sn_update_set`.
3. Reproduce before touching anything. Prefer an ATF test that fails (**atf**). Otherwise show the defect in the browser with **sn-verify**, or read the evidence in `syslog`, `sys_flow_context` or the record's history with `sn_query`. Check: you have seen it fail with your own tools.
4. Find the root cause with **sn-recon**: list everything that runs on the record in order (client scripts, UI policies, before rules, engines, after and async rules, flows, ACLs) and narrow it down. Fix where the system first went wrong, not where the symptom shows. Check: you can name the record and the line.
5. If two fixes based on the same assumption fail, apply **principle-attack-the-premise**: write the assumption down and test it directly.
6. Fix it in scope. If the cause is an OOTB record, copy or override it per **principle-never-modify-ootb**; editing in place is `needs_approval`. Check: the failing test now passes.
7. Run the wider ATF suite for the table or module. Check: nothing else turned red.
8. Review gate with **sn-interrogate**. Then reply with the cause, the fix, and the evidence that it failed before and passes now.
