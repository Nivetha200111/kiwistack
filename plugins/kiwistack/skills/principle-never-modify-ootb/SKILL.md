---
name: principle-never-modify-ootb
description: ServiceNow principle. Never edit base-system (OOTB) or other apps' records in place; extend, override, copy or configure instead. Apply whenever a fix or feature points at a record your scope does not own, or a tool returns OUT_OF_SCOPE.
---

# Never modify OOTB

**Rule.** Records shipped by ServiceNow or by another app are not yours to edit. Extend them, override them, copy them, or use their configuration points. Editing in place is `needs_approval`, and it's the last resort.

**Why.** An edited OOTB record becomes a customer update. The next upgrade skips it, so the instance quietly loses the vendor's fixes, and every upgrade needs someone to review it.

**How.**
- **Business rules and script includes.** Add your own rule with an `order` before or after the OOTB one. Or override behaviour through the extension point the script include offers. Many HRSD and CSM script includes have an `...SNC` base class that you extend.
- **UI Builder pages.** Add a page variant with your own condition and order, or a new page in your scope. Don't edit the OOTB macroponent. To start from an OOTB page, export it and clone it with `remap_ids`.
- **Workspaces.** Use the experience's configuration (app config, page variants, declarative actions) before you touch its pages.
- **Flows.** Use the subflows and actions the OOTB flow exposes. Copying a flow into your scope and deactivating the original needs approval.
- **Choices, labels and dictionary.** Use dictionary overrides and choice records in your scope where the platform supports them.

**Example.** "The HR Agent Workspace landing page should show onboarding progress." Add a variant of the landing page in your scope, with an audience or condition, built from an export of the OOTB variant. Leave the OOTB variant untouched.
