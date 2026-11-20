---
name: principle-attack-the-premise
description: Engineering principle adapted from pstack. When two fixes built on the same assumption have failed, write the assumption down and test it directly before trying a third. Apply during bug fixes and whenever a page, rule or flow keeps not doing what you expect.
disable-model-invocation: true
---

# Attack the premise

**Rule.** Two failures on one assumption mean the assumption is the suspect. Test it directly next.

**ServiceNow premises that often turn out false.**
- "This business rule runs." Check its `when`, its order, its condition, its scope, and any `setWorkflow(false)` elsewhere.
- "This user can see that data." It may be an ACL, a before-query rule, or HR or CSM case security.
- "The page reads this data resource." Check the data broker's ACL and the property bindings, and look at the network response in the browser.
- "My write went into the update set." Check the record's `sys_update_xml` entry in the set.
- "This field is populated." Query real records.

**How.** Write the premise as a sentence. Design the smallest observation that confirms or refutes it (a read-only query, an ATF step, the browser network panel). Run it before writing another fix.
