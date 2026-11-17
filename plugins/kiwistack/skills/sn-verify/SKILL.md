---
name: sn-verify
description: Proves ServiceNow work on the real instance. Runs the ATF suite, opens pages in the built-in browser and screenshots them at desktop and narrow widths, exercises the behaviour once, and checks the update set captured everything. Use before declaring any kiwistack task done, or for /sn-verify.
---

# sn verify

"It saved without errors" is not evidence. Evidence is something you observed on the instance in this session.

## 1. ATF

- Run the suite for the work: `sn_atf_run_suite` with `suite_sys_id` or `suite_name`.
- Report `successful`, or each failing test with its step and message from `results`.
- A suite that can't start (the CI/CD plugin or role is missing) is a setup gap. Say so. Don't silently skip it.

## 2. The page or UI

Use the built-in browser.
- Open `https://<host>/now/<experience path>/<route>` (or the record URL). If a sign-in page appears, ask the user to sign in in the pane. You never type credentials.
- Wait for the data to load: no skeletons or spinners left.
- Take screenshots:
  - Desktop width with real data.
  - Narrow width (resize to about 768px).
  - The empty state: a parameter or filter that returns nothing.
  - The error or no-access state, when the page has one.
- Read the page text to confirm labels, counts and states match what `sn_query` returns for the same filter. A count that doesn't match the data is a bug.
- Check the browser console for errors from the page's components or data resources.
- Click the primary action once, if there is one, and confirm what it does.

## 3. The update set

`sn_update_set` action `contents`: every record the task created is listed, and nothing went to Default.

## 4. Hand to the reviewer

For pages, give the screenshots and the rubric (`../next-experience-design/references/rubric.md`) to `kiwi-reviewer` (through **sn-interrogate**).

## Output

A verification note: each check, its result, and the artifact (screenshot path, ATF result id, update set entry count). Mark anything you couldn't run as not verified, with the reason.
