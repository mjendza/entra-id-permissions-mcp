import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

const V = "1.2.3";

describe("loadConfig", () => {
  it("defaults to the jsDelivr CDN base URL", () => {
    const c = loadConfig(V, {});
    expect(c.dataBaseUrl).toBe(
      "https://cdn.jsdelivr.net/gh/mjendza/entra-id-permissions-mcp@main/data",
    );
  });

  it("threads the version into metadata and the default User-Agent", () => {
    const c = loadConfig(V, {});
    expect(c.version).toBe(V);
    expect(c.userAgent).toContain(`entra-permissions-mcp/${V}`);
  });

  it("disables remote fetching when ENTRA_DATA_LOCAL_ONLY is set", () => {
    expect(loadConfig(V, { ENTRA_DATA_LOCAL_ONLY: "1" }).dataBaseUrl).toBeNull();
  });

  it("treats an empty ENTRA_DATA_BASE_URL as an explicit remote opt-out", () => {
    expect(loadConfig(V, { ENTRA_DATA_BASE_URL: "" }).dataBaseUrl).toBeNull();
  });

  it("strips a trailing slash from the base URL", () => {
    expect(loadConfig(V, { ENTRA_DATA_BASE_URL: "https://example.com/data/" }).dataBaseUrl).toBe(
      "https://example.com/data",
    );
  });

  it("rejects a malformed base URL, naming the variable and value", () => {
    expect(() => loadConfig(V, { ENTRA_DATA_BASE_URL: "not a url" })).toThrow(
      /ENTRA_DATA_BASE_URL.*not a url/,
    );
  });

  it("rejects a non-http(s) base URL", () => {
    expect(() => loadConfig(V, { ENTRA_DATA_BASE_URL: "ftp://example.com/data" })).toThrow(
      /ENTRA_DATA_BASE_URL must be an http\(s\) URL/,
    );
  });

  it("honors a custom local data directory", () => {
    expect(loadConfig(V, { ENTRA_DATA_DIR: "/custom/data" }).dataDir).toBe("/custom/data");
  });

  it("parses numeric overrides", () => {
    const c = loadConfig(V, { ENTRA_REQUEST_TIMEOUT_MS: "5000", PORT: "8080" });
    expect(c.requestTimeoutMs).toBe(5000);
    expect(c.httpPort).toBe(8080);
  });

  it("rejects a non-positive / non-numeric timeout", () => {
    expect(() => loadConfig(V, { ENTRA_REQUEST_TIMEOUT_MS: "0" })).toThrow(
      /ENTRA_REQUEST_TIMEOUT_MS must be a positive integer/,
    );
    expect(() => loadConfig(V, { ENTRA_MAX_RESPONSE_BYTES: "abc" })).toThrow(
      /ENTRA_MAX_RESPONSE_BYTES must be a positive integer/,
    );
  });
});
