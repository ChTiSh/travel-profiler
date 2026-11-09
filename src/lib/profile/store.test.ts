import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileState } from "@/lib/contracts";
import { createJsonFileStore, createMemoryStore, emptyState, type ProfileStore } from "./store";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "profile-store-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const addInterest = (item: string) => (state: ProfileState) => ({
  state: { ...state, profile: { ...state.profile, interests: [...state.profile.interests, item] } },
  value: item,
});

// The same behavioral contract for both implementations.
describe.each([
  ["json file", () => createJsonFileStore(join(dir, "nested", "profile.json"))],
  ["memory", () => createMemoryStore()],
] as const)("%s store", (_name, make: () => ProfileStore) => {
  it("starts empty", async () => {
    expect(await make().read()).toEqual(emptyState());
  });

  it("returns the updater's value and persists its state", async () => {
    const store = make();
    expect(await store.update(addInterest("hiking"))).toBe("hiking");
    expect((await store.read()).profile.interests).toEqual(["hiking"]);
  });

  it("serializes concurrent updates, so parallel tool calls lose nothing", async () => {
    const store = make();
    const items = Array.from({ length: 20 }, (_, i) => `interest-${i}`);
    await Promise.all(items.map((i) => store.update(addInterest(i))));
    expect((await store.read()).profile.interests.sort()).toEqual([...items].sort());
  });

  it("a throwing updater saves nothing and doesn't block later updates", async () => {
    const store = make();
    await expect(
      store.update(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await store.update(addInterest("food"));
    expect((await store.read()).profile.interests).toEqual(["food"]);
  });
});

describe("json file store: persistence and bad data", () => {
  const path = () => join(dir, "profile.json");

  it("survives a new store instance (i.e. a server restart / page reload)", async () => {
    await createJsonFileStore(path()).update(addInterest("museums"));
    expect((await createJsonFileStore(path()).read()).profile.interests).toEqual(["museums"]);
  });

  it("leaves no temp files behind after a write", async () => {
    await createJsonFileStore(path()).update(addInterest("museums"));
    expect(await readdir(dir)).toEqual(["profile.json"]);
  });

  it.each([
    ["invalid JSON", "{ not json"],
    ["valid JSON, wrong shape", JSON.stringify({ version: 2, profile: {} })],
  ])("%s: starts empty, keeps the bad file as a backup, and logs a warning", async (_case, contents) => {
    await writeFile(path(), contents);
    expect(await createJsonFileStore(path()).read()).toEqual(emptyState());

    const backup = (await readdir(dir)).find((f) => f.startsWith("profile.json.corrupt-"));
    expect(backup).toBeDefined();
    expect(await readFile(join(dir, backup!), "utf8")).toBe(contents);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"event":"profile_store.corrupt"'));
  });
});
