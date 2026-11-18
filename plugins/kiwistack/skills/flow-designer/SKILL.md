---
name: flow-designer
description: Designing and building ServiceNow Flow Designer flows, subflows and custom actions, including lifecycle orchestration (HRSD onboarding, request fulfilment, change approvals) and calling subflows from scripts. Use for any automation with triggers, waits, approvals or integrations.
disable-model-invocation: true
---

# Flow Designer

## When a flow is the right tool

Use a flow for orchestration: several steps, waits, approvals, tasks for different groups, or integrations through spokes. Field defaults and validation stay in business rules or policies. Lifecycle events in HRSD have their own activity-set mechanism. Configure activity sets before you reach for a custom flow (**principle-config-before-code**).

## Design first

Write the flow as numbered steps before building it:
- **Trigger**: the table, insert or update, the condition, and run-as (system, or the user who triggered it).
- **Steps**: each OOTB action or subflow, its inputs as named data pills, and its outputs.
- **Branches and waits**, with their timeouts.
- **Error handling**: what happens when a step fails, and who is told.
- **Idempotency**: running twice on the same record must not create duplicate tasks. Look before you create.

Reuse, in this order: OOTB actions and spokes, existing subflows in the module, then a custom action with a script step. A custom action's script follows **server-scripting**.

## How to build it on this instance

1. **Fluent, when the installed SDK exports flow constructs.** Check `node_modules/@servicenow/sdk` (**fluent-sdk**). Then the flow is source-controlled like everything else.
2. **Otherwise, Flow Designer in the built-in browser.** Open `https://<host>/now/flow-designer` (the user signs in), create the flow in the target scope, build the steps from the design, save, and activate. Take a screenshot of the finished flow for the reply.
3. **Never write `sys_hub_flow`, `sys_hub_action_instance` or other `sys_hub_*` records** with `sn_upsert`. Flows compile into snapshots, and hand-written records produce flows that look right and don't run.

## Calling a subflow from a script

```js
var outputs = sn_fd.FlowAPI.getRunner()
  .subflow('x_acme_kiwi.provision_onboarding_equipment')
  .inForeground()
  .withInputs({ hr_case: current.getUniqueValue() })
  .run()
  .getOutputs();
```

Prefer `inBackground()` unless the caller needs the outputs right away.

## Testing

- An ATF test that creates the trigger condition and asserts the outcome: tasks created, fields set, approvals requested.
- Or a Flow Designer test run. Check the execution details (`sys_flow_context` with `sn_query`) and confirm every step completed.
