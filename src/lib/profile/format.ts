import { CORE_FIELDS, type ProfileField, type ProfileValue, type TravelProfile } from "@/lib/contracts";

/** Human-readable names, shared by the profile panel, conflict cards, and announcements. */
export const FIELD_LABELS: Record<ProfileField, string> = {
  homeAirport: "Home airport",
  budgetTier: "Budget tier",
  dailyBudgetUSD: "Daily budget (USD)",
  dailyPace: "Daily pace",
  interests: "Interests",
  dietary: "Dietary needs",
  companions: "Travels with",
  preferredSeasons: "Preferred seasons",
  splurgePriorities: "Worth splurging on",
  climatePreference: "Climate",
  accommodation: "Accommodation",
  accessibilityAndMobility: "Accessibility & mobility",
  destinationsOfInterest: "Wants to visit",
  pastDestinations: "Has visited",
  dealBreakers: "Deal-breakers",
};

const VALUE_LABELS: Record<string, string> = { midRange: "mid-range" };

export function formatValue(value: ProfileValue | undefined): string {
  if (value === undefined) return "(not set)";
  if (Array.isArray(value)) return value.length ? value.map((v) => VALUE_LABELS[v] ?? v).join(", ") : "(none)";
  if (typeof value === "number") return value.toLocaleString("en-US");
  return VALUE_LABELS[value] ?? value;
}

/** Core fields still empty: what the interview asks about next (B4), and what the greeting mentions. */
export function missingCoreFields(profile: TravelProfile): ProfileField[] {
  return CORE_FIELDS.filter((f) => {
    const v = profile[f];
    return Array.isArray(v) ? v.length === 0 : v === undefined;
  });
}
