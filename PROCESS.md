# Development Process — Profile Builder

## Scope
Next.js + TypeScript, single-user travel profile builder.

## Timeline
Start:
End:
Approximate total time:

## Annotated AI Prompts

## Development Decisions

Planning decisions (made before writing code):

- **Provider:** Anthropic Claude first, to establish and test the full flow end to end. The provider and model are set through env vars behind one adapter, so other models (e.g. OpenRouter free models) can be benchmarked later without touching the agent code.
- **Extraction:** native tool calling (`updateProfile`) during the streamed turn, instead of a second extraction call. This saves one LLM call per turn and lets the profile panel update live.
- **Destination tool:** `getDestinationInfo` is a native tool. A `null` result is passed back to the model as "no data available," and the prompt forbids inventing facts.
- **Conflict detection, first version:** deterministic merge logic plus a hand-written incompatibility table.
- **Conflict detection, revised during the plan review:**
  - *Why it changed:* a table can't capture contradictions in meaning. "Steakhouse," "BBQ" and "jamón tasting" all contradict "vegetarian," and no table lists every variation.
  - *New model:* **the LLM detects** (`updateProfile` / `flagConflict`), **the server enforces** (`merge.ts` has no overwrite path, so any change to a stored value becomes a pending conflict), and **the user approves**.
  - *The decision:* every change to a stored value needs explicit user approval, including explicit corrections and refinements like vegetarian → vegan. I rejected "auto-apply with Undo" because whether the user was being "explicit" would be decided by the LLM.
  - *Resolution actions:* Approve, Keep current, or Clarify. Clarify adds context, and the agent may turn it into a revised proposal or treat it as a one-off exception.
  - *What's left:* if the LLM never notices a contradiction, nothing gets overwritten, but nothing gets surfaced either. This is a known gap, covered by evaluation prompts.
- **Persistence:** a JSON file behind a store interface, zod-validated on read. This is the simplest option for one user. Trade-off: not safe under concurrent writes and not suited to serverless.
- **How the assistant interviews:**
  - *Rejected:* one question per turn, because filling about 11 fields would take about 11 turns.
  - *Chosen:* free text plus grouped questions. Each turn extracts every field mentioned, then asks at most 2–3 related questions.
  - *Deferred:* starter chips (option B) went to the future plan. They would build an editable chat message instead of writing to the profile, which keeps one write path. Suggested-reply chips were deferred as costly and overlapping with B.
- **Destination facts:** "`getDestinationInfo` is the only source of truth" is read as also limiting what the model may say about *known* destinations. It doesn't add facts of its own.
- **Profile fields:**
  - *Starting point:* a 20-field list suggested by Google, cut to 15.
  - *Criteria:* each field must (a) change a destination recommendation, (b) ideally connect to `getDestinationInfo`, and (c) stay inside the core loop.
  - *Merged:* `travelStyle` (it overlaps with pace and interests, which would cause false conflicts) and `seasonality` (folded into the seasons field).
  - *Deferred:* the booking and flight fields, and `transitStyle` and `tripDuration`.
  - *Added from the list:* `splurgePriorities`, because it stops a false budget conflict ("budget, but luxury for special occasions").
  - *Two tiers:* the assistant asks about 7 core fields. The other fields are stored only when the user mentions them.
- **Stream contract:** the AI SDK's UI message stream with typed custom data parts, rather than a hand-rolled stream format. It's a well-known protocol and gives live profile updates for little extra code.
- **Approving in chat:** allowed, but the server applies a `resolveConflict` call only when its evidence quote appears word for word in the latest user message. This keeps the "the user approves" guarantee even though the LLM interprets the chat.
- **Runtime:** Node 24 LTS. Node 20 reached end-of-life in April 2026, and `ai@7` / `vitest@5` need Node ≥22.
- **Accessibility:**
  - *Decision:* a baseline (A1) is built into Phase 2 rather than left for polish: keyboard-only use, labelled controls, screen-reader announcements.
  - *Key choice:* streamed replies are announced only once complete, never token by token, because a screen reader would otherwise read out every fragment.
  - *Voice and audio:* judged not to fit 2 hours (uneven browser support, plus its own approval safety rule). It goes in the future plan in three stages: dictation, read aloud, full voice mode. Voice text always goes through the existing chat path.
