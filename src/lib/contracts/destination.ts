import { z } from "zod";

/** Shared by destination data and the traveler's `preferredSeasons`, so the two can be compared directly. */
export const SeasonSchema = z.enum(["spring", "summer", "fall", "winter"]);
export type Season = z.infer<typeof SeasonSchema>;

const UsdPerDay = z.number().positive();

/**
 * The spec's `DestinationInfo`, kept field-for-field. Our hardcoded data is
 * validated against it in tests, so a typo in the data fails loudly.
 */
export const DestinationInfoSchema = z.object({
  name: z.string().min(1),
  bestSeasons: z.array(SeasonSchema).min(1),
  knownFor: z.array(z.string().min(1)).min(1),
  averageDailyBudgetUSD: z
    .object({ budget: UsdPerDay, midRange: UsdPerDay, luxury: UsdPerDay })
    .refine((b) => b.budget <= b.midRange && b.midRange <= b.luxury, {
      message: "Budget tiers must be ordered: budget <= midRange <= luxury",
    }),
  visaNotes: z.string().min(1).optional(),
});
export type DestinationInfo = z.infer<typeof DestinationInfoSchema>;
