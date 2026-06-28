import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DataStore } from "./data.js";
import type { Logger } from "./logger.js";
import { DEFAULT_LIMIT } from "./search.js";
import { jsonResult, errorResult, type ToolResult } from "./result.js";
import { formatError } from "./errors.js";
import * as tools from "./tools.js";

const INSTRUCTIONS = `Exposes Microsoft Entra ID / Microsoft Graph permissions data.

Datasets:
- Graph Application permissions (app roles, e.g. "User.Read.All") — used for app-only access.
- Graph Delegated permissions (oauth2 scopes) — used for delegated (on-behalf-of-user) access.
- Microsoft first-party apps and the app roles they expose.

Use search_* tools to find scopes/apps by keyword, get_permission for an exact scope/GUID
lookup across both Graph datasets, get_microsoft_app for a single app's full role list, and
search_app_roles to discover which Microsoft app exposes a given role.`;

export interface ServerDeps {
  version: string;
  data: DataStore;
  logger: Logger;
}

export function createServer({ version, data, logger }: ServerDeps): McpServer {
  const server = new McpServer({ name: "entra-permissions-mcp", version }, { instructions: INSTRUCTIONS });

  // Run a tool body, converting any thrown value into an isError result and
  // logging it (stdout is reserved for JSON-RPC).
  const run = (name: string, fn: () => unknown): ToolResult => {
    try {
      return jsonResult(fn());
    } catch (err) {
      logger.log(`tool ${name} failed`, { error: formatError(err) });
      return errorResult(`Tool ${name} failed: ${formatError(err)}`);
    }
  };

  const limitSchema = z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe(`Max results to return (default ${DEFAULT_LIMIT}).`);

  // 1. Search Graph Application permissions ---------------------------------
  server.registerTool(
    "search_graph_application_permissions",
    {
      title: "Search Graph application permissions",
      description:
        "Search Microsoft Graph Application permissions (app roles) by keyword across the " +
        "scope Value, DisplayName, and Description. Application permissions grant app-only " +
        "(no signed-in user) access.",
      inputSchema: {
        query: z.string().describe('Keyword, e.g. "AccessReview" or "User.Read".'),
        limit: limitSchema,
      },
    },
    async ({ query, limit }) =>
      run("search_graph_application_permissions", () =>
        tools.searchGraphApplicationPermissions(data, query, limit ?? DEFAULT_LIMIT),
      ),
  );

  // 2. Search Graph Delegated permissions -----------------------------------
  server.registerTool(
    "search_graph_delegated_permissions",
    {
      title: "Search Graph delegated permissions",
      description:
        "Search Microsoft Graph Delegated permissions (oauth2 scopes) by keyword across the " +
        "scope Value and the admin/user consent display names and descriptions. Optionally " +
        "filter by consent Type (Admin or User).",
      inputSchema: {
        query: z.string().describe('Keyword, e.g. "Mail.Read" or "calendar".'),
        type: z
          .enum(["Admin", "User"])
          .optional()
          .describe("Filter by consent type: Admin (admin consent required) or User."),
        limit: limitSchema,
      },
    },
    async ({ query, type, limit }) =>
      run("search_graph_delegated_permissions", () =>
        tools.searchGraphDelegatedPermissions(data, query, limit ?? DEFAULT_LIMIT, type),
      ),
  );

  // 3. Exact permission lookup ----------------------------------------------
  server.registerTool(
    "get_permission",
    {
      title: "Get permission by scope value or GUID",
      description:
        "Exact lookup of a Graph permission by its scope Value (e.g. 'User.Read.All') or its " +
        "GUID Id. Searches Application and/or Delegated datasets. A scope can exist in both, " +
        "so matches from each dataset are returned. Provide either value or id.",
      inputSchema: {
        value: z.string().optional().describe('Exact scope value, e.g. "User.Read.All".'),
        id: z.string().optional().describe("Exact permission GUID."),
        kind: z
          .enum(["application", "delegated", "any"])
          .optional()
          .describe("Which dataset(s) to search. Default: any."),
      },
    },
    async ({ value, id, kind }) => {
      if (!value && !id) return errorResult("Provide either 'value' or 'id'.");
      return run("get_permission", () => tools.getPermission(data, { value, id, kind }));
    },
  );

  // 4. Search Microsoft first-party apps ------------------------------------
  server.registerTool(
    "search_microsoft_apps",
    {
      title: "Search Microsoft first-party apps",
      description:
        "Search Microsoft first-party applications by display name or AppId. Returns a " +
        "summary (without the full AppRoles array); use get_microsoft_app for an app's roles.",
      inputSchema: {
        query: z.string().describe('App display name or AppId, e.g. "Microsoft Graph".'),
        limit: limitSchema,
      },
    },
    async ({ query, limit }) =>
      run("search_microsoft_apps", () =>
        tools.searchMicrosoftApps(data, query, limit ?? DEFAULT_LIMIT),
      ),
  );

  // 5. Get a single Microsoft app (with roles) ------------------------------
  server.registerTool(
    "get_microsoft_app",
    {
      title: "Get Microsoft app by AppId",
      description:
        "Return the full record for a single Microsoft first-party app, including all of its " +
        "exposed AppRoles, looked up by exact AppId (GUID).",
      inputSchema: {
        appId: z.string().describe("Exact application (client) ID GUID."),
      },
    },
    async ({ appId }) => run("get_microsoft_app", () => tools.getMicrosoftApp(data, appId)),
  );

  // 6. Search app roles across all Microsoft apps ---------------------------
  server.registerTool(
    "search_app_roles",
    {
      title: "Search app roles across Microsoft apps",
      description:
        "Search the app roles exposed by all Microsoft first-party apps by keyword (role " +
        "Value, DisplayName, or Description). Each result includes the owning app's AppId and " +
        "AppDisplayName — useful to find which app exposes a given role.",
      inputSchema: {
        query: z.string().describe('Role keyword, e.g. "EventGrid" or "Policy.Read".'),
        limit: limitSchema,
      },
    },
    async ({ query, limit }) =>
      run("search_app_roles", () => tools.searchAppRoles(data, query, limit ?? DEFAULT_LIMIT)),
  );

  // Resources: raw datasets --------------------------------------------------
  server.registerResource(
    "graph-application-permissions",
    "entra://graph/application-permissions",
    {
      title: "Graph application permissions",
      description: "Full Microsoft Graph Application permissions dataset (app roles).",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "application/json", text: JSON.stringify(data.appPermissions) },
      ],
    }),
  );

  server.registerResource(
    "graph-delegated-permissions",
    "entra://graph/delegated-permissions",
    {
      title: "Graph delegated permissions",
      description: "Full Microsoft Graph Delegated permissions dataset (oauth2 scopes).",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(data.delegatedPermissions),
        },
      ],
    }),
  );

  server.registerResource(
    "microsoft-apps",
    "entra://microsoft-apps",
    {
      title: "Microsoft first-party apps",
      description: "Full Microsoft first-party apps dataset with their exposed app roles.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "application/json", text: JSON.stringify(data.microsoftApps) },
      ],
    }),
  );

  return server;
}
