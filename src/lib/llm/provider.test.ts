import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { classifyProviderError, readLlmConfig } from "./provider";

describe("readLlmConfig", () => {
  it("defaults to OpenRouter via the OpenAI-compatible provider", () => {
    const r = readLlmConfig({ LLM_API_KEY: "k", LLM_MODEL: "some/model:free" });
    expect(r).toEqual({
      ok: true,
      config: {
        provider: "openai-compatible",
        model: "some/model:free",
        apiKey: "k",
        baseURL: "https://openrouter.ai/api/v1",
      },
    });
  });

  it("supports Anthropic without a base URL", () => {
    const r = readLlmConfig({ LLM_PROVIDER: "anthropic", LLM_API_KEY: "k", LLM_MODEL: "claude-haiku-5-5" });
    expect(r.ok && r.config).toMatchObject({ provider: "anthropic", baseURL: undefined });
  });

  it("treats a missing or blank key as missing credentials, without echoing anything secret", () => {
    for (const env of [{}, { LLM_API_KEY: "   " }]) {
      const r = readLlmConfig({ ...env, LLM_MODEL: "m" });
      expect(r).toMatchObject({ ok: false, error: { code: "missing_credentials" } });
    }
  });

  it("requires a model", () => {
    expect(readLlmConfig({ LLM_API_KEY: "k" })).toMatchObject({ ok: false, error: { code: "misconfigured" } });
  });

  it("rejects an unknown provider or a malformed base URL", () => {
    const base = { LLM_API_KEY: "k", LLM_MODEL: "m" };
    expect(readLlmConfig({ ...base, LLM_PROVIDER: "gpt" })).toMatchObject({ ok: false, error: { code: "misconfigured" } });
    expect(readLlmConfig({ ...base, LLM_BASE_URL: "not a url" })).toMatchObject({
      ok: false,
      error: { code: "misconfigured" },
    });
  });
});

describe("classifyProviderError", () => {
  const apiError = (statusCode: number) =>
    new APICallError({ message: "x", url: "https://example.test", requestBodyValues: {}, statusCode });

  it.each([
    [401, "invalid_credentials"],
    [403, "invalid_credentials"],
    [429, "rate_limited"],
    [500, "provider_error"],
    [404, "provider_error"],
  ])("HTTP %i -> %s", (status, code) => {
    expect(classifyProviderError(apiError(status)).code).toBe(code);
  });

  it("a daily quota 429 says so, instead of 'wait a minute'", () => {
    const daily = new APICallError({
      message: "Rate limit exceeded: free-models-per-day",
      url: "https://example.test",
      requestBodyValues: {},
      statusCode: 429,
      responseBody: '{"error":{"message":"Rate limit exceeded: free-models-per-day. Add 10 credits..."}}',
    });
    const r = classifyProviderError(daily);
    expect(r.code).toBe("rate_limited");
    expect(r.message).toMatch(/daily/i);
    expect(r.message).not.toMatch(/minute/i);
  });

  it("unwraps the SDK's RetryError: a 429 after retries is still rate_limited", () => {
    const wrapped = new RetryError({ message: "failed after 2 attempts", reason: "maxRetriesExceeded", errors: [apiError(429)] });
    expect(classifyProviderError(wrapped).code).toBe("rate_limited");
  });

  it("anything else is a provider error with a generic message (no internals leaked)", () => {
    const r = classifyProviderError(new Error("socket hang up at 10.0.0.3"));
    expect(r.code).toBe("provider_error");
    expect(r.message).not.toContain("10.0.0.3");
  });
});