- **Contract refinements made while writing Phase 0** (the plan was updated to match):
  - *One data part instead of four.* The plan had `profile-updated`, `conflict-detected`, `destination-looked-up` and `error`. Now there's a single **transient** `data-profile` part carrying a full snapshot plus a `changes` summary.
    - Transient means it isn't added to message history, so snapshots aren't echoed back to the server every turn.
    - A snapshot instead of a diff can't drift out of sync.
    - Destination lookups already appear as the SDK's typed tool parts.
    - Errors use the SDK's error channel and `ApiError`.
  - *LLM tool input is looser than the domain model, on purpose.* The tool accepts `{ field, op, value, evidence }` with any primitive value. The server checks the value against that field's schema and returns a readable `rejected` reason. A strict union of all 15 fields would make a single malformed item fail the whole tool call, and weaker models are prone to that.
  - *Updates are batched.* `updateProfile` takes a list of `updates`, so a message with several preferences needs one tool call instead of five. This helps the "extract everything" interview style (B4) on less reliable models.
  - *A conflict stores the full resulting value.* For a `change` conflict, `proposedValue` is what the field becomes on approval (e.g. `["vegetarian"] → []`), not the operation. The card can show "from X to Y", and applying the change is one assignment.
  - *Provenance is per field, not per list item* (last write wins). It's simpler, at the cost of explaining *which* item in a list came from where.
  - *`MergeResult` and `ProfileUpdateProposal` are TypeScript types only, with no zod schemas.* They never cross a runtime boundary, so validating them again would add nothing.
- **Phase 1 decisions** (found while writing the tests):
  - *List fields also accept `set`.* With only `add`/`remove`, "I'm vegan now" would either be applied as an `add` (silently leaving vegetarian + vegan) or split into two calls where half applies at once. A `set` that only adds items removes nothing, so it's applied like an `add`.
  - *Approving a stale conflict supersedes it.* If the field changed after the conflict was raised, approving its old `proposedValue` would silently drop the newer change. Instead the conflict is superseded and the agent re-asks.
  - *A contradiction can't be approved directly.* There's no value to apply, so the agent has to ask what should change.
  - *The chat-approval quote match is whole-word.* "yes" isn't found in "eyes". Fuzzy matching was rejected, because it would hand the judgment back to the model.
  - *Destination lookup is exact, never fuzzy.* I removed "Iceland" as an alias for Reykjavík: a country isn't its capital, and returning the wrong place's facts is worse than `null`.
  - *Store updates run one at a time.* The model can run tools in parallel within one turn. I verified the concurrency test fails when the queue is bypassed. A corrupt store file is moved aside, never deleted.
- **Provider env vars (option A):** the generic `LLM_API_KEY` / `LLM_MODEL` / `LLM_BASE_URL` from the existing `.env.example`, plus `LLM_PROVIDER` (`anthropic` | `openai-compatible`). Benchmarking an OpenRouter model later is then a config change, not a code change.
- **Provider order changed: OpenRouter first** (the user's call; Anthropic stays supported). Uses `@ai-sdk/openai-compatible` rather than the OpenRouter-specific SDK, so one code path covers any OpenAI-compatible endpoint.
- **Model benchmark, moved earlier from Phase 3** ([scripts/benchmark-models.ts](scripts/benchmark-models.ts)): the design depends on free models calling our tools correctly, so I measured that before building the agent on top of it.
  - *First run:* every model failed the same two checks, in the same way. That pointed at my setup, not the models. Showing what they actually sent revealed `budgetTier="mid-range"` and `dailyPace="slow"`. The loose tool schema never told the model which values are allowed.
    - *Fix:* a per-field `FIELD_GUIDE`, generated from the same enums as the schema and checked by the compiler to cover every field, so it can't drift.
    - *Also:* normalization of *spelling only* ("Mid Range" → `midRange`). Meaning ("slow" → `relaxed`) is never mapped in code; it's left to the model, guided by the field guide.
  - *Second issue:* the benchmark allowed only one step. The real agent can look up Lisbon and *then* flag the conflict, so the benchmark now runs up to 3 steps with stub tools that return the same rejection reasons as the real ones.
  - *A real app bug found along the way:* rate-limited calls were reported as generic `provider_error`, because the SDK wraps the final failure in a `RetryError`. Fixed with a test that reproduced it first.
  - *Results (2 runs, n is small):*

    | Model | Run 1 | Run 2 | Median latency |
    |---|---|---|---|
    | `openrouter/free` | 4/4 | 4/4 | ~9–14 s |
    | `nvidia/nemotron-3-ultra-550b-a55b:free` | 4/4 | 1/4 (rate-limited) | ~12 s |
    | `nvidia/nemotron-3.5-super-vl:free` | 3/4 (missed the contradiction) | — | ~7 s |
    | `google/gemma-4-31b-it:free` | 0/4 (rate-limited upstream) | — | — |

  - *Decision:* default to `openrouter/free`. Its routing works around rate-limited models, which mattered more in practice than any single model's quality.
    - *Accepted trade-off:* it isn't reproducible, since each request may hit a different model. Mitigation: log the model that actually served each request.
    - *Known cost:* multi-step turns take 5–15 s, sometimes ~27 s. Streaming makes this bearable, but it's slow. A paid model would be the first change at scale.
- **Chat history:** not persisted; only the profile is (which is all the requirements ask for). After a reload the chat starts fresh, and its greeting references the saved profile.

## Manual Review and Verification

## Trade-offs and Known Limitations

## Reflection

## Scaling to 10k Requests/Hour

## AI Tool Transcript Index