# Customer Service Management (CSM)

Confirm everything here with `sn_schema` and `sn_plugins`. The scope is usually `sn_customerservice`.

## Workspaces

The CSM Configurable Workspace. Find it in `sys_ux_page_registry` with `titleLIKECSM`.

## Core tables

| Table | What | Notes |
|-|-|-|
| `sn_customerservice_case` | Customer case | Extends `task`. Has account, contact, consumer, product, priority. |
| `customer_account` | Account (B2B) | Account hierarchy, tier, entitlements |
| `customer_contact` | Contact | Extends `sys_user` |
| `csm_consumer` | Consumer (B2C) | |
| `service_entitlement` | Entitlements | What the customer is owed |
| `sn_install_base_item` | Install base | What the customer owns. Present when install base is active. |

## Security

Customer data is partitioned by account and contact relationships. Data brokers must respect them. Never return other accounts' cases.

## Page ideas

- **Agent: "Customer 360".** Record overview of an account: open cases, entitlements, install base, recent interactions.
- **CSM manager: "Escalations".** Dashboard. Escalated cases by account tier, SLA risk, age.
- **Case lifecycle.** Journey archetype for complex cases with many tasks across teams.
