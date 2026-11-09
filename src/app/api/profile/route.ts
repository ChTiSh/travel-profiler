import { connection } from "next/server";
import type { ProfileView } from "@/lib/contracts";
import { getProfileService } from "@/lib/server/profile";

/** GET /api/profile → ProfileView (stored profile, provenance, pending conflicts). */
export async function GET(): Promise<Response> {
  // cacheComponents is on: make explicit that this reads live data and must never be prerendered.
  await connection();
  const view: ProfileView = await getProfileService().view();
  return Response.json(view);
}
