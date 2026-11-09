import { z } from "zod";
import type { DestinationInfo } from "./destination";
import { ProfileFieldSchema, describeFields, type ProfileField } from "./profile";

/*
 * LLM-facing tool input schemas. These are deliberately looser than the domain
 * types: a model can name any profile field with any primitive value, and the
 * server checks the value against that field's schema, returning a readable
 * `rejected` reason instead of failing the whole tool call. Descriptions here
 * are part of the prompt.
 */

const Evidence = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .describe("Exact quote from the user's message that supports this. Never paraphrase.");

export const GetDestinationInfoInputSchema = z.object({
  name: z.string().trim().min(1).max(100).describe("Destination name as the user referred to it"),
});

export const ProfileUpdateItemSchema = z.object({
  field: ProfileFieldSchema.describe(`Profile field. Fields and accepted values:\n${describeFields()}`),
  op: z
    .enum(["set", "add", "remove"])
    .describe(
      "`set` replaces the whole value (single-value or list field). `add`/`remove` change items of a list field. Use `set` when a new value replaces an old one (e.g. vegetarian → vegan).",
    ),
  value: z
    .union([z.string(), z.number(), z.array(z.string())])
    .describe("The value to set, or the item(s) to add/remove"),
  evidence: Evidence,
});
export type ProfileUpdateItem = z.infer<typeof ProfileUpdateItemSchema>;

/** Batched so one user message mentioning several preferences needs one tool call. */
export const UpdateProfileInputSchema = z.object({
  updates: z.array(ProfileUpdateItemSchema).min(1).max(15),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

export const FlagConflictInputSchema = z.object({
  field: ProfileFieldSchema.describe("The stored field the user's words contradict"),
  observation: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("What the user said or asked that is at odds with the stored value"),
  evidence: Evidence,
});
export type FlagConflictInput = z.infer<typeof FlagConflictInputSchema>;

export const ResolveConflictInputSchema = z.object({
  conflictId: z.string().min(1),
  action: z.enum(["approve", "keep"]),
  evidence: Evidence.describe(
    "Exact quote from the user's LATEST message expressing this decision. The server rejects the call if it is not found there.",
  ),
});
export type ResolveConflictInput = z.infer<typeof ResolveConflictInputSchema>;

/*
 * Tool outputs: what the model reads back (so it can act on the result) and
 * what the chat UI renders as tool parts. Each carries an `instruction` for
 * the model in plain language, so behavior isn't left to inference.
 */

export type GetDestinationInfoOutput =
  | { found: true; destination: DestinationInfo }
  | { found: false; name: string; knownDestinations: string[]; instruction: string };

export type UpdateItemOutcome = {
  field: ProfileField;
  status: "applied" | "unchanged" | "conflict" | "rejected";
  conflictId?: string;
  message: string;
};
export type UpdateProfileOutput = { results: UpdateItemOutcome[] };

export type FlagConflictOutput =
  | { status: "conflict"; conflictId: string; instruction: string }
  | { status: "rejected"; reason: string };

export type ResolveConflictOutput =
  | { status: "resolved"; conflictId: string; action: "approve" | "keep"; instruction: string }
  | { status: "rejected"; reason: string };

/** Tool name → input/output, for typing tool parts in `ChatUIMessage`. */
export type ChatTools = {
  getDestinationInfo: { input: z.infer<typeof GetDestinationInfoInputSchema>; output: GetDestinationInfoOutput };
  updateProfile: { input: UpdateProfileInput; output: UpdateProfileOutput };
  flagConflict: { input: FlagConflictInput; output: FlagConflictOutput };
  resolveConflict: { input: ResolveConflictInput; output: ResolveConflictOutput };
};
