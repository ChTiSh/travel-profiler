import { describe, expect, it } from "vitest";
import {
  CORE_FIELDS,
  DestinationInfoSchema,
  EMPTY_PROFILE,
  PROFILE_FIELDS,
  ProfileConflictSchema,
  ProfileStateSchema,
  ResolveConflictRequestSchema,
  SINGLE_VALUE_FIELDS,
  TravelProfileSchema,
  UpdateProfileInputSchema,
  isSingleValueField,
} from "./index";

const NOW = "2026-11-08T12:00:00.000Z";

describe("DestinationInfoSchema", () => {
  const kyoto = {
    name: "Kyoto",
    bestSeasons: ["spring", "fall"],
    knownFor: ["temples", "food"],
    averageDailyBudgetUSD: { budget: 80, midRange: 200, luxury: 600 },
    visaNotes: "Visa-free for many nationalities for short stays.",
  };

  it("accepts the spec shape, with visaNotes optional", () => {
    expect(DestinationInfoSchema.safeParse(kyoto).success).toBe(true);
    expect(DestinationInfoSchema.safeParse({ ...kyoto, visaNotes: undefined }).success).toBe(true);
  });

  it("rejects unknown seasons and missing required fields", () => {
    expect(DestinationInfoSchema.safeParse({ ...kyoto, bestSeasons: ["monsoon"] }).success).toBe(false);
    expect(DestinationInfoSchema.safeParse({ ...kyoto, knownFor: undefined }).success).toBe(false);
  });

  it("rejects budget tiers out of order (catches data typos)", () => {
    const bad = { ...kyoto, averageDailyBudgetUSD: { budget: 300, midRange: 200, luxury: 600 } };
    expect(DestinationInfoSchema.safeParse(bad).success).toBe(false);
  });
});

describe("TravelProfileSchema", () => {
  it("starts empty: single-value fields unset, lists empty", () => {
    expect(EMPTY_PROFILE.budgetTier).toBeUndefined();
    expect(EMPTY_PROFILE.dietary).toEqual([]);
  });

  it("rejects values outside a field's enum", () => {
    expect(TravelProfileSchema.safeParse({ budgetTier: "cheap" }).success).toBe(false);
    expect(TravelProfileSchema.safeParse({ companions: ["coworkers"] }).success).toBe(false);
  });

  it("trims text and rejects empty strings", () => {
    expect(TravelProfileSchema.parse({ interests: ["  hiking "] }).interests).toEqual(["hiking"]);
    expect(TravelProfileSchema.safeParse({ interests: ["   "] }).success).toBe(false);
  });
});

describe("field metadata stays in sync with the schema", () => {
  it("single-value fields are exactly the non-array fields", () => {
    const shape = TravelProfileSchema.parse({});
    for (const field of PROFILE_FIELDS) {
      expect(isSingleValueField(field), field).toBe(!Array.isArray(shape[field]));
    }
    expect(SINGLE_VALUE_FIELDS.every((f) => PROFILE_FIELDS.includes(f))).toBe(true);
  });

  it("core fields are real profile fields", () => {
    expect(CORE_FIELDS.every((f) => PROFILE_FIELDS.includes(f))).toBe(true);
  });
});

describe("ProfileConflictSchema", () => {
  const base = {
    id: "c1",
    field: "dietary",
    currentValue: ["vegetarian"],
    evidence: "Can you recommend a steakhouse in Lisbon?",
    status: "pending",
    createdAt: NOW,
  };

  it("a change carries the proposed value", () => {
    expect(ProfileConflictSchema.safeParse({ ...base, kind: "change", proposedValue: [] }).success).toBe(true);
    expect(ProfileConflictSchema.safeParse({ ...base, kind: "change" }).success).toBe(false);
  });

  it("a contradiction carries an observation instead", () => {
    const ok = { ...base, kind: "contradiction", observation: "Asked for a steakhouse" };
    expect(ProfileConflictSchema.safeParse(ok).success).toBe(true);
    expect(ProfileConflictSchema.safeParse({ ...base, kind: "contradiction" }).success).toBe(false);
  });

  it("rejects unknown statuses", () => {
    const bad = { ...base, kind: "change", proposedValue: [], status: "overwritten" };
    expect(ProfileConflictSchema.safeParse(bad).success).toBe(false);
  });
});

describe("ProfileStateSchema (persisted data)", () => {
  it("fills defaults for a minimal file", () => {
    const state = ProfileStateSchema.parse({ version: 1, profile: {} });
    expect(state.conflicts).toEqual([]);
    expect(state.provenance).toEqual({});
  });

  it("rejects an unknown version instead of guessing", () => {
    expect(ProfileStateSchema.safeParse({ version: 2, profile: {} }).success).toBe(false);
  });
});

describe("UpdateProfileInputSchema (LLM tool input)", () => {
  it("accepts several updates in one call", () => {
    const input = {
      updates: [
        { field: "dietary", op: "add", value: ["vegetarian"], evidence: "I'm vegetarian" },
        { field: "budgetTier", op: "set", value: "midRange", evidence: "mid-range budget" },
      ],
    };
    expect(UpdateProfileInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects unknown fields and missing evidence", () => {
    const unknownField = { updates: [{ field: "favoriteColor", op: "set", value: "blue", evidence: "blue" }] };
    expect(UpdateProfileInputSchema.safeParse(unknownField).success).toBe(false);
    const noEvidence = { updates: [{ field: "dietary", op: "add", value: ["vegan"] }] };
    expect(UpdateProfileInputSchema.safeParse(noEvidence).success).toBe(false);
  });
});

describe("ResolveConflictRequestSchema", () => {
  it("clarify requires a note; approve and keep do not", () => {
    expect(ResolveConflictRequestSchema.safeParse({ action: "approve" }).success).toBe(true);
    expect(ResolveConflictRequestSchema.safeParse({ action: "keep" }).success).toBe(true);
    expect(ResolveConflictRequestSchema.safeParse({ action: "clarify" }).success).toBe(false);
    expect(ResolveConflictRequestSchema.safeParse({ action: "clarify", note: "only at home" }).success).toBe(true);
  });

  it("rejects actions outside the three", () => {
    expect(ResolveConflictRequestSchema.safeParse({ action: "replace" }).success).toBe(false);
  });
});
