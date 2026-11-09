import type { DestinationInfo } from "@/lib/contracts";
import { DESTINATIONS } from "./data";

export { DESTINATIONS };

/** Lowercase, strip diacritics and punctuation, collapse whitespace: "Reykjavík!" → "reykjavik". */
function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INDEX = new Map<string, DestinationInfo>(
  DESTINATIONS.flatMap(({ info, aliases }) =>
    [info.name, ...aliases].map((key) => [normalize(key), info] as const),
  ),
);

/**
 * The spec's destination tool. Exact match on name or alias only, never
 * substring or fuzzy matching, so an unknown place returns `null` and the
 * agent says it has no data instead of getting a wrong destination's facts.
 * "Lisbon, Portugal" falls back to the part before the comma.
 */
export async function getDestinationInfo(name: string): Promise<DestinationInfo | null> {
  const candidates = [name, name.split(",")[0] ?? ""].map(normalize).filter(Boolean);
  for (const key of candidates) {
    const info = INDEX.get(key);
    if (info) return structuredClone(info);
  }
  return null;
}
