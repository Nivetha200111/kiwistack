---
name: principle-design-like-a-product
description: ServiceNow principle for any UI kiwistack builds. A page answers one persona's main question at a glance and looks like a finished product, not an admin list with a header. Apply to every UI Builder page, workspace view or portal surface, in any module.
---

# Design like a product

**Rule.** Every page has one persona and one main question. The answer is visible without scrolling or clicking. The page uses the platform's own components and theme, and looks finished.

**Why.** The user asked for kiwistack because the default admin screens don't serve the people doing the work. A list with a title is what they already have.

**How.**
- Start from the persona's job. "As an HR agent, which new hires are at risk of not being ready on day one?" beats "show onboarding cases".
- Show process as a process: stages as a stepper or timeline, progress as progress, risk as a status colour plus a label.
- Summarise first (a few key numbers), then the detail, then the actions.
- Use the platform's components and theme. Never hardcode colours or fonts.
- Design the empty, loading, error and no-access states. A real person will see them.
- Write labels in the persona's words, not table names.
- Judge the result against `../next-experience-design/references/rubric.md` from screenshots.

**Example.** For "HRSD onboarding process":
- A header with a few key numbers: starting this week, at risk, blocked tasks.
- Each hire as a card with a stage stepper (Pre-boarding, Day 1, First week, First 90 days) and task progress by owner (HR, IT, Facilities, Manager).
- A side panel with the selected hire's open tasks, each linking to the task.

Not a list of `sn_hr_le_case` records.
