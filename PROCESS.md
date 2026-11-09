# Development Process — Profile Builder

## Scope
Next.js + TypeScript, single-user travel profile builder.

## Timeline

Taken from commit timestamps (2026-11-08, PST).

| Time | Phase | What happened |
|---|---|---|
| 21:21–21:28 | Setup | Scaffold, process file, requirements committed |
| 21:28–22:23 | **Planning (~55 min)** | MVP analysis, business clarifications, conflict model, interaction style, profile fields, accessibility. No code. Plan agreed and committed. |
| 22:24–22:35 | Phase 0–1 (~11 min) | Contracts, destinations, merge rules, proposal parsing, approval guard, store. All test-first. |
| 22:41–22:59 | Provider and benchmark (~18 min) | Switched to OpenRouter, benchmarked free models, found and fixed two bugs. Key incident (see prompt 8). |
| 23:05–23:13 | Phase 2 (~10 min) | Service, tools, instructions, routes, UI. Browser check. |
| 23:15 | Docs | README |
| *pending* | Live acceptance | Blocked by OpenRouter's free-tier daily quota (50 requests/day) |

Start: 21:21 · End: *TODO(you): fill in after the live run and docs* · Approximate total time: ~2 h so far, plus the live run and these docs.

**Where the time went:** half the budget went to planning, on purpose. The implementation went fast because the plan had already settled the hard questions (conflict semantics, contracts, scope). The overrun comes from the live run being blocked by the free-tier quota, not from rework.

## Annotated AI Prompts

Eight prompts where a real decision was made. The full transcript is in [`transcripts/`](transcripts/).

**1. "Analyze the assignment requirements and propose an MVP plan. Do not write code yet. Ask clarification questions."**
- *Goal:* understand scope before touching code.
- *Got back:* a must-have checklist, an architecture sketch, a two-hour time box, and four questions (provider, storage, how conflicts surface, chat history).
- *Kept / changed:* kept the structure. I answered "Anthropic first, benchmark others later", which I later reversed (prompt 7). I didn't let it start coding; next I asked for a written plan in the repo that we'd both work from.

**2. "Let's draft a plan… contract first, prioritize functionality and tests before the trade-offs, including UX design and model choices."**
- *Goal:* make the order of work explicit, so UX and model debates couldn't crowd out the core loop.
- *Got back:* `docs/plan.md` with phases 0–4, a table tracing each must-have to a phase and a verification step, and a manual acceptance script.
- *Kept / changed:* kept the phase order and the traceability table. Everything after this was checked against that plan.

**3. "Missing business requirement clarifications."**
- *Goal:* push back. The plan was technically solid but had quietly assumed answers to product questions.
- *Got back:* B1–B17. Is the profile lasting preferences or one trip? One traveler or a household? What counts as a contradiction? What does "references a destination" mean? Does tool data feed the profile?
- *Kept / changed:* kept the defaults where they were good. The useful outcome was seeing that "read-only view" versus conflict buttons (B7) touched a must-have. These became recorded assumptions instead of silent ones.

**4. "Let's discuss contradictions and explicit correction" → "ask for explicit approval before applying changes, and let users add context or clarifications."**
- *Goal:* settle the riskiest behavior in the spec.
- *Got back:*
  - A useful insight: code can guarantee no overwrite, but only the LLM can *notice* a contradiction like vegetarian → steakhouse. So "the LLM detects, the server enforces." It also dropped the hand-written incompatibility table it had proposed earlier.
  - A recommendation to **auto-apply explicit corrections with an Undo button**, guarded by a check that the quote matches.
- *Kept / changed:* kept "LLM detects, server enforces." **Rejected auto-apply.** Whether the user was being "explicit" would still be the LLM's judgment, and a wrong call is exactly the silent overwrite the spec forbids. Every change now needs approval, with a third option, *Clarify*. The quote-matching idea survived in a narrower form, as the guard on chat approvals (Q3).

**5. "Asking one question at a time could be very frustrating… options could be a quick starter list of selections" → "give me the pros and cons… user satisfaction, efficiency, technical difficulty" → "add B as a future plan."**
- *Goal:* question my own earlier default (B4), and make the trade-off visible before choosing.
- *Got back:* four options compared on those three dimensions, plus a catch I hadn't considered. Chips that write to the profile would bypass extraction and conflict detection and could break "read-only." The fix is chips that only build an editable chat message.
- *Kept / changed:* chose free text plus 2–3 grouped questions for the two hours. Starter chips went to the future plan, and suggested-reply chips were cut. Cost was the deciding factor.

**6. "Here are the fields Google recommended" (a 20-field list).**
- *Goal:* get a second opinion on the schema rather than accept the assistant's first draft.
- *Got back:* 15 fields in two tiers (asked about vs captured when mentioned), each kept or cut against three tests: does it change a recommendation, does it connect to `getDestinationInfo`, is it inside the core loop.
  - *Merged:* `travelStyle` into pace + interests, because two fields that can disagree cause false conflicts.
  - *Cut:* the booking fields, as out of scope.
  - *Kept:* `splurgePriorities`, which prevents a false budget conflict.
