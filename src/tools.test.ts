import { describe, it, expect, beforeAll } from "vitest";
import { loadConfig } from "./config.js";
import { loadData, type DataStore } from "./data.js";
import * as tools from "./tools.js";

const noopLogger = { log() {} };

// Drive the tools against the repo's local datasets (no network).
let data: DataStore;
beforeAll(async () => {
  data = await loadData(loadConfig("0.0.0-test", { ENTRA_DATA_LOCAL_ONLY: "1" }), noopLogger);
});

describe("searchGraphApplicationPermissions", () => {
  it("finds matches and shapes the summary fields", () => {
    const r = tools.searchGraphApplicationPermissions(data, "AccessReview", 25);
    expect(r.totalMatches).toBeGreaterThan(0);
    expect(r.results[0]).toHaveProperty("Value");
    expect(r.results[0]).toHaveProperty("AllowedMemberTypes");
  });

  it("respects the limit and reports truncation", () => {
    const r = tools.searchGraphApplicationPermissions(data, "Read", 3);
    expect(r.returned).toBe(3);
    expect(r.truncated).toBe(true);
  });
});

describe("searchGraphDelegatedPermissions", () => {
  it("filters by consent type", () => {
    const all = tools.searchGraphDelegatedPermissions(data, "access", 200);
    const admin = tools.searchGraphDelegatedPermissions(data, "access", 200, "Admin");
    expect(admin.results.every((p) => p.Type === "Admin")).toBe(true);
    expect(admin.totalMatches).toBeLessThanOrEqual(all.totalMatches);
  });
});

describe("getPermission", () => {
  it("finds an application permission by exact value", () => {
    const r = tools.getPermission(data, { value: "AccessReview.Read.All", kind: "any" });
    expect(r.found).toBe(true);
    expect(r.application).not.toBeNull();
  });

  it("is case-insensitive on the value", () => {
    expect(tools.getPermission(data, { value: "accessreview.read.all" }).found).toBe(true);
  });

  it("returns not-found for an unknown scope", () => {
    expect(tools.getPermission(data, { value: "Nope.Does.Not.Exist" }).found).toBe(false);
  });

  it("restricts the dataset with kind", () => {
    const r = tools.getPermission(data, { value: "AccessReview.Read.All", kind: "delegated" });
    expect(r.application).toBeNull();
  });
});

describe("searchMicrosoftApps / getMicrosoftApp", () => {
  it("returns app summaries with a role count", () => {
    const r = tools.searchMicrosoftApps(data, "Azure", 10);
    expect(r.totalMatches).toBeGreaterThan(0);
    expect(r.results[0]).toHaveProperty("appRoleCount");
    expect(r.results[0]).not.toHaveProperty("AppRoles");
  });

  it("fetches a full app record by AppId and returns not-found otherwise", () => {
    const known = tools.searchMicrosoftApps(data, "Azure", 1).results[0].AppId;
    expect(tools.getMicrosoftApp(data, known).found).toBe(true);
    expect(tools.getMicrosoftApp(data, "ffffffff-ffff-ffff-ffff-ffffffffffff").found).toBe(false);
  });
});

describe("searchAppRoles", () => {
  it("caps results and flags truncation on a broad query", () => {
    const r = tools.searchAppRoles(data, "", 5);
    expect(r.returned).toBe(5);
    expect(r.truncated).toBe(true);
    expect(r.results[0]).toHaveProperty("AppId");
    expect(r.results[0].Role).toHaveProperty("Value");
  });
});
