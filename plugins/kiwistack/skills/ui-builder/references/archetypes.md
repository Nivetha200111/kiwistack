# Page archetypes

Every kiwistack page starts as one of these shapes. Each recipe lists regions in reading order. Component names are generic. Map each one to a real component from `sn_component_catalog` on the instance (names such as "Stepper", "Highlighted value", "Card", "List", "Data visualization", "Tabs", "Avatar", "Badge", "Alert", "Empty state" are common), and copy its definition from an existing page that uses it.

## Journey / process

The persona's question: where is each item in a multi-stage process, and what is stuck?

1. **Header.** The page title in the persona's words, a scope filter (my items, team, all) and a date range.
2. **Summary row.** Three or four highlighted values, such as in progress, at risk, blocked, completed this period. Each one filters the page when clicked.
3. **Main.** One card per item. A name and avatar. A stage stepper with the current stage marked. Progress per owner or track. One status badge with a label, never colour alone.
4. **Detail panel**, opened from a card. That item's open tasks grouped by owner, each with its due date and a link to the record.
5. **States.** Empty ("No onboardings starting in this period", with a hint to change the filter), loading skeletons, error.

Examples: HRSD onboarding and offboarding, a CSM case lifecycle, a change through CAB, a demand through to a project in SPM, an audit engagement in IRM.

## Landing / home

The persona's question: what needs my attention today?

1. A greeting and a short summary of what needs attention.
2. Attention cards: the few most urgent items, with their primary action.
3. Work lists, as tabs or sections: mine, my team's, recently updated.
4. Shortcuts to the persona's common actions.

## Dashboard / overview

The persona's question: how is this area doing, and where should I look?

1. A filter bar (period, group, service).
2. Key numbers with a trend against the previous period.
3. Two to four visualisations, each answering a named question in its title. "Where are incidents piling up?" beats "Incidents by group".
4. A drill-down list for whatever the user selects.

Example: an ITSM major incident overview.

## Record overview

The persona's question: everything about this one thing, at a glance.

1. A header with the identity, status, owner and key dates.
2. A stage or progress indicator, if the record has a lifecycle.
3. Related work, grouped by owner, as compact lists.
4. An activity timeline.
5. Actions, through declarative actions.

## Work queue

The persona's question: what do I pick up next?

1. Saved filters as tabs, with counts.
2. A list with the few columns that decide priority, sorted by urgency.
3. A preview panel for the selected item, with its primary actions.

## Choosing

- The question is about a process over time: journey.
- The question is about health or totals: dashboard.
- One record: record overview.
- "What do I do next": work queue or landing.

If two fit, build both as variants and decide from screenshots.
