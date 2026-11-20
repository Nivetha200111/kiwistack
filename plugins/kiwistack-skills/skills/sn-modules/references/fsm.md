# Field Service Management (FSM)

Confirm everything here against the instance's dictionary and plugin list.

## Core tables

| Table | What | Notes |
|-|-|-|
| `wm_order` | Work order | Extends `task` |
| `wm_task` | Work order task | Assigned to agents (technicians). Has dispatch state, window, location. |
| `cmn_location` | Locations | |
| `sm_part_requirement` / `alm_stockroom` | Parts and stockrooms | Present when inventory is active |

The Dispatcher Workspace is a separate experience. Find it in `sys_ux_page_registry`.

## Page ideas

- **Dispatcher: "Today's field work".** Dashboard plus work queue. Tasks by state and region, unassigned urgent tasks, technicians' load.
- **FSM manager: "First-time fix".** Dashboard. Repeat visits, parts delays, SLA performance.
- **Work order lifecycle.** Journey archetype for multi-task work orders.
