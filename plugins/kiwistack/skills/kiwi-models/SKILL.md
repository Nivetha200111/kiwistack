---
name: kiwi-models
description: Shows and changes which model (and reasoning effort) each kiwistack agent role runs on - recon, domain, designer, builder, qa, security, reviewer - per user or per project, overriding the agents' built-in defaults. Use for /kiwi-models, "use opus for QA", "make the reviewer a different model", or "reset kiwistack models".
---

# kiwi models

Every kiwistack role has a built-in default model, set in its agent file. A model sheet overrides those defaults, and **kiwi-team** reads it before every spawn.

## Defaults

| Role | Agent | Default | Why |
|-|-|-|-|
| recon | `kiwistack:kiwi-recon` | `sonnet` | Many fast, factual queries |
| domain | `kiwistack:kiwi-domain` | `opus` | Judgment about definitions |
| designer | `kiwistack:kiwi-designer` | `opus` | Judgment about the persona and copy |
| builder | `kiwistack:kiwi-builder` | `opus` | Careful, guarded writes |
| qa | `kiwistack:kiwi-qa` | `sonnet` | Many checks; independent of the builder |
| security | `kiwistack:kiwi-security` | `sonnet` | Audit and confirmation |
| reviewer | `kiwistack:kiwi-reviewer` | `opus` | Judgment; must differ from the builder in practice (see below) |

## The sheet

The sheet is JSON. A project sheet, `.kiwi/models.json` in the project folder, wins over the user sheet, `~/.kiwistack/models.json`. Either file may set only some roles.

```json
{
  "default_effort": "high",
  "roles": {
    "qa": "opus@xhigh",
    "reviewer": "sonnet",
    "recon": "haiku"
  }
}
```

**Value forms:**
- `model`, such as `sonnet`;
- `model@effort`, such as `opus@xhigh`;
- `inherit`, which runs that role on the coordinator's model.

Models are the names the `Agent` tool accepts (`sonnet`, `opus`, `haiku`, `fable`). Efforts are `low`, `medium`, `high`, `xhigh` and `max`.

## Resolving (used by kiwi-team)

`node <plugin root>/scripts/models.mjs <project folder>` prints the resolved table as JSON, with its warnings. The plugin root is two folders above this skill. Use the script rather than resolving by hand. It implements these rules:

For each role, take the first that applies: the project sheet, then the user sheet, then the default above. Split off any `@effort`; otherwise use `default_effort` if the sheet sets one. Pass the results as `model` and `effort` on the `Agent` call, or omit `model` for `inherit`.

- **Rejected model or effort:** if the `Agent` tool rejects it, fall back to the role's default and say so in the report.
- **Second opinion:** if the resolved reviewer equals the resolved builder, kiwi-team adds a second reviewer on another model. A second opinion from the same model isn't independent.

## Changing it

When the user asks to change models:
1. Run the script and show the current resolved table: role, model, effort, and where each value came from.
2. Write only the roles they named, to the user sheet unless they say "for this project". Create the file if it's missing, and keep the other roles in it.
3. Show the new table. If the builder and reviewer now match, point that out.

To reset, delete the sheet the user names (ask first), or remove just the named roles.
