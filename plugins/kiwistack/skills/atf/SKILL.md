---
name: atf
description: Automated Test Framework tests for kiwistack work - writing tests from observable behaviour (preferably in Fluent), structuring suites per app, impersonation tests for ACLs, server-side script steps for data brokers and script includes, and running suites through sn_atf_run_suite. Use when a playbook says to test, reproduce a bug, or prove a change.
---

# ATF

ATF is how kiwistack proves server behaviour on the instance (**principle-prove-it-on-the-instance**).

## Writing tests

- **Test what a user or caller can observe.** For example: "an ITIL user can't read the onboarding data", "the case priority becomes 2 for gold accounts", "the data broker returns one entry per active hire". Don't test that a script calls a particular function.
- **Write the test first** for features and bug fixes, and see it fail for the right reason.
- **Prefer Fluent ATF tests** when the installed SDK supports them (**fluent-sdk**). Otherwise create them in the ATF UI in the built-in browser, in the target scope.
- **Arrange data inside the test.** ATF rolls back the records it creates. Never depend on existing dev data that someone might change.
- **Useful step types:**
  - Impersonate, to test ACLs and role-based behaviour.
  - Record Insert, Record Update and Record Query, to arrange and assert data.
  - Run Server Side Script (Jasmine), for script includes and data broker logic.
  - Form steps, for UI policies and client scripts in Core UI.
- **One suite per app**, named after the scope, for example `x_acme_kiwi - all`, plus a suite per feature when that's useful.

## Running

- `sn_atf_run_suite` with `suite_name` or `suite_sys_id`. It waits for the result and returns the per-test results.
- This needs the CI/CD API plugin (`sn_cicd`) and the `sn_cicd.sys_ci_automation` role for the acting user. If either is missing, tell the user, and run the suite from the ATF UI in the browser as a fallback.
- Report failures with the test, the step, and the message.

## Example: a server-side step for a data broker script include

```js
(function (outputs, steps, params, stepResult, assertEqual) {
  var rows = new x_acme_kiwi.OnboardingProgress().forActiveCases({ limit: 10 });
  assertEqual({ name: 'returns an array', shouldbe: true, value: Array.isArray(rows) });
  var created = steps('<record insert step sys_id>').record_id;
  var mine = rows.filter(function (r) { return r.caseId === created; });
  assertEqual({ name: 'includes the new hire', shouldbe: 1, value: mine.length });
})(outputs, steps, params, stepResult, assertEqual);
```

The names here are illustrative. Use the step ids and the script include that the test actually creates.
