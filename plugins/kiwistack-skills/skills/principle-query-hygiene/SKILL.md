---
name: principle-query-hygiene
description: ServiceNow principle for data access in scripts and data resources. No GlideRecord in the browser, GlideAggregate for counts, bounded and indexed queries, no queries in loops. Apply when writing or reviewing any server script, client script, data broker or flow script.
disable-model-invocation: true
---

# Query hygiene

**Rule.** Every query is bounded, filtered on indexed fields, executed on the server, and run once rather than per row.

**Why.** Unbounded and repeated queries are the most common cause of slow forms, slow workspaces and timed-out transactions. In a workspace page, one slow data resource blocks the whole page.

**How.**
- **Counts.** `GlideAggregate` with `addAggregate('COUNT')`, or `GlideQuery`'s `count()`. Never loop and increment.
- **Existence.** `setLimit(1)` and `hasNext()`, or `GlideQuery`'s `selectOne().isPresent()`.
- **Bounds.** `setLimit` on every query a user can widen. Paginate lists in data resources.
- **Filters.** Filter on indexed fields (sys_id, number, state, assigned_to, reference fields). Avoid leading `LIKE` and dot-walked filters on large tables.
- **No query in a loop.** Collect the ids, then run one `IN` query.
- **Fields.** In data resources, return only the fields the page displays.
- **Client side.** No `GlideRecord` and no synchronous `getXMLWait` in client scripts. Use `g_scratchpad` from a display business rule, or async `GlideAjax` with a callback. Use `getReference` only with a callback.
- **Business rules.** Don't call `current.update()` in a before rule, or in an after rule on the same record.

**Example.** Showing "12 of 20 onboarding tasks complete" per hire is one `GlideAggregate` over the tasks, grouped by parent case and state. It is not one query per hire.
