import { describe, expect, it } from "vitest";
import { DestinationInfoSchema } from "@/lib/contracts";
import { DESTINATIONS, getDestinationInfo } from "./index";

describe("destination data", () => {
  it("has at least 5 destinations, each matching the spec schema", () => {
    expect(DESTINATIONS.length).toBeGreaterThanOrEqual(5);
    for (const { info } of DESTINATIONS) {
      expect(DestinationInfoSchema.safeParse(info).success, info.name).toBe(true);
    }
  });

  it("has no alias claimed by two destinations", () => {
    const keys = DESTINATIONS.flatMap((d) => [d.info.name, ...d.aliases].map((k) => k.toLowerCase()));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("getDestinationInfo", () => {
  it("finds a destination by name, ignoring case and spacing", async () => {
    expect((await getDestinationInfo("Kyoto"))?.name).toBe("Kyoto");
    expect((await getDestinationInfo("  kyoto  "))?.name).toBe("Kyoto");
  });

  it("finds a destination by alias and without diacritics", async () => {
    expect((await getDestinationInfo("NYC"))?.name).toBe("New York City");
    expect((await getDestinationInfo("CDMX"))?.name).toBe("Mexico City");
    expect((await getDestinationInfo("Reykjavik"))?.name).toBe("Reykjavík");
  });

  it("accepts a 'City, Country' form", async () => {
    expect((await getDestinationInfo("Lisbon, Portugal"))?.name).toBe("Lisbon");
  });

  it("returns null for unknown places instead of guessing", async () => {
    expect(await getDestinationInfo("Atlantis")).toBeNull();
    expect(await getDestinationInfo("")).toBeNull();
    // No substring matching: "York" is not New York City.
    expect(await getDestinationInfo("York")).toBeNull();
  });

  it("returns a copy, so callers cannot mutate the source data", async () => {
    const first = await getDestinationInfo("Kyoto");
    first!.knownFor.push("mutated");
    expect((await getDestinationInfo("Kyoto"))!.knownFor).not.toContain("mutated");
  });
});
