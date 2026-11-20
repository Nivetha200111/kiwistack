---
name: sn-interrogate
description: Adversarial independent review of ServiceNow work before it is called done. Runs kiwi-reviewer agents with different lenses (correctness, platform and security, design) over an update set, a Fluent diff, a design or page screenshots, then triages the findings. Use as the review gate before ServiceNow work is called done, or for /sn-interrogate.
disable-model-invocation: true
---

# sn interrogate

Nobody grades their own work. The review gate is closed until at least one independent `kiwi-reviewer` has returned a verdict on the current version.

## Process

1. **Package the target.** Give the update set name, the diff (`git diff` for Fluent), the page brief and screenshot paths, the goal and the persona. Give pointers, not pasted content.
2. **Spawn reviewers in parallel** (`kiwi-reviewer`, background), one lens each:
   - **Correctness.** Does it do what the goal says, for that persona, including the edge cases (no records, many records, a user without the role)?
   - **Platform and security.** Scope, OOTB edits, query hygiene, ACLs, the client/server split, update set completeness.
   - **Design.** Pages only. The rubric, judged from the screenshots.
   For a small change, one reviewer covering all the lenses is enough.
   Tell every reviewer: report each finding in the shape in `references/findings.md`, with a proof it ran on this instance. Anything it couldn't prove goes under `## Not proven`.
3. **Triage every proven finding.** Drop unproven ones unless you run the proof yourself and it holds.
   - **Fix.** Make the change and check it again on the instance.
   - **Dismiss.** Give a concrete reason ("the table has 40 rows; unbounded is fine here" is concrete).
   - **Ask.** Only for a product call.
   Findings the reviewers agree on carry the most weight.
4. **Re-review after fixes.** Send a fresh reviewer the fixed version and the earlier findings. Stop after a pass, or after three rounds, and report what is still open.

If no reviewer can run, record `BLOCKED: independent review` and say so in the reply. Your own review doesn't count.
