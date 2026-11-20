# Findings need a proof

Every reviewer reports findings in this shape. A finding with no `Proof:` line doesn't count.

## Shape

```
### F1 (must) The attention count includes servers
- Where: `x_kiwi_demo_board` data broker `sys_ux_data_broker_transform/3f2a...`, or `spec.json` line 14, or `qa-desktop.png`
- Proof: a query on `cmdb_ci_computer` for `install_status=1^sys_class_name=cmdb_ci_server` returned 41 rows; the page's base query does not exclude them (spec.json line 14).
- Expected: the agreed definition of "laptop" is `cmdb_ci_computer` minus servers, so the card should show 54, not 95.
- Fix: add `sys_class_name!=cmdb_ci_server` to the base query.
```

- **Severity** is `must` (blocks ship) or `should`.
- **Where** names one record (`table/sys_id`), one file and line, or one screenshot.
- **Proof** is what you ran or saw in this session and what it returned.
- **Expected** quotes the requirement from the goal, the agreed definitions or the design rubric.
- **Fix** is one concrete change.

## What counts as proof

- A query you ran, with its input and the part of the output that shows the problem: a Table API request, a background script on a dev instance, the update set's `sys_update_xml` list, or a ServiceNow MCP tool the user has connected.
- A screenshot you took, with what it shows.
- A line you quote from a file, with the file and line.

## What doesn't count

- "Likely", "may", "could", "should probably".
- The builder's summary, or another agent's report.
- What the platform usually does. Check this instance.
- A risk that needs a future change to matter.

A suspicion you couldn't prove goes under `## Not proven`, one line each, with what you would run to prove it. It doesn't count toward the verdict, and nobody acts on it until it's proven.

No findings is a valid result. Say what you checked.
