import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";
import { loadData } from "./data.js";

describe("loadData", () => {
  it("falls back to local files when the remote fetch fails", async () => {
    const logs: string[] = [];
    const logger = { log: (m: string) => logs.push(m) };

    // Point at a refused port so the fetch fails fast, then expect the local
    // datasets in the repo's data/ folder to be used instead.
    const config = loadConfig("0.0.0-test", {
      ENTRA_DATA_BASE_URL: "http://127.0.0.1:1/data",
      ENTRA_REQUEST_TIMEOUT_MS: "1500",
    });

    const data = await loadData(config, logger);

    expect(data.appPermissions.length).toBeGreaterThan(0);
    expect(data.delegatedPermissions.length).toBeGreaterThan(0);
    expect(data.microsoftApps.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.includes("falling back to local"))).toBe(true);
  });
});
