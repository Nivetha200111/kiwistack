# IT Service Management (ITSM)

Confirm everything here with `sn_schema` and `sn_plugins`.

## Workspaces

- Service Operations Workspace (search `sn_plugins` for `sow`: it matches the workspace's path under `experiences`) is the current agent workspace for ITSM.
- Older instances may use Agent Workspace. Find both in `sys_ux_page_registry`.

## Core tables

| Table | What | Notes |
|-|-|-|
| `task` | Base of most work records | state, assignment_group, assigned_to, priority, sla fields |
| `incident` | Incident | `major_incident_state` exists when major incident management is active |
| `problem` | Problem | Linked from incidents by `problem_id` |
| `change_request` | Change | type (normal, standard, emergency), approval, CAB fields |
| `change_task` | Change task | |
| `sc_request` / `sc_req_item` / `sc_task` | Request, requested item, catalog task | The fulfilment chain |
| `kb_knowledge` | Knowledge article | |
| `task_sla` / `contract_sla` | SLA instances and definitions | Use for at-risk and breach views |
| `cmdb_ci` / `cmdb_ci_service` | Affected CIs and services | See `cmdb.md` |

## Lifecycles

- Incident states run New, In Progress, On Hold, Resolved, Closed, Canceled. Read the `state` choices on the instance, because the numbers vary.
- Change goes through New, Assess, Authorize, Scheduled, Implement, Review, Closed, depending on the change model.
- A major incident has a candidate, proposed, accepted lifecycle in `major_incident_state`.

## Page ideas

- **Major incident manager: "Major incident overview".** Dashboard plus record overview. Active major incidents with impact, affected services, child incidents, a communications timeline, and SLA risk.
- **Service desk lead: "Queue health".** Dashboard. Open by group, aging, SLA at risk, reassignment counts.
- **Change manager: "This week's changes".** Journey or calendar. Changes by stage, conflicts, approvals pending.
