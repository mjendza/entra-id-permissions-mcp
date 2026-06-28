# `claude_code/` — Entra SP Terraform workspace

A self-contained Claude Code workspace that wires three MCP servers together and
adds an agent + slash command to turn *"create a service principal named X with
permissions A, B, C"* into ready-to-review Terraform — **generating code only**,
never touching your Azure tenant.

## Layout

```
claude_code/
  .mcp.json                              # 3 MCP servers
  .claude/
    agents/entra-sp-architect.md         # the agent (no shell access)
    commands/create-entra-sp.md          # /create-entra-sp command
  terraform/                             # generated .tf lands here
```

## How to use

Launch Claude Code **with this folder as the working directory** so it picks up
`.mcp.json` and `.claude/`:

```bash
cd claude_code
claude
```

Approve the MCP servers when prompted, then run, e.g.:

```
/create-entra-sp graph-reader User.Read.All Directory.Read.All
```

The `entra-sp-architect` agent resolves each permission name to its GUID and
Role/Scope type, generates `versions.tf`, `variables.tf`, `main.tf`, and
`outputs.tf` under `terraform/`, prints a resolution table, and stops. You run
`terraform init` / `plan` / `apply` yourself.

## MCP servers

| Server | Transport | Purpose |
|--------|-----------|---------|
| `entra-permissions` | npx `@mjendza/entra-permissions-mcp` (stdio) | Resolve Graph permission **name → GUID + Role/Scope**, look up first-party apps. |
| `microsoft-learn` | http `https://learn.microsoft.com/api/mcp` | Ground `azuread`/`azurerm` provider and Entra docs. |
| `terraform` | Docker `hashicorp/terraform-mcp-server` (stdio) | Terraform Registry / provider-docs tools. |

### Requirements

- **Node.js ≥ 20** with `npx` on PATH (for `entra-permissions`).
- **Docker** running locally (for the `terraform` server). The first run pulls
  `hashicorp/terraform-mcp-server`.

> Prefer not to run Docker? Swap the `terraform` entry for the official server's
> **streamable-http** mode: run `terraform-mcp-server streamable-http` (Go binary)
> locally, then point an http entry at it:
> ```json
> "terraform": { "type": "http", "url": "http://127.0.0.1:8080/mcp" }
> ```
> or use the community npm package via `npx -y terraform-mcp-server`.

## What gets generated

`azuread` provider Terraform for one app registration + service principal:

- `azuread_application.this` with a `required_resource_access` block for Microsoft
  Graph (`resource_app_id = "00000003-0000-0000-c000-000000000000"`) and one
  `resource_access { id = <GUID>; type = "Role" | "Scope" }` per permission.
- `azuread_service_principal.this` referencing the application.
- Outputs for the application (client) id and the service principal object id.

**Admin consent** is still required after `apply`; the generated `main.tf`
includes commented `azuread_app_role_assignment` /
`azuread_service_principal_delegated_permission_grant` examples if you want to
manage consent in Terraform too.

## Safety

- The agent has **no Bash tool**, so it structurally cannot run Terraform or reach
  your tenant — it only reads MCP data and writes `.tf` files.
- No Azure credentials are configured or required to generate the code.
