import { z } from "zod";
import { ProfileFieldSchema } from "./profile";

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
  field: ProfileFieldSchema,
  op: z
    .enum(["set", "add", "remove"])
    .describe("`set` for single-value fields; `add` or `remove` items for list fields"),
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
