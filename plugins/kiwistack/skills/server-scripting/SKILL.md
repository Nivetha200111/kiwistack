---
name: server-scripting
description: Writing and reviewing ServiceNow server-side code - business rules, script includes, data broker scripts, scheduled jobs and scripted REST - with GlideRecord, GlideAggregate, GlideQuery, GlideSystem and the scoped APIs. Use whenever kiwistack writes or reviews server code.
disable-model-invocation: true
---

# Server scripting

## Choosing the container

| Need | Container |
|-|-|
| Set or validate fields before save | Before business rule. No `current.update()`. |
| React after save on the same record | After business rule. Async if it's slow or calls out. |
| Push data to a form | Display business rule into `g_scratchpad`. |
| Logic used in more than one place | Script include, as a class with small methods. |
| Data for a UI Builder page | Transform data broker that calls a script include. |
| Orchestration with waits, approvals, integrations | Flow Designer (**flow-designer**), not a business rule. |
| Endpoint for another system | Scripted REST API with auth and a role. |

## Style

- Scoped script includes use the `Class.create()` prototype pattern or a plain object. Keep each method short and pure where possible: take inputs, return values, no hidden reads of `current`.
- Prefer `GlideQuery` for new reads and writes when the release supports it. It's fluent, throws on bad field names, and makes `count()` and `selectOne()` explicit. Use `GlideRecord` where `GlideQuery` falls short.
- Follow **principle-query-hygiene**. Use `GlideAggregate` for counts and groupings.
- Validate inputs at the boundary: script include methods called from the client, data broker inputs, REST parameters. Trust internal callers.
- Log with `gs.info`, `gs.warn` and `gs.error`, and include a prefix with the app scope. No logging in hot loops.
- Never hardcode sys_ids. Look records up by a stable key, or use a system property.
- Dates: `GlideDateTime`, and keep in mind that values are stored in UTC and shown in the user's time zone.

## Example: data broker script for "progress per hire"

```js
// Transform data broker script. inputs come from the page's data resource.
function transform(input) {
  return new x_acme_kiwi.OnboardingProgress().forActiveCases({
    startFrom: input.startFrom,
    limit: Math.min(Number(input.limit) || 50, 200),
  });
}
```

The script include runs one query for the cases and one `GlideAggregate` for task counts grouped by parent and state, then returns plain objects with only the fields the page shows.

Table names, roles and fields in examples are illustrative. Confirm them on the instance with **sn-recon**.

## Review checklist

Each item is a reason to fail a review:
- `current.update()` in a before rule, or recursion through after rules.
- Queries in loops, counting by iteration, or unbounded queries on large tables.
- Hardcoded sys_ids, user names or group names.
- A script include callable from the client without a role check.
- Silent `try/catch` that swallows errors.
- `setWorkflow(false)` without a comment explaining why.
- Global-scope APIs used from a scoped app without a cross-scope privilege.
