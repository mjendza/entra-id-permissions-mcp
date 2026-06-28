import type { DataStore } from "./data.js";
import { searchRecords } from "./search.js";

/**
 * Pure query functions backing the MCP tools. They take the loaded DataStore
 * plus validated arguments and return plain JSON-able objects — server.ts wraps
 * them in the MCP result shape. Keeping them pure makes every tool unit-testable
 * without standing up a transport.
 */

export type PermissionKind = "application" | "delegated" | "any";

export function searchGraphApplicationPermissions(data: DataStore, query: string, limit: number) {
  const res = searchRecords(
    data.appPermissions,
    query,
    (p) => [p.Value, p.DisplayName, p.Description],
    limit,
  );
  return {
    totalMatches: res.totalMatches,
    returned: res.returned,
    truncated: res.truncated,
    results: res.results.map((p) => ({
      Value: p.Value,
      Id: p.Id,
      DisplayName: p.DisplayName,
      Description: p.Description,
      AllowedMemberTypes: p.AllowedMemberTypes,
    })),
  };
}

export function searchGraphDelegatedPermissions(
  data: DataStore,
  query: string,
  limit: number,
  type?: "Admin" | "User",
) {
  const pool = type
    ? data.delegatedPermissions.filter((p) => p.Type === type)
    : data.delegatedPermissions;
  const res = searchRecords(
    pool,
    query,
    (p) => [
      p.Value,
      p.AdminConsentDisplayName,
      p.AdminConsentDescription,
      p.UserConsentDisplayName,
      p.UserConsentDescription,
    ],
    limit,
  );
  return {
    totalMatches: res.totalMatches,
    returned: res.returned,
    truncated: res.truncated,
    results: res.results.map((p) => ({
      Value: p.Value,
      Id: p.Id,
      Type: p.Type,
      AdminConsentDisplayName: p.AdminConsentDisplayName,
      AdminConsentDescription: p.AdminConsentDescription,
      UserConsentDisplayName: p.UserConsentDisplayName,
      UserConsentDescription: p.UserConsentDescription,
    })),
  };
}

export function getPermission(
  data: DataStore,
  args: { value?: string; id?: string; kind?: PermissionKind },
) {
  const which = args.kind ?? "any";
  const key = (args.value ?? args.id ?? "").toLowerCase();

  const application =
    which !== "delegated"
      ? (args.value ? data.appPermsByValue.get(key) : data.appPermsById.get(key)) ?? null
      : null;
  const delegated =
    which !== "application"
      ? (args.value ? data.delegatedByValue.get(key) : data.delegatedById.get(key)) ?? null
      : null;

  return { found: Boolean(application || delegated), application, delegated };
}

export function searchMicrosoftApps(data: DataStore, query: string, limit: number) {
  const res = searchRecords(data.microsoftApps, query, (a) => [a.AppDisplayName, a.AppId], limit);
  return {
    totalMatches: res.totalMatches,
    returned: res.returned,
    truncated: res.truncated,
    results: res.results.map((a) => ({
      AppId: a.AppId,
      AppDisplayName: a.AppDisplayName,
      Source: a.Source,
      appRoleCount: a.AppRoles.length,
    })),
  };
}

export function getMicrosoftApp(data: DataStore, appId: string) {
  const app = data.appsById.get(appId.toLowerCase()) ?? null;
  return { found: Boolean(app), app };
}

export function searchAppRoles(data: DataStore, query: string, limit: number) {
  const q = query.trim().toLowerCase();
  const matches: Array<{
    AppId: string;
    AppDisplayName: string;
    Role: { Id: string; Value: string; DisplayName: string; Description: string };
  }> = [];
  let total = 0;

  for (const app of data.microsoftApps) {
    for (const role of app.AppRoles) {
      const hit =
        q === "" ||
        role.Value?.toLowerCase().includes(q) ||
        role.DisplayName?.toLowerCase().includes(q) ||
        role.Description?.toLowerCase().includes(q);
      if (!hit) continue;
      total++;
      if (matches.length < limit) {
        matches.push({
          AppId: app.AppId,
          AppDisplayName: app.AppDisplayName,
          Role: {
            Id: role.Id,
            Value: role.Value,
            DisplayName: role.DisplayName,
            Description: role.Description,
          },
        });
      }
    }
  }

  return {
    totalMatches: total,
    returned: matches.length,
    truncated: total > matches.length,
    results: matches,
  };
}
