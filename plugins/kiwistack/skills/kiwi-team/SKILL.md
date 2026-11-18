---
name: kiwi-team
description: The specialist pipeline behind every kiwistack build - preflight, recon and domain, design, build, then QA, security, review and slop check in parallel, one fix round, and the proof gate. Opened by kiwi-mode, or /kiwi-team.
disable-model-invocation: true
---

# kiwi team

You coordinate; the specialists do the work. Briefs pass paths into the run folder, never pasted content. The plugin root is two folders above this skill.

## Setup

0. **Preflight.** `node <plugin root>/scripts/preflight.mjs` proves the approval hook still asks before deletes and `user_approved` writes. If it fails, stop and ask the user to restore the hook. Don't edit it yourself.
1. **Run folder.** `.kiwi/runs/<task-slug>/`. Write `goal.md`: the request word for word, your restatement, the module, the target scope, and `Started (UTC): YYYY-MM-DD HH:MM:SS` taken just before the first spawn (`node -e "console.log(new Date().toISOString().slice(0,19).replace('T',' '))"`).
2. **Models.** `node <plugin root>/scripts/models.mjs <project folder>`. Pass each role's `model` and `effort` on its `Agent` call; `inherit` omits `model`. Copy any `warnings` into `decisions.md`. If the reviewer resolves to the builder's model, add a second reviewer on another model.
3. **Update set.** The builder creates `kiwi/<task-slug>`. Nobody else writes to the instance.

## The pipeline

Run parallel steps in a single message, as background agents. Wait for every report before the next step.

| Step | Agents | Reads | Writes |
|-|-|-|-|
| 1. Understand (parallel) | `kiwistack:kiwi-recon`, `kiwistack:kiwi-domain` | `goal.md` | `recon.md`, `domain.md` |
| 2. Reconcile | you | `recon.md`, `domain.md` | `decisions.md` |
| 3. Design | `kiwistack:kiwi-designer` | 1 and 2 | `spec.json` / `design.md` |
| 4. Build | `kiwistack:kiwi-builder` | `spec.json` | `build.md` |
| 5. Verify (parallel) | `kiwistack:kiwi-qa`, `kiwistack:kiwi-security`, `kiwistack:kiwi-reviewer`, `kiwistack:kiwi-slop-checker` | everything | `qa.md`, `security.md`, `review.md`, `slop.md` |
| 6. Triage | you | step 5 | `fixes.md` |
| 7. Fix, then re-verify | builder, then QA, reviewer and slop checker (parallel) | `fixes.md` | updated `build.md`, `qa.md`, `review.md`, `slop.md` |
| 8. Gate and report | you | everything | `report.md` |

**Step 2, reconcile.** Where `domain.md` and `recon.md` disagree, decide and write the decision and its reason in `decisions.md`. Ask the user only for a product call with no sensible default; otherwise take the domain agent's default and say so in the report.

**Step 6, triage.** Findings follow `references/findings.md`. Anything under `## Not proven` stays out of `fixes.md` unless you run its proof yourself and it holds. Each proven finding becomes:
- **Fix:** into `fixes.md` for the builder, with its proof.
- **Accept:** with a concrete reason.
- **Can't fix here:** a compiler or tool bug. Report it; don't work around it.

The run's own records in QA's capture audit are a `must`: re-capture them, or say how they'll ship. Run a second fix round only if a must or a critical or high security finding still fails.

**Step 8, the proof gate.** `node <plugin root>/scripts/check-run.mjs .kiwi/runs/<task-slug>`. If it fails, the run isn't done: fix what it names, or report exactly what's missing.

## Report

No proof, no claim: every line of `report.md` points at a file in the run folder. Write it, then reply from it:
- the goal;
- what exists, with the URL and update set;
- the counts from `qa.md`;
- the security, review and slop verdicts, and the capture audit line;
- what's unverified (a state nobody saw is unverified, never implied fine);
- compiler or tool bugs found;
- elapsed time, and which model ran each role.
