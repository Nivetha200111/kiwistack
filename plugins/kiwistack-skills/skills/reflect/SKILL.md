---
name: reflect
description: Captures what a ServiceNow task learned so the next one doesn't repeat the mistake, by turning it into a check (a test, an ATF test, a CI step) or, failing that, a short note in the project's CLAUDE.md. Use after a correction from the user, a surprise on the instance, a failed approach, or for /reflect.
disable-model-invocation: true
---

# reflect

## Process

1. **Name the lesson in one sentence**, with the evidence: what you expected, what the instance actually did, and the record or result that showed it.
2. **Choose the strongest place to encode it.**
   1. **A check in the project.** A test, an ATF test, a lint rule or a CI step that fails if the mistake comes back.
   2. **The project's `CLAUDE.md`.** A fact about this instance or codebase: a custom table, local naming, a field that is always empty.
   3. **Upstream.** A fact that holds on every instance, such as a module's tables or states: open an issue on the kiwistack GitHub repository so the module reference gets it.
   Encode it once, in the strongest place available. Don't repeat it in several places.
3. **Make the edit**, short and in one place.
4. **Report** the lesson, where it now lives, and how the next task will behave differently.
