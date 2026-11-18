---
name: sn-architect
description: Parallel design exploration for ServiceNow work before building. Produces two or three competing designs (data model, where logic lives, or page layout with data bindings), scores them against the principles and the design rubric, and picks one. Use for any nontrivial feature, page or flow, or when the user says "design this first".
disable-model-invocation: true
---

# sn architect

The cheapest time to change a design is before any record exists.

## Inputs

The goal, the persona, the recon note from **sn-recon**, and for pages the page brief.

## Process

1. **Name the decision.** Examples: "how the onboarding page gets per-hire progress", "where priority logic lives", "flow or business rule".
2. **Spawn two or three designers in parallel** (`kiwi-agent`, background), each with a different stance:
   - **Configuration-first.** OOTB features, configuration and existing components wherever possible.
   - **Product-quality-first.** The best experience for the persona, then the least code that gets there.
   - **Simplest-thing.** Fewest records, fewest moving parts.
   Each returns a design as follows:
   - **Feature or flow.** The data shape (tables, fields, states), each piece of logic and its mechanism (UI policy, client script, business rule, script include, flow, data broker), the ACLs, and the ATF tests that prove it.
   - **Page.** An ASCII wireframe at desktop width. Each region's component (from `sn_component_catalog` only), its data resource and fields, the client states and events, and the empty, loading and error states.
3. **Score them.** Use the principle skills, and for pages `../next-experience-design/references/rubric.md`. Count the records each design creates, and flag every OOTB record each one touches.
4. **Pick one, or graft.** Choose the best base and take any clearly better piece from the others. If two pages score within one rubric item of each other, build both as variants and decide from screenshots (**sn-verify**).
5. **Write the decision down** in the task notes: the chosen design, why, and what was rejected.

Ask the user only for a genuine product preference that the evidence can't settle, such as which persona matters more. Settle anything observable by building or querying it.
