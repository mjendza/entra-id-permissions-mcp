import { appendFileSync } from "node:fs";

/**
 * Minimal append-only file logger. stdout is reserved for the JSON-RPC stream,
 * so every diagnostic goes to a file instead. A logging failure must never take
 * the server down, so all writes are best-effort and swallow their errors.
 */
export interface Logger {
  log(message: string, meta?: unknown): void;
}

function formatMeta(meta: unknown): string {
  if (meta === undefined) return "";
  try {
    return " " + JSON.stringify(meta);
  } catch {
    return " " + String(meta);
  }
}

export function createLogger(filePath: string): Logger {
  return {
    log(message, meta) {
      try {
        appendFileSync(filePath, `${new Date().toISOString()} ${message}${formatMeta(meta)}\n`);
      } catch {
        // Best-effort: never crash the process because we couldn't write a log line.
      }
    },
  };
}
