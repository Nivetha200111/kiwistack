---
name: principle-least-privilege-acls
description: ServiceNow principle. Every new table, field, client-callable script include, data broker, REST resource and page gets the narrowest role that works, with ACLs created alongside it and tested as a user without the role. Apply when creating any of these, or reviewing security.
---

# Least-privilege ACLs

**Rule.** Nothing new is reachable by default. Each new surface gets explicit ACLs for the role that needs it, and nobody else.

**Why.** A table without ACLs, a client-callable script include, or a data broker without an execute ACL is an open door. Open doors in HR and customer data are serious.

**How.**
- **New table.** ACLs for create, read, write and delete, tied to app roles. In Fluent, ship the `Role` and `Acl` records with the table.
- **Client-callable script includes.** Make them client-callable only when needed. Check the role inside each method as well as in the ACL.
- **Who can create ACLs.** Writing `sys_security_acl` needs the `security_admin` role elevated, and an OAuth token can't elevate. The MCP server refuses ACL writes up front with `NEEDS_SECURITY_ADMIN`. So plan the ACL route before building:
  - Best: need no new ACL. Read through OOTB data resources (the GraphQL record queries), which use the tables' existing ACLs.
  - Otherwise ship the ACL in Fluent with what it protects, and install it with the SDK (**fluent-sdk**).
  - Otherwise ask the user to elevate and create the ACL in the browser, with the `kiwi/` update set selected, and give them the exact type, name, operation and role.
- **UI Builder data brokers (transform or scripted).** These need an execute ACL (type `ux_data_broker`). Without it the broker is denied to everyone, admin included, and the page shows nothing. Grant it to the page's audience role only. Confirm the ACL type name on the instance.
- **REST.** Scripted REST resources require authentication and a role.
- **Pages.** `sys_ux_screen` has no roles field. Restrict a page with an audience (`sys_ux_applicability`, with the role) linked to its screen (**ui-builder**, "Routes and variants").
- **HR and other sensitive data.** Respect the module's own security (HR case access, COE security, CSM account and contact rules). Read through the module's tables and APIs with the same checks. Don't add a side door.
- **Testing.** Add an ATF test that impersonates a user without the role and asserts access is denied.

**Example.** An onboarding progress page for HR agents. Its data broker gets an execute ACL for the HR agent role the instance uses. An ATF step impersonates an ITIL-only user and expects no data.
