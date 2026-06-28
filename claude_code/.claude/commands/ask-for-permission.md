---
description: Find the Microsoft Entra ID / Graph permission(s) for what you want to do and return each one's name + GUID.
argument-hint: <what you want to do, e.g. "manage groups">
---

Use the **entra-permission-finder** agent to resolve a plain-English capability
into the matching Microsoft Entra ID / Microsoft Graph permission(s), returning
each permission's **name** (scope value) and **GUID**.

Request: `$ARGUMENTS`

Follow this workflow:

1. If the request above is empty, ask me what I'm trying to do (e.g. "manage
   groups", "read all users", "send mail as the user") before continuing.

2. Hand the request to the **entra-permission-finder** agent. It searches the
   **entra-permissions** MCP and returns one or more matching permissions with
   their GUID and whether each is an **Application** permission (`type = "Role"`)
   or a **Delegated** permission (`type = "Scope"`).

3. Present the result as a table — **name → GUID → type** — with the
   least-privilege match first, then call out the recommended pick.

**Look-up only.** Do not invent names or GUIDs, do not write files, and do not
make any change to an Azure tenant.
