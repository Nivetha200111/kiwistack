# Integrated Risk Management (IRM / GRC)

Confirm everything here with `sn_schema` and `sn_plugins`. Scopes are `sn_grc`, `sn_compliance`, `sn_risk` and `sn_audit`. Table names vary more than in most modules, so recon is essential.

## Core tables (typical)

| Table | What |
|-|-|
| `sn_grc_profile` | Entity: the thing that's governed (a business unit, an application, a vendor) |
| `sn_compliance_policy` / `sn_compliance_policy_statement` | Policies and their statements |
| `sn_compliance_control` | Control instances per entity |
| `sn_risk_risk` | Risk instances per entity |
| `sn_grc_issue` | Issues raised from control failures, audits or risks |
| `sn_audit_engagement` | Audit engagements |

## Page ideas

- **Compliance analyst: "Control health".** Dashboard. Controls by status per entity, failing controls, overdue attestations.
- **Auditor: "Engagement progress".** Journey archetype. Engagement phases (planning, fieldwork, reporting, follow-up) with open tasks.
- **Risk manager: "Top risks".** Dashboard with a heat map, or a list by inherent and residual score.
