import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { toApiError } from "./errors";

describe("toApiError", () => {
  it("reads our error from an HTTP error response", () => {
    const body = JSON.stringify({ error: { code: "missing_credentials", message: "Set LLM_API_KEY" } });
    const err = new APICallError({ message: body, url: "/api/chat", requestBodyValues: {}, statusCode: 500, responseBody: body });
    expect(toApiError(err)).toEqual({ code: "missing_credentials", message: "Set LLM_API_KEY" });
  });

  it("reads our error from a mid-stream error", () => {
    const err = new Error(JSON.stringify({ code: "rate_limited", message: "Daily quota used up" }));
    expect(toApiError(err)).toEqual({ code: "rate_limited", message: "Daily quota used up" });
  });

  it("falls back to a generic message for anything else", () => {
    expect(toApiError(new TypeError("Failed to fetch")).code).toBe("internal");
    expect(toApiError(new Error(JSON.stringify({ code: "made_up", message: "x" }))).code).toBe("internal");
    expect(toApiError(undefined).code).toBe("internal");
  });
});
