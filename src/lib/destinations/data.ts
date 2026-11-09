import type { DestinationInfo } from "@/lib/contracts";

/**
 * Hardcoded stand-in for a real travel data API. Figures are illustrative
 * and visa notes are deliberately general; this is the app's ONLY source of
 * destination facts (the agent must not add its own).
 *
 * Chosen to cover the demo scenarios: a spread of budgets (Bali → Reykjavík),
 * every season, food-centric and nature-centric places, and both
 * visa-free and pre-registration entry.
 */
export const DESTINATIONS: ReadonlyArray<{ info: DestinationInfo; aliases: readonly string[] }> = [
  {
    info: {
      name: "Kyoto",
      bestSeasons: ["spring", "fall"],
      knownFor: ["temples", "gardens", "traditional food", "tea culture", "walking"],
      averageDailyBudgetUSD: { budget: 70, midRange: 180, luxury: 550 },
      visaNotes:
        "Japan allows visa-free short stays for many nationalities; check the requirements for your passport.",
    },
    aliases: ["kyoto japan"],
  },
  {
    info: {
      name: "Lisbon",
      bestSeasons: ["spring", "summer", "fall"],
      knownFor: ["seafood", "architecture", "nightlife", "viewpoints", "day trips"],
      averageDailyBudgetUSD: { budget: 60, midRange: 150, luxury: 420 },
      visaNotes: "Portugal is in the Schengen Area; Schengen entry rules apply.",
    },
    aliases: ["lisboa"],
  },
  {
    info: {
      name: "Mexico City",
      bestSeasons: ["spring", "fall", "winter"],
      knownFor: ["street food", "museums", "art", "markets", "architecture"],
      averageDailyBudgetUSD: { budget: 45, midRange: 120, luxury: 380 },
      visaNotes:
        "Many nationalities can visit Mexico visa-free for tourism; check the requirements for your passport.",
    },
    aliases: ["cdmx", "ciudad de mexico", "mexico df"],
  },
  {
    info: {
      name: "Reykjavík",
      bestSeasons: ["summer", "winter"],
      knownFor: ["hiking", "hot springs", "northern lights", "nature", "road trips"],
      averageDailyBudgetUSD: { budget: 120, midRange: 260, luxury: 650 },
      visaNotes: "Iceland is in the Schengen Area; Schengen entry rules apply.",
    },
    // Not "iceland": a country is not its capital, and that substitution is what null-handling prevents.
    aliases: ["reykjavik iceland"],
  },
  {
    info: {
      name: "Bali",
      bestSeasons: ["spring", "summer", "fall"],
      knownFor: ["beaches", "surfing", "yoga", "temples", "vegetarian-friendly food"],
      averageDailyBudgetUSD: { budget: 35, midRange: 100, luxury: 350 },
      visaNotes:
        "Indonesia offers a visa on arrival for many nationalities, and a tourist levy applies in Bali.",
    },
    aliases: ["bali indonesia", "ubud"],
  },
  {
    info: {
      name: "New York City",
      bestSeasons: ["spring", "fall"],
      knownFor: ["museums", "food", "theater", "architecture", "neighborhoods"],
      averageDailyBudgetUSD: { budget: 110, midRange: 280, luxury: 750 },
      visaNotes:
        "Visa Waiver Program travelers need an approved ESTA; others usually need a visitor visa.",
    },
    aliases: ["new york", "nyc", "manhattan"],
  },
];
