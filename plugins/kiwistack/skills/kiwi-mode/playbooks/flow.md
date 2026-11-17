# Flow

A Flow Designer flow, subflow or custom action. Example: "when an onboarding case is approved, create the IT, facilities and manager tasks".

1. Restate the goal: trigger, outcome, who is affected. Check: you can describe it as "when X, then Y, for Z".
2. Call `sn_instance_info`. Create `kiwi/flow-<slug>`.
3. Recon with **sn-recon**: existing flows, business rules and workflows on the same table and trigger, so you don't double-fire. Check `sys_hub_flow` for active flows on the table. Check: you can list what already reacts to the trigger.
4. Design with **flow-designer**: trigger and condition, steps, the subflows and actions to reuse (spokes before scripts), error handling, run-as user. Write it as numbered steps with data pills named. Check: no step needs a script that an OOTB action already covers.
5. Build it the way **flow-designer** prescribes for this instance (Fluent when the SDK supports flows, otherwise Flow Designer in the browser). Never write `sys_hub_*` records with `sn_upsert`. Check: the flow is saved and activated in your scope.
6. Test: an ATF test that creates the trigger condition and asserts the outcome, or a test execution in Flow Designer with the execution details captured. Check: the execution shows every step completed.
7. Review gate with **sn-interrogate**. Reply with the flow name, the trigger, and the test execution as evidence.
