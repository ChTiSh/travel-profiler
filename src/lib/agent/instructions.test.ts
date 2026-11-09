import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, type ProfileView } from "@/lib/contracts";
import { buildInstructions, missingCoreFields } from "./instructions";

const view = (over: Partial<ProfileView> = {}): ProfileView => ({
  profile: EMPTY_PROFILE,
  provenance: {},
  pendingConflicts: [],
  ...over,
});

describe("buildInstructions", () => {
  it("lists missing core fields and drops them once filled", () => {
    expect(missingCoreFields(EMPTY_PROFILE)).toContain("dietary");
    expect(missingCoreFields({ ...EMPTY_PROFILE, dietary: ["vegan"] })).not.toContain("dietary");
  });

  it("includes pending conflicts with their ids, so the model can resolve them", () => {
    const text = buildInstructions(
      view({
        pendingConflicts: [
          {
            id: "c-123",
            kind: "contradiction",
            field: "dietary",
            currentValue: ["vegetarian"],
            observation: "asked for a steakhouse",
            evidence: "steakhouse?",
            status: "pending",
            clarifications: [],
            createdAt: "2026-11-08T12:00:00.000Z",
          },
        ],
      }),
    );
    expect(text).toContain("c-123");
    expect(text).toContain("asked for a steakhouse");
  });

  it("states the non-negotiable rules: tool-only destination facts, no silent overwrite", () => {
    const text = buildInstructions(view());
    expect(text).toMatch(/ONLY from getDestinationInfo/);
    expect(text).toMatch(/never silently overwrite/i);
    expect(text).toContain('"midRange"'); // field guide with accepted values
  });
});
