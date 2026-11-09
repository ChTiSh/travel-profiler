import { describe, expect, it } from "vitest";
import { ProfileStateSchema, type ProfileDataPart } from "@/lib/contracts";
import { createProfileService } from "@/lib/profile/service";
import { createMemoryStore } from "@/lib/profile/store";
import { buildTools } from "./tools";

const opts = { toolCallId: "t1", messages: [] } as never;

/** Calls a tool's execute and narrows away the streaming (AsyncIterable) return type. */
async function run<I, O>(t: { execute?: (input: I, options: never) => O | PromiseLike<O> | AsyncIterable<O> }, input: I) {
  return (await t.execute!(input, opts)) as O;
}

function setup(profile: Record<string, unknown>, latestUserText: string) {
  let n = 0;
  const service = createProfileService(
    createMemoryStore(ProfileStateSchema.parse({ version: 1, profile })),
    { now: () => "2026-11-08T12:00:00.000Z", newId: () => `c${++n}` },
  );
  const emitted: ProfileDataPart[] = [];
  const tools = buildTools({ service, latestUserText, onProfileChange: (part) => emitted.push(part) });
  return { service, tools, emitted };
}

describe("getDestinationInfo tool", () => {
  it("returns the destination when known", async () => {
    const { tools } = setup({}, "Kyoto?");
    const out = await run(tools.getDestinationInfo, { name: "kyoto" });
    expect(out).toMatchObject({ found: true, destination: { name: "Kyoto" } });
  });

  it("for an unknown place, says so and forbids inventing facts", async () => {
    const { tools } = setup({}, "Atlantis?");
    const out = await run(tools.getDestinationInfo, { name: "Atlantis" });
    expect(out).toMatchObject({ found: false, name: "Atlantis" });
    expect(out.found === false && out.knownDestinations).toContain("Kyoto");
    expect(out.found === false && out.instruction).toMatch(/do not/i);
  });
});

describe("updateProfile / flagConflict tools", () => {
  it("emits a live profile update with what changed", async () => {
    const { tools, emitted } = setup({}, "I'm vegetarian");
    await run(tools.updateProfile, 
      { updates: [{ field: "dietary", op: "add", value: ["vegetarian"], evidence: "I'm vegetarian" }] },
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.view.profile.dietary).toEqual(["vegetarian"]);
    expect(emitted[0]?.changes.updatedFields).toEqual(["dietary"]);
  });

  it("flagging a contradiction tells the model to ask, and emits the new conflict", async () => {
    const { tools, emitted } = setup({ dietary: ["vegetarian"] }, "Recommend a steakhouse?");
    const out = await run(tools.flagConflict, 
      { field: "dietary", observation: "asked for a steakhouse", evidence: "Recommend a steakhouse?" },
    );
    expect(out).toMatchObject({ status: "conflict", conflictId: "c1" });
    expect(emitted[0]?.changes.newConflictIds).toEqual(["c1"]);
  });
});

describe("resolveConflict tool: chat approval guard (Q3)", () => {
  async function pendingDietChange(latestUserText: string) {
    const ctx = setup({ dietary: ["vegetarian"] }, latestUserText);
    await ctx.service.applyUpdates([{ field: "dietary", op: "remove", value: ["vegetarian"], evidence: "I eat meat now" }]);
    return ctx;
  }

  it("applies when the quote is in the latest user message", async () => {
    const { tools, service } = await pendingDietChange("Yes, update it please");
    const out = await run(tools.resolveConflict, { conflictId: "c1", action: "approve", evidence: "yes, update it" });
    expect(out).toMatchObject({ status: "resolved", action: "approve" });
    expect((await service.view()).profile.dietary).toEqual([]);
  });

  it("refuses an approval the user never gave, leaving the conflict pending", async () => {
    const { tools, service } = await pendingDietChange("Hmm, let me think about it");
    const out = await run(tools.resolveConflict, { conflictId: "c1", action: "approve", evidence: "yes" });
    expect(out.status).toBe("rejected");
    const view = await service.view();
    expect(view.profile.dietary).toEqual(["vegetarian"]);
    expect(view.pendingConflicts).toHaveLength(1);
  });
});
