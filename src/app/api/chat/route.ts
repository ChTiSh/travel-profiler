import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
} from "ai";
import { ChatRequestSchema, MAX_USER_MESSAGE_CHARS, chatDataPartSchemas, type ChatUIMessage } from "@/lib/contracts";
import { buildInstructions } from "@/lib/agent/instructions";
import { buildTools } from "@/lib/agent/tools";
import { classifyProviderError, createModel, readLlmConfig } from "@/lib/llm/provider";
import { log } from "@/lib/log";
import { errorResponse, readJson } from "@/lib/server/http";
import { getProfileService } from "@/lib/server/profile";

// Free models with multi-step tool use can take 15-30 s per turn.
export const maxDuration = 60;

/**
 * POST /api/chat  body: { messages: ChatUIMessage[] } → UI message stream (SSE)
 * Transport only: validate, then hand off to the agent (instructions + tools).
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = { "x-request-id": requestId };

  const llm = readLlmConfig();
  if (!llm.ok) {
    log("error", "chat.config_error", { requestId, code: llm.error.code });
    return errorResponse(llm.error, headers);
  }

  const json = await readJson(req);
  if (!json.ok) return json.response;
  const envelope = ChatRequestSchema.safeParse(json.body);
  if (!envelope.success) return errorResponse({ code: "bad_request", message: "Body must be { messages: [...] }." }, headers);

  // Full structural validation by the SDK, including our data-part schemas. Tool parts in the
  // history only inform the model; the store, not the client's history, is the source of truth.
  const validated = await safeValidateUIMessages<ChatUIMessage>({
    messages: envelope.data.messages,
    dataSchemas: chatDataPartSchemas,
  });
  if (!validated.success) return errorResponse({ code: "bad_request", message: "Malformed chat messages." }, headers);
  const messages = validated.data;

  const latest = messages.at(-1);
  if (latest?.role !== "user") return errorResponse({ code: "bad_request", message: "The last message must be from the user." }, headers);
  const latestUserText = latest.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n").trim();
  if (!latestUserText) return errorResponse({ code: "bad_request", message: "Message is empty." }, headers);
  if (latestUserText.length > MAX_USER_MESSAGE_CHARS) {
    return errorResponse({ code: "bad_request", message: `Message is too long (max ${MAX_USER_MESSAGE_CHARS} characters).` }, headers);
  }

  const service = getProfileService();
  const view = await service.view();
  const modelMessages = await convertToModelMessages(messages);
  const started = performance.now();
  const toErrorText = (error: unknown) => {
    const classified = classifyProviderError(error);
    log("error", "chat.stream_error", { requestId, code: classified.code, error: String(error).slice(0, 300) });
    return JSON.stringify(classified); // the client parses this into an ApiError
  };

  log("info", "chat.request", { requestId, messages: messages.length, model: llm.config.model });

  const stream = createUIMessageStream<ChatUIMessage>({
    originalMessages: messages,
    onError: toErrorText,
    execute: ({ writer }) => {
      const tools = buildTools({
        service,
        latestUserText,
        onProfileChange: (data) => writer.write({ type: "data-profile", data, transient: true }),
      });

      const result = streamText({
        model: createModel(llm.config),
        instructions: buildInstructions(view),
        messages: modelMessages,
        tools,
        stopWhen: isStepCount(6),
        maxRetries: 2,
        onStepEnd: (step) =>
          log("info", "llm.step", {
            requestId,
            servedBy: step.response.modelId, // openrouter/free routes per request; record what actually ran
            finishReason: step.finishReason,
            toolCalls: step.toolCalls.map((t) => t.toolName),
            usage: step.usage,
          }),
        onToolExecutionEnd: (event) =>
          log("info", "tool.call", {
            requestId,
            tool: event.toolCall.toolName,
            ok: event.toolOutput.type === "tool-result",
          }),
        onEnd: (event) =>
          log("info", "llm.turn", {
            requestId,
            latencyMs: Math.round(performance.now() - started),
            steps: event.steps.length,
            usage: event.usage,
          }),
      });

      writer.merge(toUIMessageStream({ stream: result.stream, sendReasoning: false, onError: toErrorText }));
    },
  });

  return createUIMessageStreamResponse({ stream, headers });
}
