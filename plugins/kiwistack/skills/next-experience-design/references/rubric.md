# Page rubric

Score from screenshots of the real page: desktop with data, narrow width, and the empty state. Score the composition JSON only when checking how something was built. A page ships when every **must** passes. Each **should** that fails gets a fix or a stated reason.

## Must

| # | Check | Pass when |
|-|-|-|
| M1 | One main question | You can name the persona and the question from the page alone, and the answer is visible without scrolling at desktop width. |
| M2 | Not an admin screen | The main content is not a raw list or form embed with a title. Process is shown as a process, totals as highlighted values, items as cards or a purpose-built list. |
| M3 | Real data, correct | The counts and values on screen match `sn_query` for the same filter. |
| M4 | Theme only | No hardcoded colours, fonts or pixel sizes. Everything comes from components and theme variables. |
| M5 | Status is not colour alone | Every status colour has a label or icon. |
| M6 | States designed | Loading, empty and error are all designed, and no-access is distinct from empty. |
| M7 | Persona's words | No table names, field names or sys_ids in the visible text. |
| M8 | Narrow width works | Nothing overlaps or scrolls sideways at about 768px. |
| M9 | Secure by default | Data comes through ACL-protected resources. A user without the role sees no-access, not data. |

## Should

| # | Check | Pass when |
|-|-|-|
| S1 | Summary first | Key numbers come before the detail, and they filter the page. |
| S2 | Hierarchy | One title, consistent section headings, aligned to the grid. |
| S3 | Detail in context | Selecting an item opens a panel or modal and keeps the page context. |
| S4 | Actions are verbs | The primary action is visible and says what it does. |
| S5 | Density fits the persona | Compact for queues, roomy for overviews. |
| S6 | Performance | First data arrives in under about 2 seconds on dev with realistic volumes. No data resource returns unused fields. |
| S7 | Keyboard | All actions are reachable by keyboard, in a sensible focus order. |

## Reviewer output

A table with each item marked pass or fail and one line of evidence ("M3 fail: header says 14 at risk, sn_query returns 11"), then the verdict.
