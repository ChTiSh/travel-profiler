import { describe, expect, it } from "vitest";
import { ProfileStateSchema, type ProfileState, type ProfileUpdateProposal } from "@/lib/contracts";
import { flagContradiction, mergeProposal, resolveConflict, type MergeContext } from "./merge";

const NOW = "2026-11-08T12:00:00.000Z";

function ctx(): MergeContext {
  let n = 0;
  return { now: () => NOW, newId: () => `c${++n}` };
}

function stateWith(profile: Record<string, unknown> = {}): ProfileState {
  return ProfileStateSchema.parse({ version: 1, profile });
}

const vegetarian = stateWith({ dietary: ["vegetarian"], budgetTier: "midRange" });

describe("mergeProposal: single-value fields", () => {
  const set = (value: string): ProfileUpdateProposal => ({
    field: "budgetTier",
    op: "set",
    value,
    evidence: `my budget is ${value}`,
  });

  it("fills an empty field and records provenance", () => {
    const { state, result } = mergeProposal(stateWith(), set("luxury"), ctx());
    expect(result.status).toBe("applied");
    expect(state.profile.budgetTier).toBe("luxury");
    expect(state.provenance.budgetTier).toEqual({ evidence: "my budget is luxury", updatedAt: NOW });
  });

  it("leaves an equal value unchanged", () => {
    const { state, result } = mergeProposal(vegetarian, set("midRange"), ctx());
    expect(result.status).toBe("unchanged");
    expect(state).toEqual(vegetarian);
  });

  it("never overwrites a different value: it opens a pending `change` conflict", () => {
    const { state, result } = mergeProposal(vegetarian, set("luxury"), ctx());
    expect(result.status).toBe("conflict");
    expect(state.profile.budgetTier).toBe("midRange");
    expect(state.conflicts).toHaveLength(1);
    expect(state.conflicts[0]).toMatchObject({
      kind: "change",
      field: "budgetTier",
      currentValue: "midRange",
      proposedValue: "luxury",
      status: "pending",
    });
  });
});

describe("mergeProposal: list fields", () => {
  const dietary = (op: "add" | "remove" | "set", items: string[]): ProfileUpdateProposal => ({
    field: "dietary",
    op,
    items,
    evidence: items.join(", "),
  });

  it("appends new items without a conflict", () => {
    const { state, result } = mergeProposal(vegetarian, dietary("add", ["nut allergy"]), ctx());
    expect(result.status).toBe("applied");
    expect(state.profile.dietary).toEqual(["vegetarian", "nut allergy"]);
  });

  it("treats duplicates (case-insensitive) as unchanged", () => {
    const { result } = mergeProposal(vegetarian, dietary("add", ["Vegetarian"]), ctx());
    expect(result.status).toBe("unchanged");
  });

  it("explicit correction: removing a stored item is pending, not applied", () => {
    // "Actually I'm not vegetarian anymore"
    const { state, result } = mergeProposal(vegetarian, dietary("remove", ["vegetarian"]), ctx());
    expect(result.status).toBe("conflict");
    expect(state.profile.dietary).toEqual(["vegetarian"]);
    expect(state.conflicts[0]).toMatchObject({ currentValue: ["vegetarian"], proposedValue: [] });
  });

  it("refinement: replacing vegetarian with vegan is pending, not applied", () => {
    const { state, result } = mergeProposal(vegetarian, dietary("set", ["vegan"]), ctx());
    expect(result.status).toBe("conflict");
    expect(state.profile.dietary).toEqual(["vegetarian"]);
    expect(state.conflicts[0]).toMatchObject({ currentValue: ["vegetarian"], proposedValue: ["vegan"] });
  });

  it("a `set` that only adds items removes nothing, so it applies like `add`", () => {
    const { state, result } = mergeProposal(vegetarian, dietary("set", ["vegetarian", "nut allergy"]), ctx());
    expect(result.status).toBe("applied");
    expect(state.profile.dietary).toEqual(["vegetarian", "nut allergy"]);
  });

  it("`set` on an empty list applies; `set` to the same items is unchanged", () => {
    expect(mergeProposal(stateWith(), dietary("set", ["vegan"]), ctx()).result.status).toBe("applied");
    expect(mergeProposal(vegetarian, dietary("set", ["VEGETARIAN"]), ctx()).result.status).toBe("unchanged");
  });

  it("splurging on fine dining does not conflict with a mid-range budget tier", () => {
    const splurge: ProfileUpdateProposal = {
      field: "splurgePriorities",
      op: "add",
      items: ["fine dining"],
      evidence: "I'll splurge on a great dinner",
    };
    const { state, result } = mergeProposal(vegetarian, splurge, ctx());
    expect(result.status).toBe("applied");
    expect(state.conflicts).toEqual([]);
  });
});

