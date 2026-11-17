---
name: principle-config-before-code
description: ServiceNow principle. Choose no-code, then low-code, then code. Apply when deciding how to implement any behaviour (UI policy vs client script, flow vs business rule, OOTB component vs custom, configuring an existing workspace vs a new page).
---

# Configuration before code

**Rule.** Use the least powerful mechanism that does the job. Configuration first, then low-code, then script.

**Why.** Platform configuration survives upgrades, admins can read it, and it's what ServiceNow supports. Every script is something the team owns forever.

**The ladder, from first choice to last.**
1. OOTB behaviour or a configuration option: properties, workspace configuration, assignment rules, SLA definitions, notifications.
2. Declarative records: UI policies, data policies, dictionary attributes, declarative actions, UI Builder pages with OOTB components and data resources.
3. Flow Designer with OOTB actions and spokes.
4. Script, in the narrowest place: a business rule, client script or data broker script, calling script includes for anything reused.
5. A custom UI component (the ServiceNow CLI). kiwistack doesn't build these. Recommend one only when no OOTB component can do the job, and say so.

**How.** For each piece of a design, write one sentence on why the step above it isn't enough. If you can't, use the step above.

**Example.** "Make the field mandatory when category is hardware." That's a UI policy, plus a data policy if it must also hold for imports and APIs. It is not a client script.
