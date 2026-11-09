import { z } from "zod";
import {
  ProfileFieldSchema,
  ProfileValueSchema,
  type ListField,
  type ProfileField,
  type SingleValueField,
  type TravelProfile,
} from "./profile";

export const ConflictStatusSchema = z.enum(["pending", "approved", "kept", "superseded"]);
export type ConflictStatus = z.infer<typeof ConflictStatusSchema>;

const Evidence = z.string().trim().min(1).max(500);

const ConflictBase = z.object({
  id: z.string().min(1),
  field: ProfileFieldSchema,
  currentValue: ProfileValueSchema,
  /** Verbatim user words that triggered the conflict. */
  evidence: Evidence,
  status: ConflictStatusSchema,
  /** Context the user added via "Clarify" instead of approving or keeping. */
  clarifications: z
    .array(z.object({ note: z.string().trim().min(1).max(1000), at: z.iso.datetime() }))
    .default([]),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().optional(),
});

/**
 * A detected contradiction with the stored profile, awaiting explicit user approval.
 * - `change`: the user stated a new value; `proposedValue` is what the field becomes on approval.
 * - `contradiction`: the user said something at odds with a stored value without stating a new
 *   one (vegetarian → "recommend a steakhouse"); the agent must ask what, if anything, changes.
 */
export const ProfileConflictSchema = z.discriminatedUnion("kind", [
  ConflictBase.extend({ kind: z.literal("change"), proposedValue: ProfileValueSchema }),
  ConflictBase.extend({ kind: z.literal("contradiction"), observation: z.string().trim().min(1).max(500) }),
]);
export type ProfileConflict = z.infer<typeof ProfileConflictSchema>;

/**
 * A validated, field-typed update, produced from LLM tool input (see tools.ts)
 * after checking the value against the field's schema. Internal to the server.
 */
export type ProfileUpdateProposal =
  | { field: SingleValueField; op: "set"; value: string | number; evidence: string }
  | { field: ListField; op: "add" | "remove" | "set"; items: string[]; evidence: string };

/** Outcome of merging one proposal into the profile. Only `applied` changes stored values. */
export type MergeResult =
  | { status: "applied"; field: ProfileField; profile: TravelProfile }
  | { status: "unchanged"; field: ProfileField }
  | { status: "conflict"; conflict: ProfileConflict }
  | { status: "rejected"; field?: ProfileField; reason: string };
