---
name: setup-kiwistack
description: One-time kiwistack setup. Connects the servicenow MCP server to a dev instance over OAuth, sets the target app scope, and checks the connection. Use for /setup-kiwistack, when a sn_* tool says the config is missing, or when adding another instance.
disable-model-invocation: true
---

# Set up kiwistack

kiwistack only talks to instances listed in `~/.kiwistack/config.json` (`%USERPROFILE%\.kiwistack\config.json` on Windows). Secrets live in `~/.kiwistack/secrets.env` or in environment variables, never in a repository and never in chat.

**You never type, paste or echo a secret.** You write the config and an empty secrets template. The user fills in the values themselves.

## Steps

1. **Ask for the non-secret facts.**
   - The instance host, for example `acme-dev.service-now.com`.
   - Its environment: `dev`, `test` or `sandbox`. kiwistack refuses `prod`, and it refuses any instance whose `glide.installation.production` property is true.
   - The target app scope, for example `x_acme_kiwi`. If the app doesn't exist yet, create it with **fluent-sdk** (`now-sdk init`) or in ServiceNow Studio, and come back.
   - The grant. `client_credentials` is preferred for a dedicated integration user. `password` works when the company allows it.

2. **Tell the user how to create the OAuth client on the instance.** They do this themselves, as an admin.
   - System OAuth > Application Registry > New > "Create an OAuth API endpoint for external clients". Note the client id and generate a client secret.
   - For `client_credentials`: set the registry record's OAuth application user to the integration user, and make sure the system property `glide.oauth.inbound.client.credential.grant_type.enabled` is `true`. The property name differs on some releases, so check the instance's docs if the token call fails.
   - **Scope Restriction (Zurich and later).** New clients default to **Securely scoped**, which only reaches APIs in the registry's own scope. Every Table API call then fails with "Access to unscoped api is not allowed".
     - Add an auth scope record to the client: name and scope both `useraccount`. That's ServiceNow's special scope for "anything this user can do".
     - Set the record's **Scope Restriction** to **Useraccount scoped**. kiwistack requests the `useraccount` scope by default.
     - Use **Broadly scoped** only if that doesn't work.
     - For a tighter setup, create a REST API auth scope covering only the Table API and the CI/CD API, link it to the client, and set `"scope"` in the config's `auth` block to its name.
   - The acting user needs to be able to write the app's metadata on dev (admin, or the app's delegated developer roles) and to run ATF through the CI/CD API (`sn_cicd.sys_ci_automation`).

3. **Write `~/.kiwistack/config.json`.** No secrets go in it, only the names of the env variables:

   ```json
   {
     "default": "dev",
     "instances": {
       "dev": {
         "host": "acme-dev.service-now.com",
         "environment": "dev",
         "scope": "x_acme_kiwi",
         "auth": {
           "grant": "client_credentials",
           "client_id_env": "KIWI_DEV_CLIENT_ID",
           "client_secret_env": "KIWI_DEV_CLIENT_SECRET"
         }
       }
     }
   }
   ```

   For the `password` grant, add `"username_env": "KIWI_DEV_USERNAME"` and `"password_env": "KIWI_DEV_PASSWORD"`.

4. **Write `~/.kiwistack/secrets.env` with empty values**, unless it already exists, and ask the user to fill it in and save it:

   ```
   KIWI_DEV_CLIENT_ID=
   KIWI_DEV_CLIENT_SECRET=
   ```

   Environment variables with the same names override the file.

5. **Restart.** The MCP server reads the config when it starts. Ask the user to run `/mcp` and reconnect `servicenow`, or restart Claude Code.

6. **Check.** Call `sn_instance_info`. Expect the host, the acting user, the scope sys_id, and `update_set_ok: false` (no kiwi update set yet). Then call `sn_component_catalog` with a small limit, so the design skills can see the components. Report each check and its result.

7. **Optional: the SDK.** If the user wants source-driven work, set up `now-sdk` per **fluent-sdk** and authenticate it to the same instance.

## Troubleshooting

When a step fails, read `references/troubleshooting.md`.
