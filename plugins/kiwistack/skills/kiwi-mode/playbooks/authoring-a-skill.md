# Authoring a skill

Writing or changing a kiwistack skill, playbook, principle or module reference.

1. Restate what behaviour should change and the run that showed the gap. Check: a concrete example request and what went wrong.
2. Find the right home. A rule that applies everywhere is a principle. A procedure is a playbook step. Facts about a module go in `sn-modules/references`. Facts about UI Builder records go in `ui-builder/references`. Check: you are editing one place, not adding a duplicate.
3. Prefer structure over text (**reflect**): if the lesson can be a guard in the MCP server, a test or a linter rule, do that.
4. Write it short. Frontmatter `name` matches the folder, `description` says when to use it. Link other skills with relative paths. Check: `node tools/lint-skills.mjs` passes.
5. Replay the example request against the dev instance, or describe the replay if you can't run it. Check: the behaviour changed.
