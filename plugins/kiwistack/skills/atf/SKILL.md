---
name: atf
description: Automated Test Framework tests for kiwistack work - writing tests from observable behaviour (preferably in Fluent), structuring suites per app, impersonation tests for ACLs, server-side script steps for data brokers and script includes, and running suites through sn_atf_run_suite. Use when a playbook says to test, reproduce a bug, or prove a change.
disable-model-invocation: true
---

# ATF

ATF is how kiwistack proves server behaviour on the instance (**principle-prove-it-on-the-instance**).

## Writing tests

- **Test what a user or caller can observe.** For example: "an ITIL user can't read the onboarding data", "the case priority becomes 2 for gold accounts", "the data broker returns one entry per active hire". Don't test that a script calls a particular function.
- **Write the test first** for features and bug fixes, and see it fail for the right reason.
- **Prefer Fluent ATF tests** when the installed SDK supports them (**fluent-sdk**). Otherwise build them through the MCP server, as below. Use the ATF UI in the browser only as a last resort: see "Browser fallback".
- **Arrange data inside the test.** ATF rolls back the records it creates. Never depend on existing dev data that someone might change.
- **Useful step types:**
  - Impersonate, to test ACLs and role-based behaviour.
  - Record Insert, Record Update and Record Query, to arrange and assert data.
  - Run Server Side Script (Jasmine), for script includes and data broker logic.
  - Form steps, for UI policies and client scripts in Core UI.
- **One suite per app**, named after the scope, for example `x_acme_kiwi - all`, plus a suite per feature when that's useful.

## Building tests through the MCP server

Step inputs (the script of a server-side step, the table of a Record Insert) are not fields on `sys_atf_step`. They are `sys_variable_value` rows, and the Table API ignores `inputs.*` sent with the step. So build a test in three writes:

1. `sn_upsert` the test (`sys_atf_test`) and, if needed, the suite and its test link.
2. `sn_upsert` each step on `sys_atf_step`: `test`, `step_config` and `order`. Find the step config by name in `sys_atf_step_config`.
3. Set each input with `sn_upsert` on `sys_variable_value`. Pass `values` with `document: "sys_atf_step"`, `document_key: <step sys_id>`, `variable: <input variable sys_id>` and `value`, plus `match_query: "document=sys_atf_step^document_key=<step>^variable=<variable>"`, so a default row the instance already made is updated rather than duplicated. The input variables belong to the step config: `sn_query` `atf_input_variable` with `model=<step_config sys_id>` and fields `sys_id,element,label` (confirm the table with `sn_schema` if that returns nothing).

The MCP server treats these rows as part of their step: no approval is needed when the step is in your scope, and the result shows `captured_as: sys_atf_step/<id>` with `captured_in_update_set`. Read the step back afterwards to check each input holds the value you sent.

## Browser fallback

Only when the MCP server can't build a test. Read `references/browser-fallback.md` first: it sets the scope and update set pickers so the test lands in the `kiwi/` set.

## Running

- **Prerequisites.** The ATF runner must be on (`sn_atf.runner.enabled = true`; it is off on many PDIs). The CI/CD API plugin (`sn_cicd`) must be active, and the acting user needs the `sn_cicd.sys_ci_automation` role. Check these in recon, not after a failed run. The property is OOTB, so changing it needs the user's approval.
- `sn_atf_run_suite` with `suite_name` or `suite_sys_id`. It waits for the result and returns the per-test results.
  - `status: atf_runner_disabled` means the property is off. Nothing was started. Ask the user to turn it on.
  - `status: run_failed` carries the HTTP status and the response body. Read the body before guessing at a cause.
  - `stray_update_set_entries`: a CI/CD run creates `sys_atf_schedule` and `sys_atf_schedule_run` records that get captured in the current update set, even when the run fails. Tell the user and back them out before the set is completed (needs approval).
- If the runner can't be turned on, say in the reply that the tests are written but not run, so nothing is ATF-proven.
- Report failures with the test, the step, and the message.

## Example: a server-side step for a data broker script include

A worked example, with the step inputs and the assertion, is in `references/server-step-example.md`. Open it when you write your first server-side step in a task.
