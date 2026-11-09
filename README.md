# Profile Builder

A single-page app that builds a durable **travel profile** through conversation. You chat about how you travel. The assistant extracts structured preferences as it goes, looks up destinations you mention, and never silently overwrites something you said earlier: contradictions wait for your explicit approval.

Next.js 16 · TypeScript · Vercel AI SDK 7 · zod 4 · Vitest. The planning record is in [`docs/plan.md`](docs/plan.md), and the decision log, annotated prompts and reflection are in [`PROCESS.md`](PROCESS.md).

---

## Quick start (about 3 minutes)

Requires **Node 22.12+** (Node 24 LTS recommended; `.nvmrc` included). AI SDK 7 and Vitest 5 don't support Node 20.

```bash
nvm use                      # or any Node >= 22.12
npm install
cp .env.example .env.local   # then set LLM_API_KEY (and LLM_MODEL)
npm run dev                  # http://localhost:3000
```

The minimal `.env.local` for OpenRouter's free models ([get a key](https://openrouter.ai/keys)):

```
LLM_API_KEY=sk-or-...
LLM_MODEL=openrouter/free
```

> **Free-tier limit:** OpenRouter allows **50 free-model requests per day** on a key without credits. A chat turn uses 2–6 requests (one per tool step), so that's roughly 10–20 turns. Adding $10 of credit raises it to 1,000 a day, and the models stay free. When the quota runs out, the app says so.

The profile is stored in `data/profile.json` (git-ignored). Delete that file to start over.

```bash
npm test             # 111 unit/route tests, no network
npm run benchmark    # tool-calling benchmark against live models (uses your quota)
```

## Configuration

| Variable | Required | Default | Notes |
|---|---|---|---|
| `LLM_API_KEY` | yes | none | Never logged or sent to the client. |
| `LLM_MODEL` | yes | none | Must support tool calling. Benchmarked default: `openrouter/free`. |
| `LLM_PROVIDER` | no | `openai-compatible` | Or `anthropic` (e.g. `LLM_MODEL=claude-haiku-5-5`). |
| `LLM_BASE_URL` | no | `https://openrouter.ai/api/v1` | Any OpenAI-compatible endpoint (Groq, Ollama, …). Ignored for `anthropic`. |
| `PROFILE_STORE_PATH` | no | `data/profile.json` | Where the profile JSON is written. |

### When credentials or the provider fail

| Situation | What you see | HTTP |
|---|---|---|
| No `LLM_API_KEY` | "No API key configured. Set LLM_API_KEY…" (no Retry button) | 500 `missing_credentials` |
| Unknown provider / bad base URL / no model | Names the variable to fix | 500 `misconfigured` |
| Key rejected (401/403) | "The provider rejected the API key…" | 502 `invalid_credentials` |
| Rate limited (429) | "Wait a minute" or, for daily quotas, "the daily quota is used up" | 429 `rate_limited` |
| Anything else from the provider | Generic message plus Retry; details only in server logs | 502 `provider_error` |

Config errors are caught before any LLM call. Errors during a stream arrive as a typed `ApiError` and are shown in the chat. Raw provider errors are never shown to the user.

---

## How it works

```
Browser (React)                         Server (Next.js route handlers)
───────────────                         ───────────────────────────────
ChatPanel ── useChat ── POST /api/chat ─▶ validate → instructions + tools → streamText
   ▲   tokens + tool parts (SSE) ◀──────── │        │
   │   data-profile parts (live) ◀──────── │   lib/agent/tools.ts (thin adapters)
ProfilePanel                               │        │
   ▲                                       │   lib/profile/service.ts  ◀── also used by:
ConflictCard ─ POST /api/profile/conflicts/:id ─────┘        │
   ▲                                                         ├─ proposal.ts (validate LLM output)
useProfile ─── GET /api/profile                              ├─ merge.ts   (ALL conflict rules, pure)
                                                             ├─ approval.ts (chat-approval guard)
                                                             └─ store.ts   (JSON file, serialized writes)
```

- **Typed contract** ([`src/lib/contracts/`](src/lib/contracts/)): every boundary (client↔server, LLM↔server, server↔disk) is a zod schema with an inferred type, imported by both sides. The chat stream is the AI SDK's `UIMessage` typed with our tool and data-part types (`ChatUIMessage`).
- **Extraction** uses native tool calling. `updateProfile` takes a *batch* of `{ field, op, value, evidence }`, so one message with five preferences is one call. The tool input is deliberately looser than the domain model: the server checks each value against that field's schema and returns a readable rejection, so one malformed item doesn't fail the whole call.
- **Live updates:** every tool that changes state streams a *transient* `data-profile` part (a full snapshot plus what changed). The panel updates while the reply is still streaming, and snapshots never pile up in message history.
- **Destination tool:** `getDestinationInfo` has exact-match lookup (name or alias; case, diacritics and "City, Country" normalized) and is never fuzzy, because a wrong match hands the agent another place's facts. On `null`, the tool tells the model it has no data, forbids inventing facts, and lists the destinations it does know. The prompt allows destination facts **only** from the tool, even for famous places. Tool use is shown in the chat ("Looked up Kyoto").

### Conflict handling: the LLM detects, the server enforces, the user approves

All rules live in one pure module, [`merge.ts`](src/lib/profile/merge.ts):

