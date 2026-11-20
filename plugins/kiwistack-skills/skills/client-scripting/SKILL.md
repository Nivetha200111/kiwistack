---
name: client-scripting
description: Writing and reviewing ServiceNow client-side logic - UI policies, client scripts (onLoad, onChange, onSubmit, onCellEdit), catalog client scripts, g_form, g_user, g_scratchpad and GlideAjax - for forms in Core UI and workspaces. Use whenever kiwistack changes form behaviour.
disable-model-invocation: true
---

# Client scripting

## Choose the lightest mechanism

1. **UI policy.** Mandatory, read-only, visible, or clearing values based on conditions. Add a data policy when the rule must also hold for imports and APIs.
2. **Client script.** Only for what a UI policy can't do: computed defaults, cross-field validation with a message, calls to the server.
3. **Declarative actions and UI Builder events.** For behaviour in workspaces and UI Builder pages, not form client scripts.

## Rules

- **Server data.**
  - At load: a display business rule fills `g_scratchpad`.
  - On change: async `GlideAjax` with a callback (`getXMLAnswer`), calling a client-callable script include that checks roles.
  - Never use `GlideRecord`, `getXMLWait` or `getReference` without a callback.
- **onChange scripts** start with `if (isLoading || newValue === oldValue) return;` unless they deliberately run on load.
- **onSubmit validation** returns `false` with a `g_form.addErrorMessage` or `showFieldMsg` that tells the user what to fix.
- **Field names** are the column names (`u_` or `x_` prefixed for custom fields), not labels.
- **Workspaces.** Client scripts need their UI Type set to "All" (or Mobile / Service Portal as applicable) to run outside Core UI. Check it.
- **Use `g_user.hasRole()` for UX only.** Security is enforced by ACLs on the server (**principle-least-privilege-acls**).
- **No DOM manipulation**, `jQuery` or `document` access. It breaks in workspaces and on upgrade.

## Review checklist

- A client script that a UI policy could replace.
- A synchronous server call.
- A missing `isLoading` guard.
- A UI Type that excludes the workspace where the form is used.
- Security decisions made in the browser.
