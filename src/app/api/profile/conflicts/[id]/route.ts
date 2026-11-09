import { ResolveConflictRequestSchema, type ProfileView } from "@/lib/contracts";
import { log } from "@/lib/log";
import { errorResponse, readJson } from "@/lib/server/http";
import { getProfileService } from "@/lib/server/profile";

/**
 * POST /api/profile/conflicts/:id  body: ResolveConflictRequest → ProfileView
 * The conflict card's Approve / Keep current / Clarify. Same service as the chat tools.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const json = await readJson(req);
  if (!json.ok) return json.response;

  const parsed = ResolveConflictRequestSchema.safeParse(json.body);
  if (!parsed.success) {
    return errorResponse({ code: "bad_request", message: "Body must be { action: 'approve' | 'keep' | 'clarify', note? }." });
  }

  const { outcome, view } = await getProfileService().resolve(id, parsed.data);
  if (outcome.status === "rejected") return errorResponse({ code: outcome.code, message: outcome.reason });

  log("info", "conflict.resolved", { conflictId: id, action: parsed.data.action, via: "ui" });
  const body: ProfileView = view;
  return Response.json(body);
}
