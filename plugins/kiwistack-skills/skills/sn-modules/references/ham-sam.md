# Hardware and Software Asset Management (HAM / SAM)

Confirm everything here against the instance's dictionary and plugin list. HAM's scope is usually `sn_hamp`, and SAM's is `sn_samp`.

## Core tables

| Table | What | Notes |
|-|-|-|
| `alm_asset` | Base asset | Model, state, substate, assigned_to, stockroom, cost |
| `alm_hardware` | Hardware asset | Linked to its CI (`ci` field) |
| `alm_stockroom` | Stockrooms | |
| `cmdb_model` / `cmdb_hardware_product_model` | Models | |
| `cmdb_sam_sw_install` | Discovered installs | SAM |
| `alm_license` / `samp_sw_entitlement` | Entitlements | Depends on the SAM version |

## Page ideas

- **Asset manager: "Lifecycle pipeline".** Journey archetype. Assets by lifecycle stage (on order, in stock, in use, in repair, retired), aging in each stage.
- **Joiner-mover-leaver view.** A cross-module journey: HR lifecycle cases joined to the hardware assigned or to be reclaimed. Coordinate with `hrsd.md`.
- **Software asset manager: "License position".** Dashboard. Compliance position per publisher, over- and under-licensing.
