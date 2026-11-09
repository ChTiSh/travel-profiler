import { describe, expect, it } from "vitest";
import { ProfileStateSchema } from "@/lib/contracts";
import type { MergeContext } from "./merge";
import { createProfileService } from "./service";
import { createMemoryStore } from "./store";

const NOW = "2026-11-08T12:00:00.000Z";
function setup(profile: Record<string, unknown> = {}) {
  let n = 0;
  const ctx: MergeContext = { now: () => NOW, newId: () => `c${++n}` };
  const store = createMemoryStore(ProfileStateSchema.parse({ version: 1, profile }));
  return createProfileService(store, ctx);
}

describe("profile service", () => {
  it("applies a batch item by item and reports each outcome", async () => {
    const service = setup({ budgetTier: "midRange" });
    const { results, view, changes } = await service.applyUpdates([
      { field: "dietary", op: "add", value: ["vegetarian"], evidence: "I'm vegetarian" },
      { field: "budgetTier", op: "set", value: "luxury", evidence: "luxury please" },
      { field: "dailyPace", op: "set", value: "slow", evidence: "slow pace" },
      { field: "budgetTier", op: "set", value: "midRange", evidence: "mid-range" },
    ]);

    expect(results.map((r) => r.status)).toEqual(["applied", "conflict", "rejected", "unchanged"]);
    expect(results[1]).toMatchObject({ conflictId: "c1" });
    expect(results[1]?.message).toMatch(/approval/);
    expect(results[2]?.message).toMatch(/relaxed/); // tells the model the accepted values
    expect(view.profile).toMatchObject({ dietary: ["vegetarian"], budgetTier: "midRange" });
    expect(view.pendingConflicts.map((c) => c.id)).toEqual(["c1"]);
    expect(changes).toEqual({ updatedFields: ["dietary"], newConflictIds: ["c1"] });
  });

  it("view lists only pending conflicts", async () => {
    const service = setup({ dietary: ["vegetarian"] });
    await service.flagConflict({ field: "dietary", observation: "steakhouse", evidence: "steakhouse" });
    await service.resolve("c1", { action: "keep" });
    expect((await service.view()).pendingConflicts).toEqual([]);
  });

  it("resolve reports the field it changed", async () => {
    const service = setup({ budgetTier: "midRange" });
    await service.applyUpdates([{ field: "budgetTier", op: "set", value: "luxury", evidence: "luxury" }]);
    const { outcome, view, changes } = await service.resolve("c1", { action: "approve" });
    expect(outcome.status).toBe("resolved");
    expect(view.profile.budgetTier).toBe("luxury");
    expect(changes.updatedFields).toEqual(["budgetTier"]);
  });

  it("flagConflict on an empty field is rejected and changes nothing", async () => {
    const service = setup();
    const { output, changes } = await service.flagConflict({ field: "dietary", observation: "x", evidence: "x" });
    expect(output.status).toBe("rejected");
    expect(changes).toEqual({ updatedFields: [], newConflictIds: [] });
  });
});
