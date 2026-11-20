---
name: principle-laziness-protocol
description: Engineering principle adapted from pstack. Bias to the smallest change that solves the problem, and to deleting rather than adding. Apply when sizing a change, when tempted to add a script include, layer, property or abstraction, or when refactoring.
disable-model-invocation: true
---

# Laziness protocol

**Rule.** The best change is the smallest one that fully solves the problem. Fewer records, fewer scripts, fewer layers.

**Why.** On ServiceNow every record is something to review, move, upgrade and own.

**How.**
- Before adding a record, look for an existing one to reuse or configure. **principle-config-before-code** gives the order to try things in.
- Don't add a system property, a utility script include or an "engine" for a single caller.
- When a fix needs a guard against some state, first ask whether that state should be possible at all.
- Delete what the change makes dead: rules, variants, properties. Deleting needs the user's go-ahead, so propose it.
