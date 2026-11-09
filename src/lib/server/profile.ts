import { join } from "node:path";
import { createProfileService, type ProfileService } from "@/lib/profile/service";
import { createJsonFileStore } from "@/lib/profile/store";

// One service (and so one write queue) per process. Kept on globalThis because
// Next's dev server re-evaluates modules on change; a second instance would get
// its own queue and could interleave writes to the same file.
const g = globalThis as typeof globalThis & { __profileService?: ProfileService };

export function getProfileService(): ProfileService {
  g.__profileService ??= createProfileService(
    createJsonFileStore(process.env.PROFILE_STORE_PATH || join(process.cwd(), "data", "profile.json")),
  );
  return g.__profileService;
}

/** Test hook: drop the cached service so the next call picks up a new PROFILE_STORE_PATH. */
export function resetProfileServiceForTests(): void {
  g.__profileService = undefined;
}
