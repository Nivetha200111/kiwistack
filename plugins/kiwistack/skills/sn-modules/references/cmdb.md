# CMDB

Confirm everything here with `sn_schema`. The CI class hierarchy is deep and varies by instance.

## Core tables

| Table | What | Notes |
|-|-|-|
| `cmdb_ci` | Base CI | Every CI class extends it |
| `cmdb_ci_service` / `cmdb_ci_service_auto` | Business and application services | Service-mapped services extend the latter |
| `cmdb_ci_computer` / `cmdb_ci_server` / `cmdb_ci_appl` | Common classes | |
| `cmdb_rel_ci` | Relationships | parent, child, type (`cmdb_rel_type`) |
| `svc_ci_assoc` | CIs belonging to a service | Present when Service Mapping or application services are used |

Data quality lives in the CMDB Health scorecards and in the CMDB Workspace.

## Rules

- Never write CIs directly when discovery or an integration owns them. Use the Identification and Reconciliation Engine (IRE) APIs, or the owning integration.
- Relationship queries on large CMDBs are expensive. Bound them by depth and class (**principle-query-hygiene**).

## Page ideas

- **Service owner: "My service".** Record overview. Service health, related CIs, open incidents and changes on its CIs.
- **Configuration manager: "CMDB health".** Dashboard. Completeness, correctness, staleness by class.
