# Findings need a proof

QA, security, the reviewer and the slop checker all report findings in this shape. The evidence gate (`scripts/check-run.mjs`) rejects a findings file where any finding has no `Proof:` line.

## Shape

```
### F1 (must) The attention count includes servers
- Where: `x_kiwi_demo_board` data broker `sys_ux_data_broker_transform/3f2a...`, or `spec.json` line 14, or `qa-desktop.png`
- Proof: `sn_query cmdb_ci_computer install_status=1^sys_class_name=cmdb_ci_server` returned 41 rows; the page's base query does not exclude them (spec.json line 14).
- Expected: domain.md defines "laptop" as `cmdb_ci_computer` minus servers, so the card should show 54, not 95.
- Fix: add `sys_class_name!=cmdb_ci_server` to the base query.
```

- **Severity** is `must` (blocks ship) or `should`.
- **Where** names one record (`table/sys_id`), one file and line, or one screenshot.
- **Proof** is what you ran or saw in this session and what it returned.
- **Expected** quotes the requirement from `goal.md`, `domain.md` or the design rubric.
- **Fix** is one concrete change.

## What counts as proof

- A tool call you ran, with its input and the part of the output that shows the problem: `sn_query`, `sn_get`, `sn_update_set` `contents` or `capture_audit`, `sn_app_audit`.
- A screenshot you saved in the run folder, with what it shows.
- A line you quote from a file, with the file and line.

## What doesn't count

- "Likely", "may", "could", "should probably".
- The builder's summary, or another agent's report.
- What the platform usually does. Check this instance.
- A risk that needs a future change to matter.

A suspicion you couldn't prove goes under `## Not proven`, one line each, with what you would run to prove it. It doesn't count toward the verdict, and the coordinator doesn't send it to the builder.

No findings is a valid result. Say what you checked.
