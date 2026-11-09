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
- **Chat history:** not persisted; only the profile is (which is all the requirements ask for). After a reload the chat starts fresh, and its greeting references the saved profile.

## Manual Review and Verification

## Trade-offs and Known Limitations

## Reflection

## Scaling to 10k Requests/Hour

## AI Tool Transcript Index