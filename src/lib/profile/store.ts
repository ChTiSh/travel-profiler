import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { EMPTY_PROFILE, ProfileStateSchema, type ProfileState } from "@/lib/contracts";
import { log } from "@/lib/log";

/**
 * Persistence for the single user's profile. `update` is the only way to
 * write: a serialized read-modify-write, so two tool calls executing in
 * parallel within one turn can't overwrite each other's changes.
 */
export interface ProfileStore {
  read(): Promise<ProfileState>;
  update<T>(fn: (state: ProfileState) => { state: ProfileState; value: T }): Promise<T>;
}

export function emptyState(): ProfileState {
  return { version: 1, profile: structuredClone(EMPTY_PROFILE), provenance: {}, conflicts: [] };
}

type StorageIO = { load(): Promise<ProfileState>; save(state: ProfileState): Promise<void> };

/** Queues updates in-process. Fine for one Node process; multiple instances would need a DB or file lock. */
function serialized(io: StorageIO): ProfileStore {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    read: () => io.load(),
    update(fn) {
      const run = queue.then(async () => {
        const current = await io.load();
        const { state, value } = fn(current);
        if (state !== current) await io.save(state);
        return value;
      });
      queue = run.catch(() => {}); // a failed update must not jam the queue
      return run;
    },
  };
}

export function createMemoryStore(initial: ProfileState = emptyState()): ProfileStore {
  let state = structuredClone(initial);
  return serialized({
    load: async () => structuredClone(state),
    save: async (next) => {
      state = structuredClone(next);
    },
  });
}

/**
 * JSON file on disk, validated on every read. Writes go to a temp file and
 * are renamed into place, so a crash mid-write can't leave a half-written
 * profile. A corrupt or unrecognized file is moved aside (not deleted) and
 * the app starts fresh, rather than crashing or silently discarding data.
 */
export function createJsonFileStore(path: string): ProfileStore {
  return serialized({
    async load() {
      let raw: string;
      try {
        raw = await readFile(path, "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
        throw err;
      }

      let reason: string;
      try {
        const parsed = ProfileStateSchema.safeParse(JSON.parse(raw));
        if (parsed.success) return parsed.data;
        reason = parsed.error.issues[0]?.message ?? "schema mismatch";
      } catch {
        reason = "invalid JSON";
      }

      const backup = `${path}.corrupt-${Date.now()}`;
      await rename(path, backup);
      log("warn", "profile_store.corrupt", { path, backup, reason });
      return emptyState();
    },

    async save(state) {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(tmp, JSON.stringify(state, null, 2));
      await rename(tmp, path);
    },
  });
}
