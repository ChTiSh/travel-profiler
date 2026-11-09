import type { ApiError, ApiErrorCode } from "@/lib/contracts";

/** The single mapping from error code to HTTP status. */
const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  conflict_not_pending: 409,
  rate_limited: 429,
  internal: 500,
  missing_credentials: 500,
  misconfigured: 500,
  invalid_credentials: 502,
  provider_error: 502,
};

export function errorResponse(error: ApiError["error"], headers?: HeadersInit): Response {
  const body: ApiError = { error };
  return Response.json(body, { status: STATUS[error.code], headers });
}

export async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false, response: errorResponse({ code: "bad_request", message: "Request body must be JSON." }) };
  }
}
