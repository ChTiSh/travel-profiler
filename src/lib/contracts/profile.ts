import { z } from "zod";
import { SeasonSchema } from "./destination";

const Text = z.string().trim().min(1).max(120);
const TextList = z.array(Text).max(30).default([]);

export const BudgetTierSchema = z.enum(["budget", "midRange", "luxury"]);
export const DailyPaceSchema = z.enum(["relaxed", "balanced", "packed"]);
export const CompanionSchema = z.enum(["solo", "partner", "family", "friends"]);

/**
 * The durable travel profile (see docs/plan.md, "Profile fields").
 * Single-value fields are optional (unset until the user says something);
 * list fields default to empty. This schema is the one source of truth for
 * field names and value shapes: tool input is validated against it.
 */
export const TravelProfileSchema = z.object({
  // Single-value fields: a different new value is a `change` conflict.
  homeAirport: Text.optional(),
  budgetTier: BudgetTierSchema.optional(),
  dailyBudgetUSD: z.number().positive().max(100_000).optional(),
  dailyPace: DailyPaceSchema.optional(),

  // List fields: adding is free; removing or replacing is a `change` conflict.
  interests: TextList,
  dietary: TextList,
  companions: z.array(CompanionSchema).max(4).default([]),
  preferredSeasons: z.array(SeasonSchema).max(4).default([]),
  splurgePriorities: TextList,
  climatePreference: TextList,
  accommodation: TextList,
  accessibilityAndMobility: TextList,
  destinationsOfInterest: TextList,
  pastDestinations: TextList,
  dealBreakers: TextList,
});
export type TravelProfile = z.infer<typeof TravelProfileSchema>;

export const ProfileFieldSchema = TravelProfileSchema.keyof();
export type ProfileField = z.infer<typeof ProfileFieldSchema>;
export const PROFILE_FIELDS = ProfileFieldSchema.options;

export const SINGLE_VALUE_FIELDS = [
  "homeAirport",
  "budgetTier",
  "dailyBudgetUSD",
  "dailyPace",
] as const satisfies readonly ProfileField[];
export type SingleValueField = (typeof SINGLE_VALUE_FIELDS)[number];
export type ListField = Exclude<ProfileField, SingleValueField>;

export function isSingleValueField(field: ProfileField): field is SingleValueField {
  return (SINGLE_VALUE_FIELDS as readonly ProfileField[]).includes(field);
}

/** Fields the assistant asks about proactively; the rest are captured only when mentioned. */
export const CORE_FIELDS = [
  "homeAirport",
  "budgetTier",
  "dailyPace",
  "interests",
  "dietary",
  "companions",
  "preferredSeasons",
] as const satisfies readonly ProfileField[];

/** Where a field's current value came from. One entry per field (last write wins). */
export const FieldProvenanceSchema = z.object({
  evidence: z.string().trim().min(1).max(500),
  updatedAt: z.iso.datetime(),
});
export type FieldProvenance = z.infer<typeof FieldProvenanceSchema>;

export const ProvenanceSchema = z.partialRecord(ProfileFieldSchema, FieldProvenanceSchema);
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** Any value a profile field can hold; used where the field isn't known statically (conflicts). */
export const ProfileValueSchema = z.union([z.string(), z.number(), z.array(z.string())]);
export type ProfileValue = z.infer<typeof ProfileValueSchema>;

export const EMPTY_PROFILE: TravelProfile = TravelProfileSchema.parse({});

/** Fields whose values come from a fixed vocabulary, for formatting-only normalization ("mid-range" → "midRange"). */
export const ENUM_OPTIONS: Partial<Record<ProfileField, readonly string[]>> = {
  budgetTier: BudgetTierSchema.options,
  dailyPace: DailyPaceSchema.options,
  companions: CompanionSchema.options,
  preferredSeasons: SeasonSchema.options,
};

const oneOf = (options: readonly string[]) => options.map((o) => `"${o}"`).join(" | ");

/**
 * What each field means and which values it accepts, written for the model.
 * Built from the same enums as the schema so it can't drift; a `Record` over
 * every field makes a missing entry a compile error. Without this, models
 * reasonably send "mid-range" / "slow" and get rejected (see the benchmark).
 */
export const FIELD_GUIDE: Record<ProfileField, string> = {
  homeAirport: "single value: home airport, IATA code if known (e.g. SEA)",
  budgetTier: `single value: one of ${oneOf(BudgetTierSchema.options)}`,
  dailyBudgetUSD: "single value: a number, US dollars per day",
  dailyPace: `single value: one of ${oneOf(DailyPaceSchema.options)} (relaxed = slow, few activities; packed = many)`,
  interests: "list: e.g. food, hiking, museums",
  dietary: "list: e.g. vegetarian, nut allergy",
  companions: `list of ${oneOf(CompanionSchema.options)}`,
  preferredSeasons: `list of ${oneOf(SeasonSchema.options)}`,
  splurgePriorities: "list: what's worth paying more for, e.g. fine dining, direct flights",
  climatePreference: "list: e.g. mild weather, avoids humidity",
  accommodation: "list: e.g. boutique hotels, hostels",
  accessibilityAndMobility: "list: only what the user states, never inferred",
  destinationsOfInterest: "list: places the user wants to visit",
  pastDestinations: "list: places the user has already visited",
  dealBreakers: "list: hard no's, e.g. red-eye flights, shared bathrooms",
};

export function describeFields(): string {
  return PROFILE_FIELDS.map((f) => `- ${f}: ${FIELD_GUIDE[f]}`).join("\n");
}
