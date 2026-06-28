import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Record types (derived from the canonical JSON in the repo's `data/` folder)
// ---------------------------------------------------------------------------

/** A Microsoft Graph *Application* permission (app role). */
export interface GraphAppRole {
  AllowedMemberTypes: string[];
  Description: string;
  DisplayName: string;
  Id: string;
  IsEnabled: boolean;
  Origin: string | null;
  Value: string;
  AdditionalProperties?: Record<string, unknown>;
}

/** A Microsoft Graph *Delegated* permission (oauth2 scope). */
export interface GraphDelegatedRole {
  AdminConsentDescription: string;
  AdminConsentDisplayName: string;
  Id: string;
  IsEnabled: boolean;
  Origin: string | null;
  Type: string; // "Admin" | "User"
  UserConsentDescription: string | null;
  UserConsentDisplayName: string | null;
  Value: string;
  AdditionalProperties?: Record<string, unknown>;
}

/** An app role exposed by a Microsoft first-party app. */
export interface AppRole {
  Id: string;
  DisplayName: string;
  Description: string;
  Value: string;
  IsEnabled: boolean;
  AllowedMemberTypes: string[];
  Origin: string | null;
}

/** A Microsoft first-party application / service principal. */
export interface MicrosoftApp {
  AppId: string;
  AppDisplayName: string;
  AppOwnerOrganizationId: string | null;
  AppRoles: AppRole[];
  Source: string;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

// Public CDN that serves the repo's `data/` folder, refreshed by the scrape
// pipeline. jsDelivr is globally cached (cheap + fast) — the server fetches the
// JSON from here at startup instead of bundling/hosting it.
const DEFAULT_DATA_BASE_URL =
  "https://cdn.jsdelivr.net/gh/mjendza/entra-id-permissions-mcp@main/data";

function resolveBaseUrl(): string | null {
  // ENTRA_DATA_LOCAL_ONLY skips the network entirely (offline / pure-local dev).
  if (process.env.ENTRA_DATA_LOCAL_ONLY) return null;
  const override = process.env.ENTRA_DATA_BASE_URL;
  if (override !== undefined) return override.trim() === "" ? null : override.replace(/\/+$/, "");
  return DEFAULT_DATA_BASE_URL;
}

function resolveDataDir(): string {
  // Local fallback directory. Allow a host to point it elsewhere.
  if (process.env.ENTRA_DATA_DIR) {
    return process.env.ENTRA_DATA_DIR;
  }
  // Default: the repo's canonical `data/` folder, two levels up from this
  // module (mcp-server/dist/data.js or mcp-server/src/data.ts -> repo/data).
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "data");
}

function parseArray<T>(text: string, source: string): T[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${source} to contain a JSON array`);
  }
  return parsed as T[];
}

/**
 * Load one dataset remote-first (from the public CDN) with a local-file
 * fallback if the fetch fails or remote is disabled.
 */
async function fetchJson<T>(baseUrl: string | null, dir: string, file: string): Promise<T[]> {
  if (baseUrl) {
    const url = `${baseUrl}/${file}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = parseArray<T>(await res.text(), url);
      console.error(`[data] loaded ${file} from ${url}`);
      return data;
    } catch (err) {
      console.error(
        `[data] remote fetch of ${file} failed (${(err as Error).message}); falling back to local`,
      );
    }
  }
  const data = parseArray<T>(readFileSync(join(dir, file), "utf-8"), join(dir, file));
  console.error(`[data] loaded ${file} from local ${dir}`);
  return data;
}

export interface DataStore {
  appPermissions: GraphAppRole[];
  delegatedPermissions: GraphDelegatedRole[];
  microsoftApps: MicrosoftApp[];

  // Exact-lookup indexes (keys lowercased).
  appPermsByValue: Map<string, GraphAppRole>;
  appPermsById: Map<string, GraphAppRole>;
  delegatedByValue: Map<string, GraphDelegatedRole>;
  delegatedById: Map<string, GraphDelegatedRole>;
  appsById: Map<string, MicrosoftApp>;
}

let store: DataStore | null = null;
let loading: Promise<DataStore> | null = null;

/** Load and index all datasets once; subsequent calls return the cache. */
export async function loadData(): Promise<DataStore> {
  if (store) return store;
  if (loading) return loading;
  loading = doLoad().then((s) => {
    store = s;
    loading = null;
    return s;
  });
  return loading;
}

async function doLoad(): Promise<DataStore> {
  const baseUrl = resolveBaseUrl();
  const dir = resolveDataDir();
  const [appPermissions, delegatedPermissions, microsoftApps] = await Promise.all([
    fetchJson<GraphAppRole>(baseUrl, dir, "GraphAppRoles.json"),
    fetchJson<GraphDelegatedRole>(baseUrl, dir, "GraphDelegateRoles.json"),
    fetchJson<MicrosoftApp>(baseUrl, dir, "MicrosoftApps.json"),
  ]);

  // Many app records omit AppRoles entirely; normalize so consumers can always iterate.
  for (const a of microsoftApps) {
    if (!Array.isArray(a.AppRoles)) a.AppRoles = [];
  }

  const appPermsByValue = new Map<string, GraphAppRole>();
  const appPermsById = new Map<string, GraphAppRole>();
  for (const p of appPermissions) {
    appPermsByValue.set(p.Value.toLowerCase(), p);
    appPermsById.set(p.Id.toLowerCase(), p);
  }

  const delegatedByValue = new Map<string, GraphDelegatedRole>();
  const delegatedById = new Map<string, GraphDelegatedRole>();
  for (const p of delegatedPermissions) {
    delegatedByValue.set(p.Value.toLowerCase(), p);
    delegatedById.set(p.Id.toLowerCase(), p);
  }

  const appsById = new Map<string, MicrosoftApp>();
  for (const a of microsoftApps) {
    appsById.set(a.AppId.toLowerCase(), a);
  }

  return {
    appPermissions,
    delegatedPermissions,
    microsoftApps,
    appPermsByValue,
    appPermsById,
    delegatedByValue,
    delegatedById,
    appsById,
  };
}
