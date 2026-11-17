---
name: principle-guard-the-context-window
description: Engineering principle adapted from pstack. Keep the coordinator's context for decisions; route bulk reads (page exports, schema dumps, large queries, long logs) to subagents that return summaries. Apply before any read that may return more than a few hundred lines.
---

# Guard the context window

**Rule.** Large outputs go to a subagent. The coordinator keeps summaries, decisions and pointers.

**ServiceNow outputs that are usually large.**
- `sn_ux_export_page` bundles, often hundreds of records with long JSON fields.
- `sn_schema` on task-based tables, often hundreds of fields.
- `sn_query` without tight `fields` and `limit`.
- Update set contents for long-running sets.

**How.**
- Ask only for the fields you need, with limits.
- For an export, have a subagent return the layout tree, the data resources and their bindings, the components used, and the client states and events. Have it save the full bundle to a file in the scratchpad and pass the file path, not the content.
- When delegating, pass file paths and record ids. Don't paste content into the brief.
