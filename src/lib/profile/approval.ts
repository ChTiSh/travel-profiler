/**
 * Guard for approving a conflict from chat (plan Q3). The LLM interprets
 * "yes, update it", so it must quote the user's words; the server applies the
 * decision only if that quote really is in the user's LATEST message. This
 * stops the model from inventing an approval or reusing an earlier one.
 *
 * Deliberately a plain substring check after light normalization; anything
 * smarter (fuzzy or semantic matching) would reintroduce the judgment we're
 * trying to take away from the model.
 */
export function isQuoteInMessage(quote: string, latestUserMessage: string): boolean {
  const q = normalize(quote);
  // Padding with spaces makes this a whole-word match: "yes" must not match "eyes".
  return q.length > 0 && ` ${normalize(latestUserMessage)} `.includes(` ${q} `);
}

/** Case-fold, unify apostrophes, and reduce punctuation and whitespace runs to single spaces. */
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’‛′]/g, "'")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim();
}
