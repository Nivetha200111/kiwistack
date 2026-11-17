---
name: fluent-sdk
description: Source-driven ServiceNow development with the ServiceNow SDK (now-sdk) and the Fluent language. Covers project setup, OAuth authentication, the metadata Fluent supports, build and install, and keeping the repo complete alongside UI Builder records. Use for tables, roles, ACLs, business rules, script includes, client scripts, UI policies, UI actions, properties and ATF tests.
---

# ServiceNow SDK and Fluent

Fluent is a TypeScript-based language that compiles to ServiceNow metadata. The SDK CLI (`now-sdk`, from the npm package `@servicenow/sdk`) builds it and installs the app on an instance. Source lives in git, so every change is reviewable as a diff.

**The installed SDK is the source of truth for the API.** Read the type definitions in `node_modules/@servicenow/sdk` (the `core` and `global` exports) before you write a construct. APIs change between SDK versions. If the docs and the types disagree, the types win.

## What goes in Fluent

Use Fluent for anything the installed SDK exports: typically `Table` and columns, `Role`, `Acl`, `BusinessRule`, `ScriptInclude`, `ClientScript`, `UiPolicy`, `UiAction`, `Property`, `CrossScopePrivilege`, ATF tests, and on newer SDKs flows and UI pages.

UI Builder pages are not in Fluent. They go through **ui-builder**.

## Project setup

Do this once per app.

1. Ask before creating a project in the user's repo. Then run `npx @servicenow/sdk init` in an empty folder (or `now-sdk init`), with the app's name and scope. The scope must match `~/.kiwistack/config.json`.
   - To bring an existing app under source control, use the SDK's conversion command (`now-sdk transform` on recent versions; check `now-sdk --help`).
2. Authenticate to the dev instance with `now-sdk auth`, using OAuth if the installed version supports it. The user enters the credentials in the terminal. You never type them. Ask for this at the start of the task, not when you first need it, so an otherwise unattended run doesn't stall. If the user can't, build what you can through the MCP server (`sn_upsert` for roles, script includes, ATF tests) and list what's left for them: ACLs can't go through the MCP server.
3. Commit the scaffold.

## The loop

1. Write the ATF test first (**atf**).
2. Write the metadata in `src/fluent/**/*.now.ts`, and keep server code in plain `.js` or `.ts` modules that the Fluent files import. Each record gets a stable `$id: Now.ID['<descriptive-key>']`. Never reuse or rename keys, or the SDK creates duplicates.
3. `now-sdk build`. Fix every error.
4. `now-sdk install` deploys to the instance. Ask the user the first time in a task. After that it's routine on dev.
5. Run the ATF suite (`sn_atf_run_suite`) and verify (**sn-verify**).

## Keeping source complete

UI Builder records written through the MCP server live on the instance and in the `kiwi/` update set, not in the repo. When the page is done:
- If the installed SDK can pull instance metadata into the project (check `now-sdk --help` for a transform or download command), run it and commit the generated files.
- If it can't, record the update set name in the repo (for example in `docs/instance-artifacts.md`), so the two halves travel together.
- Mention this in the reply. A mismatch between repo and instance is the most common way source-driven work loses changes.

## Pitfalls

- An SDK install moves the whole application. Don't mix in a hand-edited update set for the same records.
- Deleting a Fluent record removes it on the next install. Treat deletes as `needs_approval`, and say so before installing.
- Keep business logic out of the `.now.ts` files. Import it, so it can be read and tested on its own.
