# Profile Builder: Implementation Plan

Status: **agreed** (2026-11-08). Changes to this plan get recorded in PROCESS.md.
Source of truth for requirements: [`requirements.md`](requirements.md). Decisions and trade-offs are recorded in [`../PROCESS.md`](../PROCESS.md).

## Guiding order

1. **Contract first.** Define the types and runtime schemas that cross every boundary before writing any behavior.
2. **Functionality and tests.** Build the core loop behind those contracts. Unit tests come first for the logic that would hurt if it broke.
3. **Trade-offs last.** UX polish, model choice and benchmarking, and the nice-to-haves.

Each phase ends with something working and verifiable, plus one or more small commits whose messages explain the *why*.

---

## Requirement traceability

| # | Must-have (acceptance criterion) | Phase | Verified by |
|---|---|---|---|
| R1 | Streamed chat responses (tokens appear as they arrive) | 2 | Manual check in the browser; route smoke test |
| R2 | Structured profile extraction from the conversation | 2 | Tool-handler unit tests; manual script |
| R3 | Profile persists across reloads | 1–2 | Store unit tests (round-trip, corrupt file) |
| R4 | Read-only profile view inside the app | 2 | Manual check |
| R5 | Typed client↔server contract | 0 | Schema tests; shared imports on both sides |
| R6 | `getDestinationInfo` is called and its result used; `null` is handled sensibly | 1–2 | Unit tests; manual script (known and unknown destination) |
| R7 | Conflicts are surfaced, never silently overwritten | 1–2 | `merge` unit tests; manual script (vegetarian → steakhouse) |
| R8 | README runnable in under 5 minutes, with decisions | 4 | Fresh-clone dry run |
| R9 | Provider and model configurable, secrets out of the repo, credential failures handled | 2–3 | Manual runs: missing key, bad key |

### Our own acceptance criteria (not in the spec)

| # | Criterion | Phase | Verified by |
|---|---|---|---|
| A1 | **Baseline accessibility:** the core loop can be used by keyboard only and with a screen reader | 2 | `jsx-a11y` lint (bundled with `eslint-config-next`); manual keyboard-only run; quick VoiceOver pass (manual script step 9) |

### Nice-to-haves (only if there's time)

| # | Nice-to-have (from spec) | Where | Status |
|---|---|---|---|
| N1 | Structured logs for LLM calls and tool calls (model, latency, token counts, request IDs), as JSON to stdout | Phase 3 #2 | Planned. Each log line carries a `requestId` generated per chat turn. |
| N2 | Live profile updates *during* the turn, not after | Phase 2 (step 2 + step 5) | **Pulled into Phase 2.** It's nearly free: tool handlers emit a `profile-updated` / `conflict-detected` data part mid-stream, and the panel renders it immediately. |
| N3 | Handling the assistant changing its mind or correcting earlier extractions | Phase 1 (contracts + merge) | **Covered by the conflict model.** The assistant's own correction is just another `change` proposal and needs user approval. Each field stores its provenance (`evidence`, `updatedAt`), so the assistant can explain what it's correcting. |
| N4 | Anything else that shows judgment about the experience | Phase 2 + Future | Done in Phase 2: extract every field from one message and ask grouped questions (B4). Future: starter chips and suggested replies. |

---

## Business requirement clarifications (resolve before Phase 0)

`requirements.md` says: *"If anything is unclear, make an assumption and record it or send us a note before you start."*
Each item below gets one of two treatments:
- **Assume:** we record the assumption in PROCESS.md and the README.
- **Ask Vayo:** we send a note before starting.

Proposed defaults are in **bold**.

### Product scope

