# Entra Permissions MCP Server

An [MCP](https://modelcontextprotocol.io) server that exposes this repo's Microsoft Entra ID /
Microsoft Graph permissions data to AI agents (Claude Code, Claude Desktop, Cursor, …).

It serves the canonical permissions JSON — the same data the `permissions/` React app bundles —
through MCP tools and resources.

## Where the data comes from

**Remote-first, local fallback.** At startup the server fetches the three JSON datasets from the
public **jsDelivr CDN**, served from the dedicated public data store repo
[`mjendza/entra-id-permissions-mcp`](https://github.com/mjendza/entra-id-permissions-mcp):

```
https://cdn.jsdelivr.net/gh/mjendza/entra-id-permissions-mcp@main/data/<file>.json
```

The data is refreshed by this repo's [`scrape.yaml`](../.github/workflows/scrape.yaml) pipeline,
which generates the JSON and pushes it to the store repo's `data/` folder. Serving from the CDN
means a deployed/serverless MCP host needs **no bundled data** and pays no egress to host ~2 MB of
JSON — jsDelivr caches it globally. If the fetch fails (offline, CDN down, or remote disabled) the
server falls back to the local [`data/`](../data) files in this repo.

> **Prerequisite:** the pipeline must have published the three `*.json` files to the store
> repo's `data/` folder on `main` at least once. Until then the server transparently uses the local fallback.

## Datasets

| Source file | Records | Exposed as |
|-------------|---------|------------|
| `data/GraphAppRoles.json` | 630 | Graph **Application** permissions (app roles) |
| `data/GraphDelegateRoles.json` | 714 | Graph **Delegated** permissions (oauth2 scopes) |
| `data/MicrosoftApps.json` | 3854 | Microsoft first-party apps + their app roles |

## Tools

| Tool | Purpose |
|------|---------|
| `search_graph_application_permissions` | Keyword search application permissions (Value/DisplayName/Description). |
| `search_graph_delegated_permissions` | Keyword search delegated permissions; optional `type` = `Admin`/`User`. |
| `get_permission` | Exact lookup by scope `value` or GUID `id` across both Graph datasets. |
| `search_microsoft_apps` | Find first-party apps by display name or AppId (summary only). |
| `get_microsoft_app` | Full record for one app (by `appId`) including its `AppRoles`. |
| `search_app_roles` | Find which Microsoft app exposes a given app role. |

Search tools return `{ totalMatches, returned, results }` and accept an optional `limit`
(default 25, max 200) so large result sets stay bounded.

## Resources

- `entra://graph/application-permissions`
- `entra://graph/delegated-permissions`
- `entra://microsoft-apps`

Each returns the full raw dataset as `application/json`.

## Build

```bash
cd mcp-server
npm install
npm run build
```

## Run

**stdio** (local clients):

```bash
npm run start:stdio      # node dist/stdio.js
```

**Streamable HTTP** (network / serverless hosting):

```bash
npm run start:http       # node dist/http.js  -> http://localhost:3000/mcp
```

`GET /health` returns `200 {"status":"ok"}`. The HTTP transport runs **stateless** (no session
id) which keeps serverless hosting simple; switch to session mode by supplying a
`sessionIdGenerator` in `src/http.ts` if you need server-initiated streams.

### Config

- `ENTRA_DATA_BASE_URL` — override the remote base URL (defaults to the jsDelivr CDN path above).
  Set to an empty string to disable remote fetching.
- `ENTRA_DATA_LOCAL_ONLY` — set to any value to skip the network entirely and read local files.
- `ENTRA_DATA_DIR` — override the local fallback directory (defaults to the repo's `data/`).
- `PORT` — HTTP port (default `3000`).

## Register with a client
**Claude Code** (windows) from npm:

```json
{
  "mcpServers": {
    "entra-permissions": {
      "command": "cmd",
      "args": ["/c", "entra-permissions-mcp"]
    }
  }
}
```

## Use with Claude Code (agents & commands)

The [`claude_code/`](claude_code) folder is a ready-made Claude Code workspace that
wires this MCP server together with the Microsoft Learn and Terraform MCP servers,
then layers **subagents** and **slash commands** on top so you can go from
plain-English intent to a permission table — or to ready-to-review Terraform —
without leaving the terminal.

### Quick start

Launch Claude Code **with `claude_code/` as the working directory** so it picks up
`.mcp.json` and `.claude/`:

```bash
cd claude_code
claude
```

Approve the MCP servers when prompted (or pre-approve them via
`enabledMcpjsonServers` in `.claude/settings.local.json`).

### The MCP wiring (`claude_code/.mcp.json`)

| Server | Transport | Purpose |
|--------|-----------|---------|
| `entra-permissions` | `entra-permissions-mcp` (stdio) | This server — resolve Graph permission **name → GUID + Role/Scope**, look up first-party apps. |
| `microsoft-learn` | http `https://learn.microsoft.com/api/mcp` | Ground `azuread` provider and Entra docs. |
| `terraform` | Docker `hashicorp/terraform-mcp-server` (stdio) | Terraform Registry / provider-docs tools. |

> The `terraform` server needs Docker running. If you'd rather not use Docker,
> use the **`entra-sp-architect-simple`** agent (below), which confirms provider
> syntax via the `microsoft-learn` MCP instead.

### Slash commands

```bash
# Resolve a capability to permission name(s) + GUID — look-up only, no files written
/ask-for-permission manage groups

# Generate Terraform for a service principal with the given Graph permissions
/create-entra-sp graph-reader User.Read.All Directory.Read.All
```

`/ask-for-permission` hands off to the **entra-permission-finder** agent;
`/create-entra-sp` hands off to the **entra-sp-architect** agent.

### Subagents

| Agent | What it does | MCP tools used |
|-------|--------------|----------------|
| `entra-permission-finder` | Turns *"read all users"*, *"send mail as the user"*, etc. into the matching permission(s) as **name + GUID + Application/Delegated**. Read-only — never writes files or touches a tenant. | `entra-permissions` (`get_permission`, `search_graph_*`, `search_microsoft_apps`, `search_app_roles`) |
| `entra-sp-architect` | Resolves permission names to GUIDs, confirms `azuread` syntax, and writes `versions.tf` / `variables.tf` / `main.tf` / `outputs.tf` into `claude_code/terraform/`. Code only — never runs `plan`/`apply`. | `entra-permissions` + `microsoft-learn` + `terraform` MCPs |
| `entra-sp-architect-simple` | Same as above but **no Docker / Terraform MCP** — confirms provider syntax via `microsoft-learn` only. | `entra-permissions` + `microsoft-learn` MCPs |

### Example: find a permission

```
/ask-for-permission manage groups
```

The `entra-permission-finder` agent searches the `entra-permissions` MCP and
returns a table, least-privilege match first:

| Permission (name) | GUID | Type | API | What it allows |
|-------------------|------|------|-----|----------------|
| `Group.ReadWrite.All` | `62a82d76-70ea-41e2-9197-370581804d09` | Application (Role) | Graph | Read and write all groups |
| `Group.Read.All` | `5b567255-7703-4780-807c-7be8301ae99b` | Application (Role) | Graph | Read all groups |

> GUIDs above are illustrative — the agent returns the live values from the MCP and
> never invents a name or GUID.

### Example: generate Terraform for a service principal

```
/create-entra-sp graph-reader User.Read.All Directory.Read.All
```

The `entra-sp-architect` agent resolves each permission to its GUID + Role/Scope,
writes the `.tf` files under `claude_code/terraform/`, and emits one
`resource_access` block per permission, e.g.:

```hcl
resource "azuread_application" "this" {
  display_name = var.display_name

  required_resource_access {
    resource_app_id = "00000003-0000-0000-c000-000000000000" # Microsoft Graph

    resource_access {
      id   = "df021288-bdef-4463-88db-98f22de89214" # User.Read.All
      type = "Role"
    }
    resource_access {
      id   = "7ab1d382-f21e-4acd-a863-ba3e13f7da61" # Directory.Read.All
      type = "Role"
    }
  }
}
```

It then prints a `name → GUID → Role/Scope` resolution table and stops — you run
`terraform init` / `plan` / `apply` yourself. **Admin consent is still required**
after apply. See [`claude_code/README.md`](claude_code/README.md) for full details.



