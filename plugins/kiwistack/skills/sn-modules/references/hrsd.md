# HR Service Delivery (HRSD)

Confirm everything here with `sn_schema` and `sn_plugins`. Scopes and tables differ by release.

## Plugins and scopes

- HR core: scope `sn_hr_core`. Search `sn_plugins` for `hr`.
- Lifecycle events (onboarding, offboarding, transfers): scope `sn_hr_le`.
- Employee Center (the employee portal): Service Portal based, so it's not built with UI Builder.
- Journeys (on newer releases): search `sn_plugins` for `journey`. If they're installed, prefer configuring a journey over building a custom onboarding UI for employees.
- HR Agent Workspace: find it in `sys_ux_page_registry` with `titleLIKEHR`.

## Core tables

| Table | What | Notes |
|-|-|-|
| `sn_hr_core_case` | HR case | Extends `task`. Has HR service, subject person, opened for. |
| `sn_hr_le_case` | Lifecycle event case | Extends the HR case. One per onboarding or offboarding. |
| `sn_hr_core_task` | HR task | Extends `task`. Child work of a case, for HR and others. |
| `sn_hr_core_service` | HR service | Defines a case type, its template and its fulfilment. |
| `sn_hr_core_profile` | HR profile | Employee HR data. Sensitive. |
| `sn_hr_le_type` | Lifecycle event type | Onboarding, offboarding, and so on. |
| `sn_hr_le_activity_set` | Activity set | A stage-like group of activities, with a trigger condition. |
| `sn_hr_le_activity` | Activity | One task or action within an activity set, with its owner. |
| `sn_hr_le_activity_set_context` | Activity set context | Runtime record of an activity set for one case: its state and when it started. |

The parent chain is `sn_hr_le_case` → `sn_hr_core_case` → `task`. Activity set contexts tie a case to its activity sets, which is how you show stages per hire.

## Onboarding as a process

- An onboarding case (`sn_hr_le_case` of an onboarding type) has activity sets, typically named by phase (pre-boarding, day 1, first week, 30/60/90). Each set has activities that create HR tasks, IT requests, facilities tasks and to-dos for the manager and the new hire.
- **Stages for a stepper** come from the case's activity set contexts, ordered by the activity set's order, with state not started, in progress or complete.
- **Progress per owner** comes from tasks and requests related to the case, grouped by assignment group or task type.
- **At risk** usually means the start date is near and tasks are still open. Define it with the user, and keep the rule in one script include.
- Hire start dates live on the case or on the subject person's profile, depending on configuration. Check which.

## Security

HR data is protected by HR-specific roles and case access rules (COE security, HR criteria). Read through tables that respect them, and give data brokers ACLs for the HR agent and manager roles the instance uses. Never expose HR profile fields beyond what the page needs.

## Page ideas

- **HR agent: "Onboarding this month".** Journey archetype. Hires as cards with activity-set stages and owner progress.
- **HR manager: "Lifecycle health".** Dashboard archetype. Cases by stage, overdue tasks by owner, time to complete.
- **Hiring manager: "My new hires".** Journey archetype, filtered to the manager's reports, with their to-dos first.
