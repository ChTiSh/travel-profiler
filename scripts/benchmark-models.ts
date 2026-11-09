/**
 * Tool-calling benchmark for candidate models, using the app's REAL tool
 * schemas (no tool implementations: we only check the calls a model emits).
 *
 *   npm run benchmark                         # default candidates
 *   npm run benchmark -- some/model:free ...  # specific models
 *
 * Reads LLM_* from .env.local (the --env-file flag in package.json). Prints one
 * line per case and a summary table. The API key is never printed.
 */
import { generateText, tool, type ToolSet } from "ai";
import {
  FlagConflictInputSchema,
  GetDestinationInfoInputSchema,
  UpdateProfileInputSchema,
} from "@/lib/contracts";
import { getDestinationInfo } from "@/lib/destinations";
import { classifyProviderError, createModel, readLlmConfig } from "@/lib/llm/provider";
import { parseUpdateItem } from "@/lib/profile/proposal";

const DEFAULT_CANDIDATES = [
  "openrouter/free", // router: picks a free model per request, so results can vary run to run
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-31b-it:free",
];

const tools = {
  getDestinationInfo: tool({
    description: "Look up data for a named destination. Call it whenever the user names a specific place.",
    inputSchema: GetDestinationInfoInputSchema,
  }),
  updateProfile: tool({
    description: "Record travel preferences the user stated. Batch every preference from one message into one call.",
    inputSchema: UpdateProfileInputSchema,
  }),
  flagConflict: tool({
    description:
      "Call when the user says something at odds with a STORED profile value without stating a new value.",
    inputSchema: FlagConflictInputSchema,
  }),
} satisfies ToolSet;

const INSTRUCTIONS = (profile: string) => `You build a traveler's durable travel profile through conversation.
Use the tools; do not just reply in text when a tool applies.
Current stored profile (JSON): ${profile}`;

type Case = {
  name: string;
  profile: object;
  message: string;
  check: (calls: { toolName: string; input: unknown }[]) => Promise<string | null>; // null = pass
};

const CASES: Case[] = [
  {
    name: "multi-field extraction",
    profile: {},
    message: "I'm vegetarian, I fly out of SEA, mid-range budget, and I like a slow pace.",
    async check(calls) {
      const items = calls
        .filter((c) => c.toolName === "updateProfile")
        .flatMap((c) => UpdateProfileInputSchema.parse(c.input).updates);
      const valid = new Set(items.filter((i) => parseUpdateItem(i).ok).map((i) => i.field));
      const want = ["dietary", "homeAirport", "budgetTier", "dailyPace"];
      const missing = want.filter((f) => !valid.has(f as never));
      return missing.length ? `missing/invalid fields: ${missing.join(", ")}` : null;
    },
  },
  {
    name: "known destination lookup",
    profile: {},
    message: "I'm thinking about Kyoto for my next trip.",
    async check(calls) {
      const c = calls.find((x) => x.toolName === "getDestinationInfo");
      if (!c) return "getDestinationInfo not called";
      const info = await getDestinationInfo(GetDestinationInfoInputSchema.parse(c.input).name);
      return info?.name === "Kyoto" ? null : "called with a name that doesn't resolve to Kyoto";
    },
  },
  {
    name: "unknown destination lookup",
    profile: {},
    message: "What about Atlantis?",
    async check(calls) {
      return calls.some((x) => x.toolName === "getDestinationInfo") ? null : "getDestinationInfo not called";
    },
  },
  {
    name: "contradiction (vegetarian -> steakhouse)",
    profile: { dietary: ["vegetarian"], budgetTier: "midRange" },
    message: "Can you recommend a good steakhouse in Lisbon?",
    async check(calls) {
      const flagged = calls.some(
        (x) => x.toolName === "flagConflict" && FlagConflictInputSchema.parse(x.input).field === "dietary",
      );
      const removed = calls.some(
        (x) =>
          x.toolName === "updateProfile" &&
          UpdateProfileInputSchema.parse(x.input).updates.some((u) => u.field === "dietary"),
      );
      if (flagged) return null;
      return removed ? "changed dietary via updateProfile instead of flagging" : "contradiction not flagged";
    },
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const base = readLlmConfig();
  if (!base.ok) {
    console.error(`Config error (${base.error.code}): ${base.error.message}`);
    process.exit(1);
  }
  const models = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_CANDIDATES;
  const summary: Record<string, { pass: number; total: number; ms: number[] }> = {};

  for (const model of models) {
    summary[model] = { pass: 0, total: CASES.length, ms: [] };
    for (const c of CASES) {
      const started = performance.now();
      let verdict: string | null;
      try {
        const result = await generateText({
          model: createModel({ ...base.config, model }),
          instructions: INSTRUCTIONS(JSON.stringify(c.profile)),
          prompt: c.message,
          tools,
          maxRetries: 1,
        });
        const calls = result.toolCalls.filter((t) => !t.invalid);
        const invalid = result.toolCalls.length - calls.length;
        verdict = await c.check(calls);
        if (verdict === null && invalid > 0) verdict = `passed, but ${invalid} call(s) had schema-invalid input`;
      } catch (err) {
        verdict = `error: ${classifyProviderError(err).code}`;
      }
      const ms = Math.round(performance.now() - started);
      summary[model].ms.push(ms);
      if (verdict === null) summary[model].pass++;
      console.log(`${verdict === null ? "PASS" : "FAIL"}  ${model}  ${c.name}  ${ms}ms${verdict ? `  (${verdict})` : ""}`);
      await sleep(1500); // free tiers rate-limit hard
    }
  }

  console.log("\nmodel".padEnd(50), "pass", "  median latency");
  for (const [model, s] of Object.entries(summary)) {
    const median = [...s.ms].sort((a, b) => a - b)[Math.floor(s.ms.length / 2)];
    console.log(model.padEnd(49), `${s.pass}/${s.total}`, `  ${median}ms`);
  }
}

main();
