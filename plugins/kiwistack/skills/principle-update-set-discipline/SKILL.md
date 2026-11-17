---
name: principle-update-set-discipline
description: ServiceNow principle. One kiwi/<task> update set per task, never Default, every metadata write checked as captured, nothing completed or moved without the user. Apply before the first write of any task and whenever a write reports captured_in_update_set false.
---

# Update set discipline

**Rule.** Each task gets its own `kiwi/<task-slug>` update set in the target scope. Every metadata write lands in it and is checked. Nothing goes in Default. Completing or moving a set is the user's call.

**Why.** An update set is how work moves between instances and how reviewers see what changed. A change that missed the set is lost on promotion. A change that landed in Default is mixed up with everyone else's.

**How.**
- `sn_update_set` action `create` before the first write. If a set with that name is already in progress, it is reused.
- After each write, read `captured_in_update_set`. If it's `false`, or there's a `warning`, stop and report. Usually the session's application or update set preference is wrong. Find out why before writing more.
- Data records (cases, users, groups) are never captured, by design. Writing them is `needs_approval`. Treat test data as fixtures that live in ATF, not as part of the release.
- SDK (Fluent) work moves as the application, not as an update set. Keep the two straight: Fluent files in git, UI Builder records in the update set, until the repo is synced (see **fluent-sdk**).
- Finish with `sn_update_set` action `contents`, and list it in the reply.

**Example.** A page build ends with `kiwi/hrsd-onboarding-page` holding the screen type, screen, macroponent, client scripts, route, data broker and its ACL. Nothing is in Default.
