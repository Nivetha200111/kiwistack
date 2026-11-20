---
name: principle-prove-it-on-the-instance
description: ServiceNow principle. Done means observed on the real instance in this session (ATF green, the page rendering real data in a screenshot, the update set holding every record), not "it saved" or "it should work". Apply before declaring any task done and before any status report.
disable-model-invocation: true
---

# Prove it on the instance

**Rule.** A claim of done carries evidence you produced in this session, on the instance.

**Why.** A ServiceNow record can save cleanly and still do nothing. A rule can have the wrong condition. A data broker can lack its ACL. A page can render empty for every real user. Only observation catches these.

**Evidence that counts.**
- An ATF suite run that's `successful`, with the result id.
- A screenshot of the page with real data, plus the empty state, with the counts matched against a query you ran yourself.
- Every write found in the update set (`sys_update_xml`), and the contents listed.
- For flows, a test execution where every step completed.

**What doesn't count.** "No errors on save." `now-sdk build` passing on its own. Your own reading of the composition JSON. A subagent's "done" without its artifacts.

**When you can't verify** (no ATF role, the user hasn't signed in to the browser), say exactly what is unverified and what is needed to verify it.
