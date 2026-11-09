import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, RetryError, type LanguageModel } from "ai";
import type { ApiError } from "@/lib/contracts";

/*
 * The only module that knows which LLM vendor is in use. Everything else
 * receives a `LanguageModel`. Switching or benchmarking models is a change to
 * env vars, not code (plan option A):
 *
 *   LLM_PROVIDER  "openai-compatible" (default) | "anthropic"
 *   LLM_BASE_URL  OpenAI-compatible endpoint; defaults to OpenRouter
 *   LLM_MODEL     model id, e.g. a free OpenRouter model
 *   LLM_API_KEY   secret; never logged or returned to the client
 */

export const PROVIDERS = ["openai-compatible", "anthropic"] as const;
export type LlmProvider = (typeof PROVIDERS)[number];

export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export type LlmConfig = { provider: LlmProvider; model: string; apiKey: string; baseURL?: string };
type ErrorBody = ApiError["error"];

export function readLlmConfig(
  env: Record<string, string | undefined> = process.env,
): { ok: true; config: LlmConfig } | { ok: false; error: ErrorBody } {
  const fail = (code: ErrorBody["code"], message: string) => ({ ok: false as const, error: { code, message } });

  const provider = (env.LLM_PROVIDER?.trim() || "openai-compatible") as LlmProvider;
  if (!PROVIDERS.includes(provider)) {
    return fail("misconfigured", `LLM_PROVIDER must be one of: ${PROVIDERS.join(", ")}.`);
  }

  const apiKey = env.LLM_API_KEY?.trim();
  if (!apiKey) {
    return fail("missing_credentials", "No API key configured. Set LLM_API_KEY in .env.local and restart (see README).");
  }

  const model = env.LLM_MODEL?.trim();
  if (!model) return fail("misconfigured", "No model configured. Set LLM_MODEL in .env.local (see README).");

  let baseURL: string | undefined;
  if (provider === "openai-compatible") {
    baseURL = env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL;
    if (!URL.canParse(baseURL)) return fail("misconfigured", "LLM_BASE_URL is not a valid URL.");
  }

  return { ok: true, config: { provider, model, apiKey, baseURL } };
}

export function createModel(config: LlmConfig): LanguageModel {
  if (config.provider === "anthropic") {
    return createAnthropic({ apiKey: config.apiKey })(config.model);
  }
  const isOpenRouter = new URL(config.baseURL!).hostname.endsWith("openrouter.ai");
  return createOpenAICompatible({
    name: isOpenRouter ? "openrouter" : "openai-compatible",
    baseURL: config.baseURL!,
    apiKey: config.apiKey,
    includeUsage: true, // token counts for structured logs
    // OpenRouter's optional app attribution headers.
    headers: isOpenRouter ? { "X-Title": "Profile Builder" } : undefined,
  })(config.model);
}

/**
 * Maps a provider failure to a user-facing error. Messages are written for the
 * user and never include the raw error, which can contain URLs or internals.
 */
export function classifyProviderError(err: unknown): ErrorBody {
  // After retries the SDK throws a RetryError wrapping the last real failure.
  const cause = RetryError.isInstance(err) ? err.lastError : err;
  const status = APICallError.isInstance(cause) ? cause.statusCode : undefined;
  if (status === 401 || status === 403) {
    return {
      code: "invalid_credentials",
      message: "The LLM provider rejected the API key. Check LLM_API_KEY (and LLM_PROVIDER / LLM_BASE_URL).",
    };
  }
  if (status === 429) {
    const detail = `${(cause as APICallError).message} ${(cause as APICallError).responseBody ?? ""}`;
    if (/per[-_ ]?day|daily/i.test(detail)) {
      return {
        code: "rate_limited",
        message:
          "The daily request quota for this model or key is used up. It resets daily; or switch LLM_MODEL / LLM_PROVIDER, or add credits with your provider.",
      };
    }
    return {
      code: "rate_limited",
      message: "The model is rate-limited right now (common with free models). Wait a minute and try again.",
    };
  }
  return { code: "provider_error", message: "The LLM provider failed to respond. Please try again." };
}
