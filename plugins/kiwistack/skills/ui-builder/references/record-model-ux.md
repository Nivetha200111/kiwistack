# UI Builder record model

How a Next Experience page is stored. This reference starts as a map from documentation and inspection. Phase 1 (`tools/spike-ux-roundtrip.mjs`) checks it against a real instance and records the results in "Verified on" at the end.

**Field names vary between releases.** Always confirm with `sn_schema` before relying on one.

## Tables

| Table | What it is | Points at |
|-|-|-|
| `sys_ux_page_registry` | The experience (a workspace or UX app). Its path forms `/now/<path>`. | root macroponent, app config |
| `sys_ux_app_config` | App configuration that routes and screens hang off. | |
| `sys_ux_app_route` | A route (URL segment and parameters) in the experience. | app config, screen type |
| `sys_ux_screen_type` | A page: the collection of variants for one route. | |
| `sys_ux_screen` | A page variant, chosen by condition, audience and order. | screen type, macroponent, app config |
| `sys_ux_macroponent` | The page definition: `composition` (layout tree, JSON), data resources, props, client state, event mappings. | components, data brokers |
| `sys_ux_client_script` | Client scripts the page's events call. | macroponent |
| `sys_ux_data_broker_*` | Data resources: transform (server script), GraphQL, and others. | script includes |
| `sys_ux_lib_component` | The component library (platform-owned). | |
| `sys_ux_theme` and related | Themes, which hold the design tokens. | |

## How the kiwi bundle walks it

- `sn_ux_export_page` starts at the record you give it. It follows every 32-character id it finds, in reference fields and inside JSON fields, and resolves each through `sys_metadata`.
- It keeps the `sys_ux_*` records in the same scope as the starting record.
- It adds the children it can't reach by reference: the screens and routes of a screen type, and the client scripts of a macroponent.
- It stops at the experience and app config, which are shared by every page, and lists those and anything from another scope (platform components, OOTB data brokers) as `external_refs`.
- `sn_ux_upsert_page` checks that every `external_ref` exists on the target instance. It writes the records in dependency order, strips instance-managed `sys_*` fields, and keeps `sys_id`, or remaps every id when `remap_ids` is true.

## Known risks to check in the spike

- Some UI Builder tables may compute or regenerate fields on save, such as compiled composition caches. If a written page renders blank, compare the fields of a UI-Builder-saved page with your written one.
- Whether Table API writes to `sys_ux_*` are captured in the current update set when the session's application is the target scope. The MCP server checks this on every write.
- Whether some records require UI Builder's own save path (a processor or API) rather than the Table API. If so, record the fallback here: build the shell in UI Builder with the browser, and use the API for data brokers and scripts.
- Whether a transform data broker needs a `sys_security_acl` of type `ux_data_broker` to execute for non-admin users.

## Verified on

**2026-11-17, Brazil patch 2 PDI.** This was a kiwistack run (`/kiwi-mode`, P1 attention board), not the spike script.

**What worked**
- A new page written through the Table API rendered as a tab inside Service Operations Workspace. It was 30 records in total: route, screen type, screen, macroponent, a client script include and 7 client scripts.
- The records were captured in the `kiwi/` update set.
- Data through the OOTB GraphQL broker *GlideRecord Collection Query* rendered, under the existing table ACLs.

**What didn't**
- A custom transform data broker needs an execute ACL. Creating ACLs needs `security_admin`, which an OAuth token can't elevate to. Without the ACL, the page shows no-access to everyone, admin included. Prefer OOTB GraphQL or record brokers, or ship the broker and its ACL through the SDK.
- Exporting a sub-page screen pulls in the parent page's client scripts. Strip those from the template.
- Data resources that aren't referenced by sys_id can be missing from the export.

The spike script (`tools/spike-ux-roundtrip.mjs`) has still not been run.