- *Kept / changed:* approved as proposed. Then I added *"accessibility should be there"*, which led to an accessibility baseline in Phase 2 (keyboard, screen reader, announcements on completed replies only) and a staged voice/audio roadmap for later.

**7. "Let's try OpenRouter first."**
- *Goal:* use a free provider and keep it configurable.
- *Got back:*
  - An env-driven adapter over one OpenAI-compatible code path, and a benchmark that runs our real tool schemas against candidate free models *before* any agent was built on top.
  - The first run failed identically on every model. Instead of blaming the models, it dug in: the loose tool schema never listed the allowed values, so models sent `"mid-range"` / `"slow"`. It also found that rate limits were misreported, because the SDK wraps them in `RetryError`.
- *Kept / changed:* kept both fixes: a field guide generated from the schema enums, and RetryError unwrapping. I chose `openrouter/free` on the evidence (8/8 over two runs), accepting that it isn't reproducible.
  - The first live turn then hit the **50 requests/day** free cap. The error said "wait a minute," which is wrong for a daily cap, and that was fixed too. I chose to wait for the reset rather than pay.

**8. The API key incident: "added to env.local" → "yes, I just went to revoke the key, now rotated with a new key."**
- *What happened:* I had pasted the real key into `.env.example`, which is committed, and the assistant staged it without looking. That's a tool failure worth recording.
- *Got back:* it caught the problem on its next check, confirmed nothing had been pushed, amended the local commit, scanned every commit, and added a test that fails if `.env.example` ever has a key value. It also flagged that its own `git diff` had printed the key into this transcript, so the key had to be rotated even though it never left the machine.
- *Kept / changed:* rotated the key and purged the old objects from git with `reflog expire` + `gc`. **The old key is redacted from the exported transcript.** *TODO(you): confirm the redaction before committing the transcript.*

## Decision Log (chronological)

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
- **First live turn found the real constraint: OpenRouter's free tier allows 50 free-model requests per day.** A chat turn uses 2–6 requests (one per tool step), so that's about 10–20 turns a day, and the benchmark had used most of it.
  - The pipeline itself worked end to end: the tool executed, the log recorded which model actually served the request, and the 429 was classified and streamed as a typed error.
  - *Bug:* the message said "wait a minute," which is wrong for a daily quota. It now names the daily limit and the real options. Fixed test-first.
- **Phase 2 structure:**
  - **Transport (routes):** validation only.
  - **Business logic:** `lib/profile/service.ts`, shared by the chat tools and the REST conflict route, so the card and the chat can't diverge.
  - **Agent glue:** `lib/agent/tools.ts`, with no profile rules in it.
  - **UI:** `components/`. It validates server responses with the same schemas the server uses.
- **`cacheComponents` is on in this Next 16 scaffold,** so a `GET` route can be prerendered at build time. `GET /api/profile` calls `await connection()` to make "always live" explicit.
- **Chat history:** not persisted; only the profile is (which is all the requirements ask for). After a reload the chat starts fresh, and its greeting references the saved profile.
- **Brand color theme (provided by me):** CTA `rgb(6,134,73)`, background `rgb(243,240,236)`, text `rgb(44,32,26)`, disabled `rgb(137,129,125)`.
  - *Contrast check first:* contrast was measured against WCAG AA before applying anything.
    - Two pairs fail for informational text: the disabled grey on the background (3.36:1), and green text on the background (4.10:1).
    - *Fix:* the disabled grey is kept for disabled controls, which WCAG exempts, and a darker tone of the same hue is derived for secondary text (4.88:1). Green appears as text only on white surfaces (4.65:1).
    - The bulk color swap also put the green "updated" label on a green tint (4.08:1); it was caught by recomputing and switched to ink.
  - *Implementation:* the colors are semantic tokens in `globals.css` (`brand`, `canvas`, `surface`, `ink`, `ink-muted`, `ink-disabled`, `line`), so the palette lives in one place. The app is now light-only, since the palette has no dark variant (a follow-up).
  - *Verified in the browser* with a seeded profile, no LLM needed: theme, contradiction card (Keep/Clarify only), disabled states, focus ring, and **Keep** persisted through the real REST route (`status: kept`, logged `via: ui`).

## Manual Review and Verification

**Verified, with evidence:**
- **111 automated tests**, no network. Targeted at what would hurt if it broke:
  - every conflict rule in `merge.ts` (including the vegetarian → steakhouse case, explicit correction, refinement, supersede, stale approval);
  - LLM-output parsing, and the chat-approval quote guard (including "yes" ≠ "eyes");
  - store concurrency and recovery from a corrupt file;
  - the tools, and route validation and error codes.
- **Tests that actually catch the bug:** I broke the store's write queue on purpose to confirm the concurrency test fails without it, then restored it.
- **Production build passes**, and `/api/profile` is built as dynamic (not prerendered).
- **Browser check:** the page renders, there are no console errors, the accessibility tree has landmarks, headings and labels, and the error path works end to end (a real 429 reaches the UI as the correct daily-quota message).
- **One live turn:** a real tool call, a step log recording which model served it, and a typed error streamed when the quota ran out.

