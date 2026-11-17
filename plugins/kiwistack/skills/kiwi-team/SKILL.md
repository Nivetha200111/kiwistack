---
name: kiwi-team
description: Runs a ServiceNow build as a team of specialist agents instead of one agent doing everything - kiwi-recon and kiwi-domain in parallel, kiwi-designer, kiwi-builder, then kiwi-qa, kiwi-security and kiwi-reviewer in parallel, one fix round, and an evidence gate before anything is called done. Every hand-off is a file in .kiwi/runs/<slug>/. Use from kiwi-mode for any build (pages, features, flows) or for /kiwi-team.
---

# kiwi team

You are the coordinator. **You don't do the specialists' work.** You don't run recon queries, write specs, build records or verify pages yourself. You brief, decide, triage and report. Delegating isn't optional: a single agent checking its own work is how plausible-looking slop ships.

## Setup

1. **Run folder.** `.kiwi/runs/<task-slug>/` in the project folder. Write `goal.md` there: the user's request word for word, your restatement, the module, and the target scope. Every brief points at this folder. Briefs pass paths, never pasted content.
2. **Models.** Run `node <plugin root>/scripts/models.mjs <project folder>`. It applies the project sheet, the user sheet and the defaults described in `../kiwi-models/SKILL.md`. Pass each role's `model` and `effort` on its `Agent` call; `inherit` omits `model`. Copy any `warnings` into `decisions.md`.
   - If the reviewer would run on the same model as the builder, add a second reviewer on a different model. A second opinion from the same model isn't independent.
3. **Update set.** Have the builder create `kiwi/<task-slug>`. Nobody else writes to the instance.

## The pipeline

Run steps marked parallel in a single message, as background agents. Wait for every report before the next step.

| Step | Agents | Reads | Writes |
|-|-|-|-|
| 1. Understand (parallel) | `kiwistack:kiwi-recon`, `kiwistack:kiwi-domain` | `goal.md` | `recon.md`, `domain.md` |
| 2. Reconcile | you | `recon.md`, `domain.md` | `decisions.md` |
| 3. Design | `kiwistack:kiwi-designer` | 1 and 2 | `spec.json` / `design.md` |
| 4. Build | `kiwistack:kiwi-builder` | `spec.json` | `build.md` |
| 5. Verify (parallel) | `kiwistack:kiwi-qa`, `kiwistack:kiwi-security`, `kiwistack:kiwi-reviewer` | everything | `qa.md`, `security.md`, `review.md` |
| 6. Triage | you | step 5 | `fixes.md` |
| 7. Fix, then re-verify | builder, then QA and reviewer (parallel) | `fixes.md` | updated `build.md`, `qa.md`, `review.md` |
| 8. Gate and report | you | everything | `report.md` |

**Step 2, reconcile.** Where `domain.md` and `recon.md` disagree (a definition that doesn't fit the real data, or a reason recon found to be noise), decide, and write the decision and its reason in `decisions.md`.
- Genuine product calls go to the user only if no sensible default exists. Otherwise take the domain agent's recommended default and say so in the report.

**Step 6, triage.** Each finding from QA, security or the reviewer becomes one of:
- **Fix:** goes into `fixes.md` for the builder, with the evidence.
- **Accept:** with a concrete reason.
- **Can't fix here:** a compiler or tool bug. Report it, don't work around it.

Run one fix round. Run a second only if a rubric must, or a critical or high security finding, is still failing.

## Verification is the product

kiwistack exists so that AI-built ServiceNow work isn't slop. These rules aren't negotiable:

- **No evidence, no claim.** Every claim in the final reply cites a file in the run folder: a count table row, a screenshot, an audit line, a reviewer verdict. If it isn't in the folder, it isn't done.
- **The verifier isn't the builder.** QA checks against `domain.md`'s definitions with its own queries, never the builder's.
- **Independent eyes.** The reviewer runs on a different model from the builder (see Setup), and reads files, not the builder's summary.
- **Unverified means unverified.** A state nobody saw (no-access without a test user, an error state) is reported as unverified. It's never implied to be fine.
- **Gate.** Before step 8, run `node <plugin root>/scripts/check-run.mjs .kiwi/runs/<task-slug>`. The plugin root is two folders above this skill. If it fails, the run isn't done: fix what it names, or report exactly what's missing.

## Report

Write `report.md`, then reply from it:
- the goal;
- what exists, with the URL and update set;
- the counts from `qa.md`;
- the security verdict;
- the reviewer verdict;
- what's unverified;
- compiler or tool bugs found;
- elapsed time;
- which model ran each role.

Keep it short and declarative. Link the run folder.
