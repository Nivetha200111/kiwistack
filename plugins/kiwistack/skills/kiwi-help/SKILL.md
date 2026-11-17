---
name: kiwi-help
description: Explains what kiwistack can do and which skill or playbook fits a ServiceNow request. Use for /kiwi-help, "what can kiwistack do", or "which skill should I use for X".
---

# kiwi help

Most requests start with `/kiwi-mode` followed by what you want in plain words. kiwi-mode picks the playbook.

| You want to | Start with |
|-|-|
| Build a UI Builder page or workspace view | `/kiwi-mode use UI Builder to build a page that shows ...` |
| Add tables, business rules, script includes, client scripts, ACLs | `/kiwi-mode add ...` (Feature playbook) |
| Build a Flow Designer flow or subflow | `/kiwi-mode build a flow that ...` |
| Fix something broken | `/kiwi-mode X is wrong when Y. Repro and fix.` |
| Understand how something works on your instance | `/kiwi-mode how does ... work?` or `/sn-recon` |
| Review an update set, a diff or a page | `/kiwi-mode review update set kiwi/...` or `/sn-interrogate` |
| Audit any app for security and hygiene, including apps Studio's Build Agent made | `/kiwi-mode audit the app x_...` (Audit playbook, `sn_app_audit`) |
| Get an attention board page in about a minute | `/kiwi-mode build a page showing the <records> that need attention` (`sn_ux_build_page`) |
| Get work ready to move to test | `/kiwi-mode release prep for kiwi/...` |
| Compare design options before building | `/sn-architect` |
| Check a page or feature really works | `/sn-verify` |
| Capture a lesson so the next run is better | `/reflect` |
| Connect to an instance | `/setup-kiwistack` |

Example requests:

```
/kiwi-mode use UI Builder to build a page in HR Agent Workspace that shows each new hire's onboarding progress across HR, IT and facilities tasks
/kiwi-mode build an ITSM major incident overview page for the service desk lead
/kiwi-mode add a business rule that sets the CSM case priority from the account tier, with an ATF test
/kiwi-mode build a subflow that provisions a laptop request when an onboarding case reaches "Ready"
/kiwi-mode why does the change approval skip the CAB for standard changes?
```

What kiwistack will not do without asking you first: edit OOTB or other apps' records, write data records, delete anything, mark an update set complete, or install the SDK app the first time in a task. It never touches production.
