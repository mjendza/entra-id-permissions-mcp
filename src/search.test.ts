import { describe, it, expect } from "vitest";
import { searchRecords } from "./search.js";

const items = [
  { name: "Mail.Read", desc: "Read mail" },
  { name: "Mail.Send", desc: "Send mail" },
  { name: "User.Read", desc: "Read the user" },
  { name: "Empty", desc: null },
];

const fields = (i: (typeof items)[number]) => [i.name, i.desc];

describe("searchRecords", () => {
  it("matches case-insensitively across fields", () => {
    const r = searchRecords(items, "mail", fields, 25);
    expect(r.totalMatches).toBe(3); // two names + "Read mail" / "Send mail" descriptions
    expect(r.truncated).toBe(false);
  });

  it("tolerates null/undefined field values", () => {
    expect(() => searchRecords(items, "empty", fields, 25)).not.toThrow();
    expect(searchRecords(items, "empty", fields, 25).totalMatches).toBe(1);
  });

  it("returns everything for an empty query", () => {
    const r = searchRecords(items, "   ", fields, 25);
    expect(r.totalMatches).toBe(items.length);
  });

  it("caps results at the limit and flags truncation", () => {
    const r = searchRecords(items, "", fields, 2);
    expect(r.returned).toBe(2);
    expect(r.results).toHaveLength(2);
    expect(r.truncated).toBe(true);
    expect(r.totalMatches).toBe(items.length);
  });
});
