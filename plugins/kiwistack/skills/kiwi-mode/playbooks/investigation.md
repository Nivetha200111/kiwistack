# Investigation

A read-only question about the instance: how does X work, why is Y configured this way, where does Z happen, should we do A or B.

1. Restate the question and what a good answer lets the user do. Check: one sentence.
2. Call `sn_instance_info`. No update set is needed, and you write nothing in this playbook.
3. Recon with **sn-recon**, narrowed to the question: the records involved (business rules, flows, ACLs, script includes, UI policies, data brokers), their order and conditions, and the plugins that own them. Check: each claim you plan to make has a record behind it.
4. Trace the path end to end. For "why did X happen", follow the record's lifecycle: client scripts and UI policies, then before rules, the engines (assignment, SLA, approvals), after and async rules, flows. Check: you can name the record responsible for each step.
5. When the evidence can't settle it, say what experiment would (an ATF test, a test record on dev with approval) instead of guessing.
6. Answer. Cite each record as `table/sys_id (name)` with what it does. Label anything inferred. Check: no claim without a record or a label.
