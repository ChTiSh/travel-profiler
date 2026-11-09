import { z } from "zod";
import { ApiErrorCodeSchema, ApiErrorSchema, type ApiError } from "@/lib/contracts";

const BareErrorSchema = z.object({ code: ApiErrorCodeSchema, message: z.string() });

/**
 * Turns whatever `useChat` surfaces into our typed error:
 * - HTTP error response: an APICallError whose body is our `{ error: { code, message } }`
 * - error inside the stream: an Error whose message is our `{ code, message }` (route's onError)
 * - anything else (network down, unexpected text): a generic fallback
 */
export function toApiError(error: unknown): ApiError["error"] {
  const raw = (error as { responseBody?: string })?.responseBody ?? (error as Error)?.message ?? "";
  try {
    const json: unknown = JSON.parse(raw);
    const wrapped = ApiErrorSchema.safeParse(json);
    if (wrapped.success) return wrapped.data.error;
    const bare = BareErrorSchema.safeParse(json);
    if (bare.success) return bare.data;
  } catch {
    // not JSON: fall through
  }
  return { code: "internal", message: "Something went wrong reaching the assistant. Check your connection and try again." };
}
