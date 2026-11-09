import { describe, expect, it } from "vitest";
import type { ProfileUpdateItem } from "@/lib/contracts";
import { parseUpdateItem } from "./proposal";

const item = (over: Partial<ProfileUpdateItem>): ProfileUpdateItem => ({
  field: "dietary",
  op: "add",
  value: ["vegetarian"],
  evidence: "I'm vegetarian",
  ...over,
});

describe("parseUpdateItem", () => {
  it("passes a valid list update through", () => {
    expect(parseUpdateItem(item({}))).toEqual({
      ok: true,
      proposal: { field: "dietary", op: "add", items: ["vegetarian"], evidence: "I'm vegetarian" },
    });
  });

  it("wraps a single string for a list field", () => {
    const r = parseUpdateItem(item({ value: "vegetarian" }));
    expect(r.ok && r.proposal).toMatchObject({ items: ["vegetarian"] });
  });

  it("passes a valid single-value update through", () => {
    const r = parseUpdateItem(item({ field: "budgetTier", op: "set", value: "luxury" }));
    expect(r.ok && r.proposal).toMatchObject({ field: "budgetTier", op: "set", value: "luxury" });
  });

  it("rejects enum values outside the schema, naming the allowed options", () => {
    const r = parseUpdateItem(item({ field: "budgetTier", op: "set", value: "cheap" }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/midRange/);
  });

  it("rejects add/remove on a single-value field", () => {
    const r = parseUpdateItem(item({ field: "dailyPace", op: "add", value: "relaxed" }));
    expect(r).toMatchObject({ ok: false, field: "dailyPace" });
  });

  it("tolerates common model quirks: one-item arrays and '$150' strings for numbers", () => {
    expect(parseUpdateItem(item({ field: "dailyPace", op: "set", value: ["relaxed"] }))).toMatchObject({
      ok: true,
      proposal: { value: "relaxed" },
    });
    expect(parseUpdateItem(item({ field: "dailyBudgetUSD", op: "set", value: "$1,500" }))).toMatchObject({
      ok: true,
      proposal: { value: 1500 },
    });
  });

  it("rejects non-numeric budgets and multi-item arrays for single-value fields", () => {
    expect(parseUpdateItem(item({ field: "dailyBudgetUSD", op: "set", value: "a lot" })).ok).toBe(false);
    expect(parseUpdateItem(item({ field: "dailyPace", op: "set", value: ["relaxed", "packed"] })).ok).toBe(false);
  });

  it("normalizes airport codes to upper case", () => {
    const r = parseUpdateItem(item({ field: "homeAirport", op: "set", value: "sea" }));
    expect(r.ok && r.proposal).toMatchObject({ value: "SEA" });
  });
});
