# Choosing how to build

Read this in build playbooks only (page, feature, flow, bug fix). Configuration before code (**principle-config-before-code**).

- **SDK first.** For what the ServiceNow SDK covers (tables, ACLs, roles, business rules, script includes, client scripts, UI policies, UI actions, ATF tests), use **fluent-sdk** so the source lives in git.
  - The SDK needs the user to authenticate it (`now-sdk auth`). If the plan needs it, ask in your first message, not mid-run.
  - SDK installs don't land in the `kiwi/` update set. QA's capture audit will list them; say in the report how they ship.
- **Without the SDK,** roles, script includes, ATF tests and other metadata go through `sn_upsert`. ACLs can't (**principle-least-privilege-acls**): choose a design that needs none, or tell the user which ACL they'll create.
- **UI Builder pages.**
  - Fits an attention board (summary cards, a list of what needs attention with reasons, a breakdown by group): compile it with `sn_ux_build_page`. Minutes, not hours; rebuilding the same route updates the page in place.
  - Otherwise: **ui-builder**'s template path, with `sn_ux_export_page` and `sn_ux_upsert_page`, always from an exported template, never a blank bundle.
- **Flows:** **flow-designer**.
- **Server or client code:** **server-scripting** or **client-scripting**, with **principle-query-hygiene**.
- **Any page or UI:** **next-experience-design** and **principle-design-like-a-product**. A page that looks like a list view with a header isn't done.
