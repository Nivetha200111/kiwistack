---
name: sn-modules
description: Starting maps of ServiceNow modules (HRSD, ITSM, CSM, SPM, IRM/GRC, FSM, CMDB, HAM/SAM) - plugins, core tables and their parents, lifecycles and states, workspaces, and typical page ideas per persona. Use at the start of any module-specific task, before sn-recon confirms the details on the instance.
---

# ServiceNow modules

Each reference is a starting map, not the truth. Releases, plugins and customisations change tables, fields and states. **Confirm every table and field with `sn_schema` and every plugin with `sn_plugins` before you use it** (**sn-recon**).

| Module | Reference | Typical personas |
|-|-|-|
| HR Service Delivery | `references/hrsd.md` | HR agent, HR manager, hiring manager, employee / new hire |
| IT Service Management | `references/itsm.md` | Service desk agent, major incident manager, change manager, problem manager |
| Customer Service Management | `references/csm.md` | Customer service agent, CSM manager, account manager |
| Strategic Portfolio Management | `references/spm.md` | Project manager, portfolio manager, demand manager, scrum team |
| Integrated Risk Management (GRC) | `references/irm.md` | Risk manager, compliance analyst, control owner, auditor |
| Field Service Management | `references/fsm.md` | Dispatcher, field technician, FSM manager |
| CMDB | `references/cmdb.md` | Configuration manager, service owner |
| Hardware and Software Asset Management | `references/ham-sam.md` | Asset manager, software asset manager |

Modules missing here (SecOps, ITOM, WSD, LSD, and others): run **sn-recon** with `sn_plugins` and `sn_schema`, then add a reference following `../kiwi-mode/playbooks/authoring-a-skill.md`.
