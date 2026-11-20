# Strategic Portfolio Management (SPM)

Confirm everything here against the instance's dictionary and plugin list. It covers project, demand, portfolio and agile.

## Core tables

| Table | What | Notes |
|-|-|-|
| `pm_project` | Project | Extends `planned_task`. Has phase, state, health fields, dates. |
| `pm_project_task` | Project task | |
| `dmn_demand` | Demand | Its stage moves from idea to project |
| `pm_portfolio` / `pm_program` | Portfolio, program | |
| `rm_epic` / `rm_story` / `rm_sprint` | Agile work | Agile Development 2.0 |
| `resource_plan` | Resource plans | |

## Page ideas

- **Portfolio manager: "Portfolio health".** Dashboard. Projects by health (schedule, cost, scope), upcoming milestones, budget against actual.
- **Demand manager: "Demand pipeline".** Journey archetype. Demands by stage, from screening through approval to project.
- **Project manager: "My project".** Record overview. Phase stepper, milestones, risks and issues, team.
