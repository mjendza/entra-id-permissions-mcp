import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
import { DataFetchError } from "./errors.js";

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

function parseArray<T>(text: string, source: string): T[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${source} to contain a JSON array`);
  }
  return parsed as T[];
}

/** Read a fetch body with a hard byte cap, guarding both the Content-Length
 *  header and the streamed bytes so an over-sized response can't exhaust memory. */
async function readBodyCapped(res: Response, maxBytes: number, url: string): Promise<string> {
  const declared = res.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) {
    throw new DataFetchError(
      `Response too large: Content-Length ${declared} exceeds cap ${maxBytes}`,
      url,
      res.status,
    );
  }
  if (!res.body) return res.text();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new DataFetchError(`Response exceeded ${maxBytes} bytes`, url, res.status);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

/** Fetch one dataset from the remote CDN with a timeout and size cap. */
async function fetchRemote<T>(config: Config, file: string): Promise<T[]> {
  const url = `${config.dataBaseUrl}/${file}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": config.userAgent, Accept: "application/json" },
    });
    if (!res.ok) throw new DataFetchError(`HTTP ${res.status} fetching ${file}`, url, res.status);
    return parseArray<T>(await readBodyCapped(res, config.maxResponseBytes, url), url);
  } catch (err) {
    if (err instanceof DataFetchError) throw err;
    const reason = controller.signal.aborted ? `timed out after ${config.requestTimeoutMs}ms` : (err as Error).message;
    throw new DataFetchError(`Fetch of ${file} failed: ${reason}`, url);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load one dataset remote-first (from the public CDN) with a local-file
 * fallback if the fetch fails or remote is disabled.
 */
async function loadDataset<T>(config: Config, logger: Logger, file: string): Promise<T[]> {
  if (config.dataBaseUrl) {
    try {
      const data = await fetchRemote<T>(config, file);
      logger.log(`loaded ${file} from ${config.dataBaseUrl}/${file}`);
      return data;
    } catch (err) {
      logger.log(`remote fetch of ${file} failed; falling back to local`, {
        error: (err as Error).message,
      });
    }
  }
  const path = join(config.dataDir, file);
  const data = parseArray<T>(readFileSync(path, "utf-8"), path);
  logger.log(`loaded ${file} from local ${path}`);
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
export async function loadData(config: Config, logger: Logger): Promise<DataStore> {
  if (store) return store;
  if (loading) return loading;
  loading = doLoad(config, logger).then((s) => {
    store = s;
    loading = null;
    return s;
  });
  return loading;
}

async function doLoad(config: Config, logger: Logger): Promise<DataStore> {
  const [appPermissions, delegatedPermissions, microsoftApps] = await Promise.all([
    loadDataset<GraphAppRole>(config, logger, "GraphAppRoles.json"),
    loadDataset<GraphDelegatedRole>(config, logger, "GraphDelegateRoles.json"),
    loadDataset<MicrosoftApp>(config, logger, "MicrosoftApps.json"),
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