**Not yet verified:** the full live acceptance script (plan, Phase 2, steps 1–9): multi-field extraction in the browser, a destination-informed follow-up, `null` handling, the steakhouse conflict through each resolution path, chat approval, reload, and the keyboard and VoiceOver pass. It's blocked on the free-tier daily quota. *TODO: record results here after the run.*

**What I reviewed by hand vs trusted:** *TODO(you): your own words. Be honest about where you read every line (e.g. `merge.ts`, `approval.ts`, the prompt) and where you skimmed (e.g. UI markup, Tailwind classes).* Two things the assistant flagged for me to check: the benchmark's "pass" criteria, and whether the system prompt's rules match the plan's B-decisions.

## Trade-offs and Known Limitations

The full table of decisions and trade-offs is in the [README](README.md#decisions-and-trade-offs). The ones I'd defend in review:
- **Approval for every change:** one extra click in exchange for a hard guarantee that nothing is silently overwritten.
- **`openrouter/free`:** availability over reproducibility, with the serving model logged. It's slow: 5–15 s per tool-using turn.
- **Loose tool input with strict server-side checks:** robust against weak models, at the cost of a less self-describing tool schema. That cost bit us, and is now mitigated by `FIELD_GUIDE`.
- **JSON file store with an in-process write queue:** right for one user and one process, wrong for anything bigger.
- **Biggest known gap: a missed contradiction is silent.** The server can stop an overwrite but can't notice what the model didn't. That needs an evaluation set.

## Reflection

*TODO(you): draft from the record below; rewrite in your own words before submitting.*

**Overall approach:** plan first, deliberately. About 55 of the first ~110 minutes went to planning with no code: requirements analysis, business clarifications, the conflict model, interaction style, fields, accessibility. That paid off: implementation took about 50 minutes, with very little rework, because the hard semantic questions (what is a conflict, who decides, what is read-only) were settled up front.

**Agent vs. me in control:** I held tight control of product decisions and pushed back when the assistant's default was reasonable but wrong for this product:
- auto-apply-with-undo was replaced by explicit approval;
- one question per turn was replaced by grouped questions;
- the 20-field schema was narrowed with stated reasons;
- accessibility was added as an acceptance criterion.

I let the agent drive implementation inside that frame, with test-first modules and small commits.

**What I'd do differently:**
- Budget the free-tier quota before benchmarking. The benchmark used most of the 50 daily requests needed for acceptance testing.
- Never paste a key into a committed file, even briefly. The guard test now covers this.
- Get a live end-to-end turn earlier. The schema-vocabulary bug and the daily cap both surfaced only against a real model.

## Scaling to 10k Requests/Hour

About 3 turns/second, each with 2–6 model calls and ~3k input tokens per call.

- **Model:** move off free routing to a fast paid model with reliable tool calling, pinned for reproducibility. Consider a small model for extraction-only turns and a larger one for conversation.
  - Use **prompt caching**: the instructions and field guide are static apart from the profile JSON, so put the static part first.
  - Fewer steps per turn: encourage parallel tool calls (lookup + update in one step) and cap steps.
- **Prompt and schema:**
  - Version the profile schema, with migrations rather than the current "reject unknown version."
  - Per-item provenance.
  - Move pending-conflict text out of the prompt into tool results if it grows.
- **State:** Postgres, a profile row per user with an optimistic-concurrency `version` column, replacing the in-process queue. Auth and multi-tenancy. Optionally store chat history.
- **Evaluation:**
  - An offline eval set of scripted conversations with expected tool calls and profile states. Measure extraction precision and recall, **contradiction recall** (the main gap), and approval-guard false accepts. Run it in CI on every prompt or model change.
  - Canary new models on a slice of traffic before switching.
- **Operations:**
  - The JSON logs already carry request ID, served model, token usage and latency per step. Ship them to a log pipeline and add `@ai-sdk/otel` traces.
  - Alert on rate-limit rate, tool rejection rate (a schema/prompt drift signal), and p95 turn latency.
  - Back off and fail over across providers via the adapter.
- **Cost guardrails:** per-user rate limits, max message length (already enforced), max steps per turn, and a token budget per turn.

## AI Tool Transcript Index

| Session | Tool | File | Notes |
|---|---|---|---|
| 1. Planning + implementation (this session) | Claude Code (VS Code extension) | *TODO(you): `transcripts/claude-code-session-1.*` via `/export`* | **Redact the revoked OpenRouter key** before committing (it appears in a `git diff` output, prompt 8) |
| Field list suggestion | Google (search AI answer) | n/a | The 20-field list pasted into prompt 6. Not exportable; quoted in the session transcript. |
| Inline completions | GitHub Copilot | n/a | Not exportable (see `transcripts/README.md`). *TODO(you): remove this row if unused.* |