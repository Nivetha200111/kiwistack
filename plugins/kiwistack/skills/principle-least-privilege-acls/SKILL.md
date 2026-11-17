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
- **UI Builder data brokers (transform or scripted).** These need an execute ACL (type `ux_data_broker`), or the page shows nothing. Grant it to the page's audience role only. Confirm the ACL type name on the instance.
- **REST.** Scripted REST resources require authentication and a role.
- **Pages.** Restrict routes and variants to the audience's roles.
- **HR and other sensitive data.** Respect the module's own security (HR case access, COE security, CSM account and contact rules). Read through the module's tables and APIs with the same checks. Don't add a side door.
- **Testing.** Add an ATF test that impersonates a user without the role and asserts access is denied.

**Example.** An onboarding progress page for HR agents. Its data broker gets an execute ACL for the HR agent role the instance uses. An ATF step impersonates an ITIL-only user and expects no data.
