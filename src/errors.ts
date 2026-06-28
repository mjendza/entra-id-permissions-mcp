/**
 * Error raised when a dataset cannot be retrieved from the remote CDN. Carries
 * structured fields (the URL and, when available, the HTTP status) so callers
 * can surface them in messages instead of a bare string.
 */
export class DataFetchError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DataFetchError";
  }
}

/** Render any thrown value into a single human-readable line for tool/error output. */
export function formatError(err: unknown): string {
  if (err instanceof DataFetchError) {
    const status = err.status !== undefined ? ` (HTTP ${err.status})` : "";
    return `${err.message}${status} [${err.url}]`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