- Filling an empty field or appending a new list item is applied immediately.
- **Any change that removes or replaces a stored value becomes a pending conflict.** No code path the model can reach overwrites a stored value.
- A *semantic* contradiction (stored vegetarian, then "recommend a steakhouse") can only be spotted by the model, so it calls `flagConflict`, which records a `contradiction` with nothing to apply.
- You decide on the card (**Approve / Keep / Clarify**) or in chat. A chat approval goes through `resolveConflict`, which the server applies **only if the model's quoted evidence appears word for word in your latest message**. The model can't invent an approval or reuse an earlier "yes."
- Clarify adds your note to the conversation; the agent may propose a revised value (again pending) or treat it as a one-off.
- Explicit corrections ("I'm not vegetarian anymore") and refinements (vegetarian → vegan) also need approval. That was a deliberate choice over auto-apply-with-undo, because who counts as "explicit" would otherwise be decided by the LLM.
- Approving a stale conflict (the field changed after it was raised) supersedes it instead of overwriting the newer value.

---

## Decisions and trade-offs

The full reasoning, including what changed during planning and why, is in [PROCESS.md](PROCESS.md).

| Decision | Trade-off accepted |
|---|---|
| **OpenRouter `openrouter/free`** as default, chosen by benchmark (8/8 over two runs; fixed free models were rate-limited or missed the steakhouse case) | Not reproducible: each request may hit a different model. The served model is logged per step. Multi-step turns take 5–15 s, sometimes ~27 s. |
| **One OpenAI-compatible code path** (+ Anthropic) behind env vars | Provider-specific features (OpenRouter routing preferences, Anthropic caching) aren't used. |
| **JSON file store**, writes queued one at a time, atomic writes, corrupt file moved aside (never deleted) | Single process only; multiple instances would need a database or file lock. |
| **15 profile fields in two tiers** (7 asked about, 8 captured when mentioned), narrowed from a 20-field draft | Booking-related fields (flights, loyalty, lead time) and `transitStyle` / `tripDuration` were cut, each with a reason in the plan. |
| **Free text plus 2–3 grouped questions per turn**, not one question at a time | Depends on the model following the prompt; weaker models drift. |
| **Approval for every change**, even explicit ones | One more click when you're certain, in exchange for a hard "never silently overwrite" guarantee. |
| **Chat history not persisted** (only the profile, as the spec requires) | After a reload the conversation restarts; the greeting summarizes what's saved. |
| **Static greeting**, no LLM call on page load | Less personal than a generated greeting, but free and instant. |

### Accessibility (our own acceptance criterion)

- **Keyboard:** every action works by keyboard, with a visible focus ring. Enter sends; Shift+Enter adds a new line.
- **Screen readers:** landmarks, headings and labelled controls. The conversation is **not** a live region, because streamed tokens would flood a screen reader. Instead, one polite announcer reads the *completed* reply, profile changes ("Profile updated: Dietary needs") and decisions.
- **Conflict cards:** buttons carry full context ("Approve changing Budget tier from mid-range to luxury"). Conflicts are marked with an icon and text, not color alone.
- **Motion:** the "updated" highlight respects reduced motion.

---

## Known gaps

- **Missed detection is the main remaining risk.** If the model never notices a contradiction, nothing is overwritten, but nothing is surfaced either. It needs an evaluation set, not more rules.
- **Live acceptance run:** the manual script ([plan, Phase 2](docs/plan.md)) is partly done. The error paths were checked in the browser, and one live turn showed the tool call, logging and typed error. The full conversational run is pending the free-tier daily reset; see PROCESS.md for the status.
- No automated end-to-end or UI tests. UI behavior was checked manually in the browser.
- Provenance is per field (last write), not per list item.
- The JSON store doesn't suit serverless or multi-instance deployment.

## With another day

1. An **evaluation set** for conflict detection and extraction (scripted conversations with expected tool calls), run across models in CI. It would grow out of `scripts/benchmark-models.ts`.
2. **Starter chips** for first-time users. They'd build an editable chat message rather than write to the profile, so they reuse the single write path.
3. A paid default model for latency, plus prompt caching for the long system prompt.
4. SQLite or Postgres instead of the JSON file, and chat history persistence.
5. Voice input and read-aloud (staged plan in [docs/plan.md](docs/plan.md)).

## Project structure

```
src/
  app/
    page.tsx                         renders <ProfileBuilder/>
    api/chat/route.ts                stream endpoint (transport only)
    api/profile/route.ts             GET ProfileView
    api/profile/conflicts/[id]/      POST approve | keep | clarify
  components/                        ProfileBuilder, ChatPanel, ProfilePanel, ConflictCard, useProfile
  lib/
    contracts/                       zod schemas + types for every boundary (incl. FIELD_GUIDE)
    agent/                           tools.ts (model ↔ domain adapters), instructions.ts (system prompt)
    profile/                         service, merge (conflict rules), proposal, approval, store, format
    destinations/                    hardcoded data + getDestinationInfo
    llm/provider.ts                  env config, model factory, error classification
    server/                          HTTP error mapping, per-process profile service
    chat/errors.ts                   client-side parsing of typed errors
scripts/benchmark-models.ts          live tool-calling benchmark
docs/plan.md                         agreed plan, requirement traceability, clarifications
```
