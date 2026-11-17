---
name: next-experience-design
description: The visual and UX quality bar for every page kiwistack builds in Next Experience (UI Builder, workspaces) - layout, hierarchy, Horizon theme usage, states, copy and accessibility - plus the rubric reviewers score screenshots against. Use when designing, building or reviewing any page, in any module, so it reads as a finished product rather than an admin screen.
---

# Next Experience design

The bar is a page a product team would ship, built only from the platform's components and theme. It should not look like a list view with a header.

Apply **principle-design-like-a-product**. Score designs and screenshots with `references/rubric.md`.

## Layout

- **One main question per page**, answered above the fold at desktop width. Summary first, then detail, then actions.
- **A clear hierarchy.** One page title, a few section headings, and nothing louder than the main answer.
- **A grid.** Align everything to the layout's columns. Use the container components' own spacing. Don't add spacer elements or margins by hand.
- **Density** that matches the persona. Agents working queues want compact lists. Managers and employees want room to breathe.
- **Responsive.** At about 768px wide, side panels collapse under the main content and summary cards wrap. Nothing scrolls sideways.

## Theme

- Use the theme's colours, type and spacing through the components and theme variables of the experience's theme (`sys_ux_theme`). **Never hardcode hex colours, pixel font sizes or font families.**
- Status uses the theme's semantic colours (positive, warning, critical, info), always with a text label or icon as well. Colour alone fails accessibility.
- Use icons from the platform's icon set, and only when they add meaning.

## Content

- Labels use the persona's words ("Starting this week", "Waiting on IT"), not table or field names (`sn_hr_le_case`, `u_stage`).
- Numbers have units and context ("12 of 20 tasks done", "3 days overdue").
- Dates are relative when recent ("in 2 days"), absolute when far away.
- Each action is a verb that says what happens ("Remind manager", not "Submit").

## States

Every data region has:
- **Loading**: skeletons in the shape of the content. No blank boxes.
- **Empty**: what it means, and what to do about it.
- **Error**: what failed, without a stack trace, and a retry.
- **No access**: shown when the data broker's ACL denies the user, so it doesn't look like empty data.

## Interaction

- Summary cards filter the page.
- Selecting an item opens detail in a side panel or modal. Don't navigate away and lose the context.
- Primary actions are visible. Secondary ones go in an overflow menu.
- Everything works with the keyboard, and focus order follows reading order.

## Process

1. Pick the archetype (`../ui-builder/references/archetypes.md`).
2. Wireframe with real field names and realistic numbers from **sn-recon**. Use real data volumes, not "Lorem ipsum".
3. Score the wireframe against the rubric before building (**sn-architect**).
4. After building, score the screenshots against the rubric (**sn-verify**, `kiwi-reviewer`). Iterate until every "must" passes.
