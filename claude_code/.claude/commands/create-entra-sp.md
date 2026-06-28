---
description: Generate Terraform for an Entra ID service principal with the given Microsoft Graph permissions (code only — no plan/apply).
argument-hint: <sp-display-name> [permission names...]
---

Use the **entra-sp-architect** agent to generate Terraform for an Entra ID
(Azure AD) service principal with a specific set of Microsoft Graph permissions.

Request: `$ARGUMENTS`

Follow this workflow:

1. Parse the service principal **display name** (first argument) and the list of
   **Graph permission names** (remaining arguments) from the request above. If
   the display name or the permission list is missing, ask me before continuing.

2. For each permission name, resolve it through the **entra-permissions** MCP
   (`get_permission`, falling back to the `search_graph_*` tools for fuzzy or
   ambiguous names) to obtain the permission **GUID** and whether it is an
   **application** permission (`type = "Role"`) or a **delegated** permission
   (`type = "Scope"`). Microsoft Graph's resource app id is the well-known
   `00000003-0000-0000-c000-000000000000`.

3. Confirm `azuread` provider syntax via the **terraform** / **microsoft-learn**
   MCPs, then generate `versions.tf`, `variables.tf`, `main.tf`, and `outputs.tf`
   into `claude_code/terraform/` (an `azuread_application` with one
   `resource_access` block per permission, plus an `azuread_service_principal`).

4. Print a resolution table (`name → GUID → Role/Scope`), list the files you
   wrote, and tell me the next manual steps (`terraform init` / `plan` /
   `apply`).

**Generate code only.** Do not run `terraform init`, `plan`, or `apply`, and do
not make any change to an Azure tenant.
