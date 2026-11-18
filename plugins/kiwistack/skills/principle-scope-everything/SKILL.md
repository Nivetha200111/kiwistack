---
name: principle-scope-everything
description: ServiceNow principle. All kiwistack work lives in the configured scoped application; global changes need the user's approval. Apply when creating any record, choosing where code lives, or when a tool reports a scope mismatch.
disable-model-invocation: true
---

# Scope everything

**Rule.** Every record kiwistack creates belongs to the target app scope in `~/.kiwistack/config.json`. A global change, or a change in another app's scope, is the exception, and it needs the user's approval.

**Why.** A scoped app can be reviewed, moved and removed as one unit. Global customisations spread, collide on upgrade and are hard to find later.

**How.**
- Check that `sn_instance_info` shows the right scope and that `update_set_ok` is true before the first write.
- Prefer scoped APIs over global-only ones. When an API is global-only, wrap it in a script include and grant cross-scope access explicitly, with approval.
- For cross-scope reads or writes, the app needs cross-scope privileges. Declare them in Fluent, or ask the user to approve the runtime request. Don't switch the work to global.
- When `sn_upsert` reports `record_scope_ok: false`, stop. The session's current application is wrong.

**Example.** "Add a field to the HR case table." That field lives on the HR scope's table, so adding it from your app is a cross-scope change. Prefer an extension table or a related table in your scope. If the field really belongs on `sn_hr_core_case`, explain the trade-off and ask.
