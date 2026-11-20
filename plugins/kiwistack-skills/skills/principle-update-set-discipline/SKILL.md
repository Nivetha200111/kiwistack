---
name: principle-update-set-discipline
description: ServiceNow principle. One kiwi/<task> update set per task, never Default, every metadata write checked as captured, nothing completed or moved without the user. Apply before the first write of any task and whenever a write doesn't land in the set.
disable-model-invocation: true
---

# Update set discipline

**Rule.** Each task gets its own `kiwi/<task-slug>` update set in the target scope. Every metadata write lands in it and is checked. Nothing goes in Default. Completing or moving a set is the user's call.

**Why.** An update set is how work moves between instances and how reviewers see what changed. A change that missed the set is lost on promotion. A change that landed in Default is mixed up with everyone else's.

**How.**
- Create the set before the first write. If a set with that name is already in progress, reuse it.
- After each write, check that the record's `sys_update_xml` entry is in the set. If it isn't, stop and report. Usually the session's application or update set preference is wrong. Find out why before writing more.
- Data records (cases, users, groups) are never captured, by design. Write them only with the user's go-ahead. Treat test data as fixtures that live in ATF, not as part of the release.
- SDK (Fluent) work moves as the application, not as an update set. Keep the two straight: Fluent files in git, UI Builder records in the update set, until the repo is synced (see **fluent-sdk**).
- Finish by listing the set's contents (its `sys_update_xml` records) in the reply.

**Example.** A page build ends with `kiwi/hrsd-onboarding-page` holding the screen type, screen, macroponent, client scripts, route, data broker and its ACL. Nothing is in Default.
