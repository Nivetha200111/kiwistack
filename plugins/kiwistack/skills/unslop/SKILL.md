---
name: unslop
description: Writing rules that strip AI tells from what kiwistack writes - page text, report.md, findings, PR descriptions, release notes and posts. Use before any text reaches a user, when kiwi-slop-checker reviews a report, or for /unslop.
---

# unslop

Rewrite text so a person could have written it on purpose. Keep the meaning, the numbers and the tone. Rule numbers are stable: other files cite them, and a removed rule leaves a gap.

## Content

1. **Say the number.** "13 of 23 new hires need attention", not "many new hires need attention".
2. **Every claim points at evidence.** "Verified" names the screenshot or count row. Without one, say "not verified".
3. **No generic conclusions.** Cut the last paragraph if it would fit any other project.
4. **Name things once and keep the name.** A card called "Nobody on it" stays "Nobody on it" in the report.
5. **No invented attribution.** "Best practice says" names the source or goes.

## Words

6. **Plain verbs.** "use", not "leverage" or "utilize". "is", not "serves as".
7. **No filler words:** robust, seamless, comprehensive, crucial, delve, enhance, empower, streamline, cutting-edge, game-changer.
8. **No abstract nouns doing a verb's job:** "the implementation of the fix" becomes "fixing it".
9. **At most one hedge per claim:** "may". Never "might potentially".
10. **No table, field or scope names in user-facing text.** "Onboarding case", not `x_..._onboarding_case`.

## Sentences

11. **One idea per sentence.** Split any sentence a reader has to read twice.
12. **Active voice, with the actor named:** "the builder created the ACL", not "the ACL was created".
13. **No "not just X, but Y", and no "from X to Y"** unless X and Y are ends of a real range.
14. **Don't force lists into threes.** List what exists.
15. **No trailing "-ing" clauses that add nothing:** "..., ensuring a seamless experience".

## Format

16. **Sentence-case headings.**
17. **No decorative emoji or bold on every term.**
18. **No chatbot openers or closers:** "Great question", "I hope this helps", "Let me know if".
19. **Page text is short:** a label is a noun phrase, a hint is one sentence with the next action.

When you review someone else's text, quote the sentence, give the rule number, and give the rewrite.
