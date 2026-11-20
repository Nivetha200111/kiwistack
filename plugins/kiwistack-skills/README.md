# kiwistack-skills

The text-only edition of [kiwistack](https://github.com/Nivetha200111/kiwistack) for Claude Code: ServiceNow development principles, references and an independent reviewer agent. [Privacy](#privacy)

```
/plugin install kiwistack-skills --marketplace Nivetha200111/kiwistack
```

## What's inside

- **kiwi-skills**, the one skill that loads on its own. It applies the principles and opens the others when a task needs them.
- **11 principles**: scope everything, never modify out-of-the-box records, update set discipline, config before code, query hygiene, least-privilege ACLs, design like a product, prove it on the instance, the laziness protocol, attack the premise, and guard the context window.
- **Building blocks**: the ServiceNow SDK (Fluent), server and client scripting, Flow Designer, the Next Experience design rubric and page archetypes, and maps of eight modules (HRSD, ITSM, CSM, SPM, IRM, FSM, CMDB, HAM/SAM).
- **Review**: `sn-interrogate` and the `kiwi-reviewer` agent, which report only findings they can prove.
- **unslop**, writing rules for anything that reaches a user.

## What it doesn't have

This edition has no ServiceNow server, no hooks and no scripts, so it can't touch an instance on its own. It works through what you already use: the ServiceNow SDK in your project, a ServiceNow MCP server you've connected, or the REST API with credentials in your own environment.

The full kiwistack plugin adds the parts that need code:
- a guarded ServiceNow server that refuses production and writes only inside a `kiwi/` update set;
- an approval hook that asks you before deletes and out-of-scope writes;
- a page compiler, an app audit, and a team of nine agents with a proof gate.

Install it from GitHub:

```
claude plugin marketplace add Nivetha200111/kiwistack
claude plugin install kiwistack@kiwistack
```

## Privacy

Through the tools you've connected, Claude reads records from your ServiceNow instance, and those records can include people's names and email addresses. Data goes only to the instance you point it at. kiwistack has no service of its own, so nothing is sent to its maintainers and nothing is kept.

## License

MIT. A personal project, not affiliated with or endorsed by ServiceNow.
