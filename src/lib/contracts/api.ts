import { z } from "zod";
import { ProfileConflictSchema } from "./conflict";
import { ProvenanceSchema, TravelProfileSchema } from "./profile";

/** What the JSON store persists. `version` allows a future migration instead of a silent reset. */
export const ProfileStateSchema = z.object({
  version: z.literal(1),
  profile: TravelProfileSchema,
  provenance: ProvenanceSchema.default({}),
  conflicts: z.array(ProfileConflictSchema).default([]),
});
export type ProfileState = z.infer<typeof ProfileStateSchema>;

/** What the UI renders: `GET /api/profile` and the live `data-profile` stream part. */
export const ProfileViewSchema = z.object({
  profile: TravelProfileSchema,
  provenance: ProvenanceSchema,
  pendingConflicts: z.array(ProfileConflictSchema),
});
export type ProfileView = z.infer<typeof ProfileViewSchema>;

/** `POST /api/profile/conflicts/:id`: the conflict card's three actions. */
export const ResolveConflictRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("keep") }),
  z.object({ action: z.literal("clarify"), note: z.string().trim().min(1).max(1000) }),
]);
export type ResolveConflictRequest = z.infer<typeof ResolveConflictRequestSchema>;

/**
 * `POST /api/chat` envelope. Messages are checked structurally here and then
 * fully validated by the AI SDK (`safeValidateUIMessages`) against our data-part
 * schemas. Extra fields sent by `useChat` (id, trigger, …) are stripped.
 */
export const ChatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(200),
});

export const MAX_USER_MESSAGE_CHARS = 4000;

export const ApiErrorCodeSchema = z.enum([
  "bad_request",
  "not_found",
  "conflict_not_pending",
  "missing_credentials",
  "invalid_credentials",
  /** Env vars present but unusable (unknown provider, malformed base URL). */
  "misconfigured",
  /** Common with free models; worth its own message ("wait a minute") rather than a generic failure. */
  "rate_limited",
  "provider_error",
  "internal",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({ code: ApiErrorCodeSchema, message: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