describe("one pending conflict per field", () => {
  it("a newer conflict on the same field supersedes the older one", () => {
    const c = ctx();
    const first = mergeProposal(
      vegetarian,
      { field: "budgetTier", op: "set", value: "luxury", evidence: "luxury" },
      c,
    ).state;
    const { state } = mergeProposal(first, { field: "budgetTier", op: "set", value: "budget", evidence: "budget" }, c);
    expect(state.conflicts.map((x) => [x.id, x.status])).toEqual([
      ["c1", "superseded"],
      ["c2", "pending"],
    ]);
  });
});

describe("flagContradiction", () => {
  const steakhouse = {
    field: "dietary" as const,
    observation: "Asked for a steakhouse recommendation",
    evidence: "Can you recommend a steakhouse in Lisbon?",
  };

  it("opens a `contradiction` conflict without touching the profile", () => {
    const { state, result } = flagContradiction(vegetarian, steakhouse, ctx());
    expect(result.status).toBe("conflict");
    expect(state.profile).toEqual(vegetarian.profile);
    expect(state.conflicts[0]).toMatchObject({ kind: "contradiction", currentValue: ["vegetarian"] });
  });

  it("is rejected when the field has nothing stored to contradict", () => {
    const { state, result } = flagContradiction(stateWith(), steakhouse, ctx());
    expect(result.status).toBe("rejected");
    expect(state.conflicts).toEqual([]);
  });
});

describe("resolveConflict", () => {
  const pendingRemoval = () =>
    mergeProposal(
      vegetarian,
      { field: "dietary", op: "remove", items: ["vegetarian"], evidence: "I eat meat now" },
      ctx(),
    ).state;

  it("approve applies the proposed value and records the original evidence", () => {
    const { state, outcome } = resolveConflict(pendingRemoval(), "c1", { action: "approve" }, ctx());
    expect(outcome.status).toBe("resolved");
    expect(state.profile.dietary).toEqual([]);
    expect(state.provenance.dietary?.evidence).toBe("I eat meat now");
    expect(state.conflicts[0]).toMatchObject({ status: "approved", resolvedAt: NOW });
  });

  it("keep leaves the profile unchanged", () => {
    const { state } = resolveConflict(pendingRemoval(), "c1", { action: "keep" }, ctx());
    expect(state.profile.dietary).toEqual(["vegetarian"]);
    expect(state.conflicts[0]?.status).toBe("kept");
  });

  it("clarify records the note and stays pending", () => {
    const { state } = resolveConflict(pendingRemoval(), "c1", { action: "clarify", note: "only when traveling" }, ctx());
    expect(state.conflicts[0]?.status).toBe("pending");
    expect(state.conflicts[0]?.clarifications).toEqual([{ note: "only when traveling", at: NOW }]);
  });

  it("a contradiction cannot be approved directly: there is no value to apply", () => {
    const flagged = flagContradiction(
      vegetarian,
      { field: "dietary", observation: "steakhouse", evidence: "steakhouse" },
      ctx(),
    ).state;
    const { state, outcome } = resolveConflict(flagged, "c1", { action: "approve" }, ctx());
    expect(outcome).toMatchObject({ status: "rejected", code: "bad_request" });
    expect(state).toEqual(flagged);
  });

  it("rejects unknown and already-resolved conflicts", () => {
    expect(resolveConflict(pendingRemoval(), "nope", { action: "keep" }, ctx()).outcome).toMatchObject({
      status: "rejected",
      code: "not_found",
    });
    const kept = resolveConflict(pendingRemoval(), "c1", { action: "keep" }, ctx()).state;
    expect(resolveConflict(kept, "c1", { action: "approve" }, ctx()).outcome).toMatchObject({
      status: "rejected",
      code: "conflict_not_pending",
    });
  });

  it("approving a stale conflict (field changed since) supersedes it instead of overwriting", () => {
    const c = ctx();
    const pending = mergeProposal(
      vegetarian,
      { field: "dietary", op: "remove", items: ["vegetarian"], evidence: "I eat meat now" },
      c,
    ).state;
    const changed = mergeProposal(
      pending,
      { field: "dietary", op: "add", items: ["nut allergy"], evidence: "nut allergy" },
      c,
    ).state;
    const { state, outcome } = resolveConflict(changed, "c1", { action: "approve" }, c);
    expect(outcome).toMatchObject({ status: "rejected", code: "conflict_not_pending" });
    expect(state.profile.dietary).toEqual(["vegetarian", "nut allergy"]);
    expect(state.conflicts[0]?.status).toBe("superseded");
  });
});
