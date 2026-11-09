import { describe, expect, it } from "vitest";
import { isQuoteInMessage } from "./approval";

describe("isQuoteInMessage (guards chat approval, Q3)", () => {
  const latest = "Yes, go ahead and update it. I eat fish now.";

  it("accepts a verbatim quote from the latest message", () => {
    expect(isQuoteInMessage("go ahead and update it", latest)).toBe(true);
  });

  it("ignores case, extra whitespace, and curly vs straight quotes", () => {
    expect(isQuoteInMessage("YES,   go ahead", latest)).toBe(true);
    expect(isQuoteInMessage("I’m sure", "I'm sure about it")).toBe(true);
  });

  it("rejects a paraphrase or an invented approval", () => {
    expect(isQuoteInMessage("please apply the change", latest)).toBe(false);
    expect(isQuoteInMessage("yes, remove vegetarian", latest)).toBe(false);
  });

  it("matches whole words only: 'yes' is not found in 'eyes'", () => {
    expect(isQuoteInMessage("yes", "my eyes hurt from the screen")).toBe(false);
    expect(isQuoteInMessage("ok", "I booked a flight to Tokyo")).toBe(false);
  });

  it("rejects an empty quote, which would match anything", () => {
    expect(isQuoteInMessage("   ", latest)).toBe(false);
  });

  it("only sees the message it is given: an older message's 'yes' does not count", () => {
    const olderMessage = "yes";
    const latestMessage = "hmm, actually let me think about it";
    expect(isQuoteInMessage("yes", latestMessage)).toBe(false);
    expect(isQuoteInMessage("yes", olderMessage)).toBe(true);
  });
});
