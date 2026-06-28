import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Public CDN (jsDelivr) that serves the repo's `data/` folder, refreshed by the
 *  scrape pipeline. Globally cached, so it is the primary source for published
 *  installs; local files are only a dev-time fallback. */
const DEFAULT_DATA_BASE_URL =
  "https://cdn.jsdelivr.net/gh/mjendza/entra-id-permissions-mcp@main/data";

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
// Largest dataset is ~1.4 MB; 16 MB leaves generous headroom while still
// guarding against a runaway / wrong-URL response.
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const DEFAULT_HTTP_PORT = 3000;

export interface Config {
  version: string;
  userAgent: string;
  /** Remote base URL, or null when remote fetching is disabled (local-only). */
  dataBaseUrl: string | null;
  /** Local fallback directory for the dataset files. */
  dataDir: string;
  /** Path the file logger appends to. */
  logFile: string;
  requestTimeoutMs: number;
  maxResponseBytes: number;
  httpPort: number;
}

type Env = Record<string, string | undefined>;

function defaultDataDir(): string {
  // Both src/config.ts and dist/config.js live one level under the package root,
  // whose `data/` folder holds the canonical files for local dev.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "data");
}

function parseBaseUrl(env: Env): string | null {
  // Local-only mode skips the network entirely.
  if (env.ENTRA_DATA_LOCAL_ONLY) return null;

  const raw = env.ENTRA_DATA_BASE_URL;
  if (raw === undefined) return DEFAULT_DATA_BASE_URL;
  if (raw.trim() === "") return null; // explicit opt-out of remote fetching

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`ENTRA_DATA_BASE_URL is not a valid URL: "${raw}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`ENTRA_DATA_BASE_URL must be an http(s) URL, got "${raw}"`);
  }
  return raw.replace(/\/+$/, "");
}

function parsePositiveInt(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return n;
}

/**
 * Build the runtime configuration from environment variables. `env` is injected
 * (defaulting to process.env) so tests can exercise parsing without touching the
 * real environment. Validation fails loudly, naming the offending variable.
 */
export function loadConfig(version: string, env: Env = process.env): Config {
  return {
    version,
    userAgent:
      env.ENTRA_USER_AGENT?.trim() ||
      `entra-permissions-mcp/${version} (+https://github.com/mjendza/entra-id-permissions-mcp)`,
    dataBaseUrl: parseBaseUrl(env),
    dataDir: env.ENTRA_DATA_DIR?.trim() || defaultDataDir(),
    logFile: env.ENTRA_LOG_FILE?.trim() || join(tmpdir(), "entra-permissions-mcp.log"),
    requestTimeoutMs: parsePositiveInt(env, "ENTRA_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS),
    maxResponseBytes: parsePositiveInt(env, "ENTRA_MAX_RESPONSE_BYTES", DEFAULT_MAX_RESPONSE_BYTES),
    httpPort: parsePositiveInt(env, "PORT", DEFAULT_HTTP_PORT),
  };
}