| # | Ambiguity in the spec | Why it matters | Proposed default |
|---|---|---|---|
| B1 | **"Durable" profile:** is it the traveler's lasting preferences, or the details of one upcoming trip? | Decides whether "Kyoto in April" is stored as a preference or as trip context. It also changes what counts as a conflict. | **Durable preferences only.** Trip-specific details (dates, a single destination) are discussed but kept as *context*, not stored as profile fields. Destinations go in a soft `destinationsOfInterest` list. |
| B2 | **Who is the traveler?** One person, or a group/household profile? | "My partner eats meat" isn't a contradiction of "I'm vegetarian." | **One traveler's profile.** Preferences of companions are noted as context, never as the user's own fields. |
| B3 | **What does a "complete" profile look like?** Does the assistant ever say it's done? | Affects how proactive the interview is and whether we show progress. | **There's no hard completion state.** The assistant works through the unfilled core fields, then switches to open-ended refinement. *(UX-level progress hint is a Phase 3 item.)* |
| B4 | **Assistant proactivity:** interview the user, or draft a profile and ask for corrections? (The spec leaves this to us.) | Shapes the system prompt and the first-run experience. | **Agreed: free text plus grouped questions.** The greeting invites the user to describe how they travel in their own words. Each turn extracts *every* field mentioned (several tool calls per turn), briefly confirms what was captured, then asks **at most 2–3 related questions** about the most useful remaining gaps. One question per turn was rejected as too tedious (~11 turns). Starter chips are a [future plan](#future-plan-not-in-the-2-hour-scope). |

### Conflicts

| # | Ambiguity | Why it matters | Proposed default |
|---|---|---|---|
| B5 | **What counts as a contradiction?** Is a one-off exception ("just this once, a steakhouse for my friend's birthday") a contradiction? | Too sensitive is nagging. Too lax is a silent overwrite, which the spec says is a failure. | **Agreed:** anything that would change or contradict a stored field is surfaced. A one-off exception the user describes as such doesn't touch the profile. See [Conflict model](#conflict-model-agreed). |
| B6 | **Explicit change of mind** ("I'm not vegetarian anymore"): conflict or update? | The spec's nice-to-have mentions "the user changing their mind." | **Agreed:** every change to a stored value needs **explicit user approval** before it's applied, even after an explicit correction. The user can also add context or clarify instead of approving. |
| B7 | **"Read-only view" vs. resolving conflicts in the UI.** Does a conflict card break "read-only"? | Could be read as violating a must-have. | **Agreed:** profile values are never edited in the panel. The conflict card is an *approval prompt* (Approve / Keep current / Clarify) for a change the user asked for in conversation. No Undo button and no inline editing. |
| B8 | **Conflict lifetime:** if the user ignores a conflict and keeps chatting, what happens? | Unresolved state must persist and stay visible. | **Pending conflicts persist across reloads,** stay visible in the panel, and the agent brings them up again at most once more. |

### Destination tool

| # | Ambiguity | Why it matters | Proposed default |
|---|---|---|---|
| B9 | **What counts as "references a specific destination"?** Countries, cities, regions, "somewhere in Southeast Asia"? | The spec says the tool *must* be called, and that's how it will be graded. | **Call it for any named place** (city, country, region). Vague areas ("somewhere warm") don't trigger it, and the assistant asks for a specific place instead. |
| B10 | **"Something sensible" for `null`.** | The spec says explicitly that it doesn't want hallucination. | **Say there's no data for that place,** don't state facts about it, keep the conversation going using the profile, and optionally suggest the known destinations that best fit. |
| B10a | **"`getDestinationInfo` is the only source of truth"** (from out-of-scope). Can the model add its own knowledge about a *known* destination? | The model may sound informed while mixing in unverified facts. | **No.** Destination facts in replies (seasons, budgets, visa notes, what a place is known for) come only from the tool result. The model may ask questions about the place, but doesn't assert outside facts. |
| B11 | **Does destination data feed the profile?** E.g. Kyoto's `bestSeasons` → the user's `preferredSeasons`? | Mixing tool facts into user preferences would corrupt the profile. | **Never directly.** Tool data only informs follow-up *questions* ("Kyoto is best in spring or fall — does that fit?"). Only the user's answer updates the profile. |
| B12 | **Which destinations?** (At least 5, our choice.) | Should cover the demo scenarios (diet, budget spread, visa notes). | **Kyoto, Lisbon, Mexico City, Reykjavik, Bali, New York City.** That mix covers a range of budgets, seasons and visa situations. |

### Budget and units

| # | Ambiguity | Proposed default |
|---|---|---|
| B13 | Currency for user budgets | **Stored as USD per day,** matching `averageDailyBudgetUSD`. Amounts in other currencies are kept as stated, and the assistant asks for a rough USD figure rather than converting. |
| B14 | Budget tier vs. a number | **Both fields are allowed.** The tier maps to the `budget`/`midRange`/`luxury` keys the tool uses. |

### Process and submission

| # | Ambiguity | Proposed default |
|---|---|---|
| B15 | Does the 2-hour budget include the README, PROCESS.md and transcripts? | **Assume yes.** Phase 4 is reserved for them. Report actual time honestly. |
| B16 | The doc says "Vayo" in some places and "Atlas" in others | Cosmetic. Use **"Vayo"** in the submission notes. |
| B17 | "Send us a note before you start" | Decide which of B1–B16 (if any) are worth emailing about. Proposal: **B7 only**, since it touches a must-have. Assume everything else. |

---

## Phase 0: Contracts (no behavior)

**Before Phase 0 (setup, ~5 min):**
- Switch to Node 24 LTS (the user is currently on 20.12, which reached end-of-life in April 2026).
- Add `.nvmrc` (`24`) and `"engines": { "node": ">=22.12" }`.
  - Reason: `ai@7` needs Node ≥22, and `vitest@5` needs ^22.12 or ≥24.
- Install `ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`, `zod`, `vitest`.
- **Read the installed AI SDK v7 docs before writing stream code.** Like the Next.js 16 note in AGENTS.md, v7's APIs may differ from what the assistant was trained on.

Goal: someone reading `src/lib/contracts/` knows everything that flows through the app.

Each boundary gets a **zod schema plus an inferred TS type**, defined in one place and imported by both client and server.

| Contract | Boundary | Notes |
|---|---|---|
| `DestinationInfo` | tool → agent | Required fields exactly as in the spec. Any extensions are optional additions. |
| `TravelProfile` | store ↔ server ↔ client | Field list below. Every field is optional/empty at the start. |
| `FieldProvenance` | store ↔ server ↔ client | Per field: `{ evidence, updatedAt }`. The quote that produced the value. Lets the assistant explain a correction (N3), and lets the panel show where a value came from. |
| `ProfileField` | shared | String-literal union of field keys, so updates can't target unknown fields. |
| `ProfileUpdateProposal` | LLM `updateProfile` tool input → server | `{ field, value, evidence }`. Validated, because LLM output is untrusted. |
| `ConflictFlag` | LLM `flagConflict` tool input → server | `{ field, observation, evidence }`, for a contradiction in meaning where the user didn't state a new value (vegetarian → steakhouse) |
| `ProfileConflict` | server → client | `{ id, kind: 'change' \| 'contradiction', field, currentValue, proposedValue?, evidence, status, clarifications[], createdAt }` |
| `ConflictStatus` | shared | `'pending' \| 'approved' \| 'kept' \| 'superseded'` |
| `MergeResult` | merge logic → caller | Discriminated union: `applied` (only when the field was empty or a list item was appended) \| `unchanged` \| `conflict` \| `rejected` |
| `ChatRequest` | client → `POST /api/chat` | Message history (user input is validated). |
| Chat stream events | server → client | Text deltas, the SDK's typed tool parts (so a destination lookup is visible without a custom part), and **one** transient `data-profile` part: a full `ProfileView` snapshot plus `changes` (updated fields, new conflict IDs) for announcements. *Refined in Phase 0 from four planned parts; see PROCESS.md.* |
| `ResolveConflictRequest` | client → `POST /api/profile/conflicts/:id` | `{ action: 'approve' } \| { action: 'keep' } \| { action: 'clarify', note: string }` |
| `ResolveConflictToolInput` | LLM `resolveConflict` tool input → server | `{ conflictId, action: 'approve' \| 'keep', evidence }`. `evidence` must appear word for word in the latest user message (Q3). |
| `ChatUIMessage` | client ↔ `/api/chat` | The AI SDK `UIMessage`, typed with our data-part schemas (Q2). It's the single type for the stream on both sides. |
| `ProfileResponse` | `GET /api/profile` → client | `{ profile, pendingConflicts }` |
| `ApiError` | any route → client | `{ code: 'missing_credentials' \| 'invalid_credentials' \| 'provider_error' \| 'bad_request', message }` |

### Profile fields (Q1, agreed)

The candidate list was a 20-field suggestion. Each field was judged on three criteria:
1. **Does it change a destination recommendation?** That's the whole point of the profile.
2. **Does it connect to `getDestinationInfo`?** (`bestSeasons`, `knownFor`, `averageDailyBudgetUSD`, `visaNotes`)
3. **Is it inside the core loop?** Bookings are out of scope.

A schema with 20 fields also costs us: a longer prompt, more extraction errors, more false conflicts, and a cluttered panel.

**Two tiers:**
- **Core:** the assistant asks about these proactively (2–3 at a time).
- **Captured:** stored when the user mentions them, never asked about.

| Field | Shape | Cardinality | Tier | Why |
|---|---|---|---|---|
| `homeAirport` | string (IATA code if given, e.g. `SEA`) | single | Core | Sets reachable destinations and flight lengths. More concrete than a city. |
| `budgetTier` | `'budget' \| 'midRange' \| 'luxury'` | single | Core | Maps 1:1 to the `averageDailyBudgetUSD` keys |
| `dailyBudgetUSD` | number | single | Captured | Compared directly against the tool's budget numbers |
| `splurgePriorities` | string[] | list | Captured | Handles "budget *and* luxury, depending on the occasion." The user splurging on fine dining isn't a conflict with a budget tier, which **prevents a false conflict**. |
| `dailyPace` | `'relaxed' \| 'balanced' \| 'packed'` | single | Core | Replaces both `pace` and the pace part of `travelStyle` |
| `interests` | string[] | list | Core | Matched against `knownFor`. Absorbs the rest of `travelStyle` ("cultural", "adventurous"). |
| `dietary` | string[] | list | Core | The canonical conflict case |
| `companions` | `('solo' \| 'partner' \| 'family' \| 'friends')[]` | list | Core | Changed from single to a list, because people travel in different setups |
| `preferredSeasons` | `Season[]` | list | Core | Matched against `bestSeasons`. Absorbs `seasonality` ("shoulder season"). |
| `climatePreference` | string[] | list | Captured | "Avoids humidity" is about climate, not season |
| `accommodation` | string[] | list | Captured | Affects budget estimates and style fit |
| `accessibilityAndMobility` | string[] | list | Captured | Can change where someone is able to travel. Shows care for the user. Never inferred, only stored when stated. |
| `destinationsOfInterest` | string[] | list | Captured | Every entry triggers `getDestinationInfo` |
| `pastDestinations` | string[] | list | Captured | Avoids re-suggesting places, and grounds "something like Tokyo" |
| `dealBreakers` | string[] | list | Captured | Renamed from `avoid`. Hard constraints that also feed conflict detection. |

**Cut from the suggestion, with reasons:**

| Field | Decision | Reason |
|---|---|---|
| `travelStyle` | Merged | Overlaps with `dailyPace` + `interests`. Two fields that can disagree would produce false conflicts. |
| `seasonality` | Merged into `preferredSeasons` | Same idea. School-holiday avoidance goes in `dealBreakers`. |
| `flightPreferences` | Future | No flight data in scope. It's a booking-time concern. |
| `loyaltyPrograms` | Future | Only matters for booking, which is out of scope. |
| `bookingLeadTime` | Future | A booking-workflow field, outside the core loop |
| `transitStyle` | Future | Useful, but `getDestinationInfo` has no transit data to match against. Easy to add later. |
| `tripDuration` | Future | Closer to a per-trip detail than a lasting preference (B1). Would matter for total-budget estimates. |

**Phase 0 tests:** schema accepts valid fixtures and rejects malformed ones (wrong enum, unknown field, missing required destination field).

**Done when:** contracts compile, schema tests pass, and no runtime code exists yet.
Commit: `feat(contracts): define shared schemas for profile, tools, and API`

---

## Phase 1: Core logic, test-first (pure, no LLM, no HTTP)

| Module | Responsibility | Tests |
|---|---|---|
| `lib/destinations/` | Hardcoded data for ≥5 destinations; `getDestinationInfo(name)` with case-insensitive and alias matching; `null` for unknown names | Known name, alias/case variant, unknown → `null`, every record passes the `DestinationInfo` schema |
| `lib/profile/merge.ts` | **The only place conflict rules live.** `mergeProposal(profile, proposal) → MergeResult` | See below |
| `lib/profile/store.ts` | `ProfileStore` interface plus a JSON-file implementation: atomic write (temp file + rename), zod-validated read, safe fallback when the file is corrupt | Round-trip, missing file → empty profile, corrupt file → empty profile plus a logged warning |

### Conflict model (agreed)

**Principle: the LLM detects, the server enforces, the user approves.**

- **Detection is the LLM's job.** Contradictions in meaning (vegetarian → steakhouse) can't be captured by a hand-written table. The system prompt always includes the current profile and pending conflicts. The LLM reports what it notices through one of two tools:
  - `updateProfile`, when the user states a value. If that changes a stored field, it becomes a `change` conflict.
  - `flagConflict`, when something the user said contradicts a stored field without stating a new value. This becomes a `contradiction` conflict.
- **Enforcement is the server's job.** There's no overwrite operation the LLM can reach. `mergeProposal` only applies a proposal when it fills an empty field or appends a new list item. Everything else becomes a `conflict` (or `unchanged`/`rejected`).
- **Approval is the user's job, always explicit.** This covers explicit corrections ("I'm not vegetarian anymore") and refinements (vegetarian → vegan) too. Nothing that changes a stored value is applied without the user saying yes.
- **Missed detection is the remaining risk.** If the LLM never notices a contradiction, nothing is overwritten, but nothing is surfaced either. Handled as a known gap with a small set of evaluation prompts. No incompatibility table.

### Rules in `merge.ts`

- **Single-value field:** empty → `applied`. Same value → `unchanged`. Different value → `conflict { kind: 'change' }`.
- **List field:** new item → `applied` (appended). Duplicate (after normalization) → `unchanged`. Removing or replacing an item → `conflict { kind: 'change' }`.
- **`flagConflict`** → always `conflict { kind: 'contradiction' }`, as long as the referenced field actually has a stored value. Otherwise `rejected`.
- **Invalid input** (unknown field, wrong type) → `rejected` with a reason the model can read.
- **Duplicate pending conflict** on the same field → the newer one supersedes the older (`superseded`), so only one is pending per field.

### Resolution: three actions, available in both the UI card and the chat

| Action | Effect |
|---|---|
| **Approve** | Applies `proposedValue`. For a `contradiction` with no proposed value, the agent first asks what the new value should be, and that answer becomes a `change` conflict needing approval. |
| **Keep current** | Discards the proposal. The profile doesn't change. |
| **Clarify** | Adds the user's note to `clarifications[]` and sends it into the conversation. The agent responds, and may supersede the conflict with a revised proposal (e.g. "only vegetarian at home" → a new proposal, again pending approval) or treat it as a one-off exception (→ `kept`). |

**Approving in chat (Q3, agreed: allowed, with a safeguard):**
- The agent calls `resolveConflict({ conflictId, action, evidence })`.
- The server applies it **only if** both of these hold:
  - the conflict is still `pending`;
  - `evidence` appears word for word (after trimming and ignoring case) in the **latest user message**.
- Otherwise the server returns `rejected: approval not found in the user's message`, and the conflict stays pending.
- The UI button always works.

The model can't invent an approval or reuse an old one. Clarifying in chat needs no tool: the user's message is the clarification, and the agent may propose a revised value.

**Merge tests:** one per rule above. Plus the canonical vegetarian → steakhouse case (contradiction), an explicit correction (still pending, not applied), a refinement (vegetarian → vegan → pending), a supersede, and a `splurgePriorities` entry that does *not* conflict with `budgetTier`.

**Approval-check tests** (`lib/profile/approval.ts`, pure): the evidence quote is in the latest user message → allowed; the quote is only in an older message → rejected; invented quote → rejected; conflict no longer pending → rejected.

**Done when:** all Phase 1 tests pass via `npm test`, with no network involved.
Commits: one per module, e.g. `feat(profile): conflict-aware merge with tests`

---

## Phase 2: Wire the core loop (functional end to end)

1. **Provider adapter** `lib/llm/provider.ts`
   - Reads `LLM_PROVIDER` (`anthropic` | `openai-compatible`), `LLM_MODEL`, `LLM_API_KEY` and an optional `LLM_BASE_URL` (option A, agreed). Names match the existing `.env.example`.
   - Returns a typed `missing_credentials` error instead of throwing deep inside a request.
   - Anthropic is the first provider.
2. **Agent tools** `lib/agent/tools.ts`
   - `getDestinationInfo`: a thin wrapper.
   - `updateProfile`: validates input, calls `mergeProposal`, persists, and returns a tool result the model can act on (`applied` / `CONFLICT: ask the user for approval` / `rejected: reason`).
   - `flagConflict`: records a `contradiction` conflict and tells the model to ask the user about it.
   - **Live updates (N2):** every tool handler that changes state emits a `profile-updated` or `conflict-detected` data part into the stream right away, so the panel updates while the assistant is still writing.
   - `resolveConflict`: chat approval, guarded by the word-for-word check in `approval.ts` (Q3).
3. **System prompt** `lib/agent/systemPrompt.ts`
   - Include the current profile and pending conflicts.
   - Rules:
     - Always call the destination tool when a destination is named.
     - Destination facts come **only** from the tool result (B10a). On `null`, say there's no data.
     - Extract every field in a message, then ask at most 2–3 grouped questions (B4).
     - Raise conflicts and wait for approval.
     - Politely decline bookings, payments and anything else outside the core loop.
4. **Routes**, as transport only (validate → delegate → stream):
   - `POST /api/chat`
   - `GET /api/profile`
   - `POST /api/profile/conflicts/:id`
5. **Minimal UI:** chat with streaming, a read-only profile panel that updates live from stream data parts, and conflict cards with Approve / Keep current / Clarify. Desktop layout that doesn't break at smaller widths. Functional, not pretty.
6. **Accessibility baseline (A1)**, built in from the start rather than as polish, ~15 min:
   - **Structure:** semantic landmarks (`main`, `section` with headings for the chat and the profile); the message input has a visible `<label>`; the profile is a definition list (`dl`), not a stack of divs.
   - **Keyboard:** Enter sends and Shift+Enter adds a new line. Every control is a real `<button>` with a visible focus ring. When a conflict card appears, focus **isn't** taken from the input; the card is reachable in tab order.
   - **Streaming and screen readers:** announcing every token would flood a screen reader. The message list has `aria-busy="true"` while a reply streams. The *completed* reply is announced through a polite live region.
   - **Live profile updates:** a polite live region announces a short summary, e.g. "Profile updated: dietary, budget tier".
   - **Conflicts:** new conflicts are announced politely. Button labels carry context: "Approve changing dietary from vegetarian to none", not just "Approve". The conflict state is shown with an icon and text, not only color.
   - **Errors:** credential or provider errors use `role="alert"`.
   - **Visual:** text contrast meets WCAG AA. The "just updated" highlight respects `prefers-reduced-motion`.

**Phase 2 tests:**
- Tool-handler tests with a fake store (conflict result surfaces correctly).
- Route-level validation test (bad request → `400 ApiError`).

**Manual acceptance script** (results recorded in PROCESS.md):
1. "I'm vegetarian, based in NYC, mid-range budget, and I like a slow pace." All four fields fill in from **one** message, and the panel updates **during** the streamed reply (N2). The assistant asks at most 2–3 follow-up questions.
2. "Thinking about Kyoto." The destination tool is called, and the reply uses *only* the tool's data (e.g. it asks whether spring or fall works).
3. "What about Atlantis?" The tool returns `null`, and the assistant says it has no data instead of inventing any.
4. "Can you recommend a steakhouse in Lisbon?" A contradiction is surfaced in chat and as a UI card. Check each action:
   - Keep current: profile unchanged.
   - Clarify with "it's for a friend's birthday": treated as a one-off, profile unchanged.
   - In a fresh run, "Actually I eat meat now": a pending change, not applied until Approve.
5. The assistant correcting itself (N3): say "budget is around $150/day, oh wait, more like $250." The final value is used. If a value was already stored, the correction becomes a pending change.
6. "Book it for me." The assistant declines and stays on the profile.
7. Reload. The profile and pending conflicts are still there.
8. Remove the API key or corrupt it. A clear UI error appears and nothing crashes.
9. **Accessibility (A1):** repeat steps 1 and 4 **with the keyboard only**, then with VoiceOver on. You can send messages, reach and use every conflict action, and hear the completed reply, the profile updates and the new conflict announced once each (not token by token).

**Done when:** R1–R7 and R9 pass the manual script.
Commits: one per numbered step.

---

## Phase 3: Trade-offs (time-boxed, only after Phase 2 is green)

In priority order. Stop wherever the clock runs out, and record what was cut.

1. **Error and partial-state UX:** stream interrupted mid-turn, provider 5xx, retry button.
2. **Structured JSON logs (N1):** model, latency, token counts, request ID, tool name and duration.
3. **UX design pass:** layout, empty states, a "just updated" highlight on profile fields, showing a field's provenance on hover.
4. **Model choice and benchmarking:** run the manual script against 1–2 alternative models (e.g. an OpenRouter free model). Record tool-call reliability (especially several tool calls per turn) and latency.
5. **Prompt tuning:** how questions are grouped, conflict wording, how firmly the "tool facts only" rule holds.

---

## Future plan (not in the 2-hour scope)

Documented in the README's "with another day" section.

| Item | What | Why deferred |
|---|---|---|
| **Starter selections (option B)** | First-visit chip groups (budget tier, pace, companions, seasons, ~8 interests, ~5 dietary), generated from the same zod enums as the schema. Chips **build an editable chat message** rather than writing to the profile, so extraction, conflicts and the read-only panel stay on the single write path. | ~15–20 min of UI from a tight budget. Free text plus grouped questions already covers the core loop. The architecture needs no changes to add it later. |
| **Suggested-reply chips (option D2)** | Tappable replies under assistant messages for questions with fixed options (e.g. pace). | ~30+ min. Needs a reliable "which field is being asked about" signal from the LLM. Its value overlaps with starter chips. |
| **Voice and audio support** | See [Voice and audio roadmap](#voice-and-audio-roadmap) below | Doesn't fit 2 hours well. Browser speech APIs are uneven, and voice needs its own safety rule for approvals. The architecture needs no changes for it: voice produces text that goes through the same chat path. |
| **More profile fields** | `flightPreferences`, `loyaltyPrograms`, `bookingLeadTime`, `transitStyle`, `tripDuration` | Booking-related or with no matching destination data. They become valuable once flight/booking or transit data exists. |
| **Evaluation set for conflict detection** | A scripted set of prompts that measures how often contradictions are missed | The main remaining risk of "the LLM detects" (see Conflict model) |

---

## Phase 4: Deliverables

- README: setup in under 5 minutes, env vars, provider/model, credential failure behavior, decisions, "with another day".
- PROCESS.md: 5–10 annotated prompts, reflection, scaling sketch, known gaps.
- Transcripts exported into `transcripts/`.
- A fresh-clone dry run.

---

### Voice and audio roadmap

**Principle:** voice is just another input and output for **the same chat path**. Speech becomes text before it reaches `/api/chat`. Extraction, conflicts, the approval check and the read-only panel stay the same.

| Stage | What | How | Effort | Notes |
|---|---|---|---|---|
| **V1. Dictation** | A mic button that transcribes into the message box. The user reviews and edits before sending. | The browser's Web Speech API (`SpeechRecognition`), with the button hidden when the browser doesn't support it | ~30 min | Supported in Chrome and Safari, not in Firefox. Chrome sends the audio to Google's servers, which needs a one-line privacy notice. |
| **V2. Read aloud** | A "play" button on each assistant reply, plus an optional auto-read setting | `speechSynthesis` (browser built-in, works offline) | ~20 min | Speak only *completed* replies, or one sentence at a time, never token by token. Stop playback when the user starts typing or talking. |
| **V3. Hands-free voice mode** | Talk continuously, interrupt playback by speaking, voice replies | Server-side speech-to-text and text-to-speech from the LLM provider or a dedicated speech API, streamed over WebSocket | Days | New concerns: cost per minute, how long audio is kept, microphone consent, latency budget. |

**Voice-specific rules (decide before V1):**
- **Approval over voice:** a misheard "yes" must not approve a change. A voice approval has to come back as a read-back ("Change dietary from vegetarian to none — confirm?"), confirmed by the button or a second spoken confirmation. The word-for-word check runs against the *transcript*, and the transcript is shown to the user.
- **Evidence quotes:** the stored quote is the transcript text, marked `source: 'voice'`, so wrong transcriptions can be traced.
- **Accessibility pays off twice:** the A1 live regions and labelled buttons are exactly what V2 and assistive tools rely on, so the baseline isn't wasted work.

## Explicitly not building

| Out of scope (from spec) | What it means for this plan |
|---|---|
| Auth, accounts, multiple users | One JSON profile file. No user IDs in the contracts. |
| Real travel data or third-party APIs | `getDestinationInfo` is the only destination source, *including* for the model's own claims (B10a). |
| Mobile or responsive polish | Desktop layout. Acceptance is only "doesn't break at smaller widths." |
| Bookings, payments, sharing, search history, anything beyond the core loop | The agent declines bookings (manual script step 6). Chat history isn't persisted. |
| Broad test coverage | Targeted tests only: contracts, `merge.ts`, store, destinations, tool handlers, route validation. |
| A polished product | Phase 3 is time-boxed. The future plan records what was cut. |

Also cut by our own decision: manual profile editing, Undo, starter chips and suggested replies (see Future plan).

---

## Open technical questions (need agreement before Phase 0)

Business questions are B1–B17 above. These technical ones follow from them.

- ~~Q1. Profile fields~~: **resolved.** 15 fields in two tiers (core / captured); 7 suggested fields cut, each with a reason.
- ~~Q2. Stream contract~~: **resolved.** AI SDK UI message stream with typed custom data parts.
- ~~Q3. Approving in chat~~: **resolved.** Allowed through `resolveConflict`, with the word-for-word check against the latest user message. The button always works.
- ~~Q4. List-field contradictions~~: **resolved.** The LLM detects through `flagConflict`; no incompatibility table.
- ~~Q5. Test runner~~: **resolved.** Vitest.
- ~~Q6. Node version~~: **resolved.** Node 24 LTS, pinned with `.nvmrc` and `engines` (see "Before Phase 0").
