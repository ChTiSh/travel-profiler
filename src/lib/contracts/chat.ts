import type { UIMessage } from "ai";
import { z } from "zod";
import { ProfileViewSchema } from "./api";
import { ProfileFieldSchema } from "./profile";

/**
 * Live profile updates during a turn. Sent as a *transient* data part: it
 * reaches `useChat`'s `onData` immediately but is never added to message
 * history, so profile snapshots aren't echoed back to the server each turn.
 * A full snapshot (not a diff) keeps the client trivially consistent; `changes`
 * exists so the UI can announce what changed (accessibility, A1).
 */
export const ProfileDataPartSchema = z.object({
  view: ProfileViewSchema,
  changes: z.object({
    updatedFields: z.array(ProfileFieldSchema),
    newConflictIds: z.array(z.string()),
  }),
});
export type ProfileDataPart = z.infer<typeof ProfileDataPartSchema>;

/** Passed to `useChat({ dataPartSchemas })` and `safeValidateUIMessages` on the server. */
export const chatDataPartSchemas = {
  profile: ProfileDataPartSchema,
};

export type ChatDataParts = { profile: ProfileDataPart };

/**
 * The single message type for the chat stream on both sides. Tool part types
 * are added as the third type parameter once the tools exist (Phase 2).
 */
export type ChatUIMessage = UIMessage<never, ChatDataParts>;
