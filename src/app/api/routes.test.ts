import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiErrorSchema, ProfileViewSchema } from "@/lib/contracts";
import { getProfileService, resetProfileServiceForTests } from "@/lib/server/profile";
import { POST as chat } from "./chat/route";
import { POST as resolveConflict } from "./profile/conflicts/[id]/route";

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("PROFILE_STORE_PATH", join(await mkdtemp(join(tmpdir(), "routes-")), "profile.json"));
  resetProfileServiceForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const post = (body: unknown) =>
  new Request("http://test.local", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(ApiErrorSchema.parse(await res.json()).error.code).toBe(code);
}

const userMessage = (text: string) => ({ id: "m1", role: "user", parts: [{ type: "text", text }] });

describe("POST /api/chat (no network: everything here fails before the LLM call)", () => {
  it("missing API key → 500 missing_credentials, with a request id header", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("LLM_MODEL", "m");
    const res = await chat(post({ messages: [userMessage("hi")] }));
    await expectError(res, 500, "missing_credentials");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  describe("with config present", () => {
    beforeEach(() => {
      vi.stubEnv("LLM_API_KEY", "test-key");
      vi.stubEnv("LLM_MODEL", "test-model");
    });

    it.each([
      ["non-JSON body", "{nope"],
      ["no messages", { messages: [] }],
      ["malformed message", { messages: [{ role: "user" }] }],
      ["last message not from the user", { messages: [{ id: "a", role: "assistant", parts: [{ type: "text", text: "hi" }] }] }],
      ["empty text", { messages: [userMessage("   ")] }],
      ["too long", { messages: [userMessage("x".repeat(5000))] }],
    ])("%s → 400 bad_request", async (_case, body) => {
      await expectError(await chat(post(body)), 400, "bad_request");
    });
  });
});

describe("POST /api/profile/conflicts/:id", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it("unknown conflict → 404 not_found", async () => {
    await expectError(await resolveConflict(post({ action: "keep" }), params("nope")), 404, "not_found");
  });

  it("invalid action → 400 bad_request", async () => {
    await expectError(await resolveConflict(post({ action: "replace" }), params("x")), 400, "bad_request");
  });

  it("approve applies the change and returns the new view; a second decision → 409", async () => {
    const service = getProfileService();
    await service.applyUpdates([{ field: "budgetTier", op: "set", value: "budget", evidence: "budget" }]);
    const { results } = await service.applyUpdates([
      { field: "budgetTier", op: "set", value: "luxury", evidence: "luxury" },
    ]);
    const id = results[0]!.conflictId!;

    const res = await resolveConflict(post({ action: "approve" }), params(id));
    expect(res.status).toBe(200);
    const view = ProfileViewSchema.parse(await res.json());
    expect(view.profile.budgetTier).toBe("luxury");
    expect(view.pendingConflicts).toEqual([]);

    await expectError(await resolveConflict(post({ action: "keep" }), params(id)), 409, "conflict_not_pending");
  });
});
