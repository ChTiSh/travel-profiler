Vayo
Assignment
Take-Home Exercise - Profile Builder
Role: Full-Stack Engineer 
Estimated time: ~2 hours 
Stack: Your choice; we use Next.js + TypeScript, and you'll have the smoothest review if you stay close to that, but pick what lets you do your best work in 2 hours.


Why we're asking you to do this
We want to see how you build, not just what you build. In 2 hours you can't ship a polished product, and we're not asking you to. We're asking you to make a small, real thing well; with the same care for naming, structure, commits, and trade-off explanations that you'd bring to a feature on your first week at Atlas.

You can (and should) use whatever AI coding tools you normally use. We're more interested in your judgment, taste, and clarity than your typing speed. The deliverable here is your process as much as the artifact.


LLM Provider and Credentials
We won't provide an API key; provider choice and integration are part of the exercise. Use any LLM you want. Make the provider/model configurable, keep secrets out of the repo, and document setup in your README so we can see which provider/model you used, what env vars are required, and what happens when credentials are missing or invalid.

You don't need a paid key. Most major providers have free tiers or trial credits. OpenRouter has free models (https://openrouter.ai/collections/free-models) but they vary in quality and tool-call reliability. If you go with a flaky free model, that shows up in how robust your app is; document the trade-off.


The Task
Build a single-page web app called Profile Builder that helps a traveler create a durable "travel profile" through conversation.

The shape of it:

A chat interface where the user talks to the assistant about their travel preferences.

As the conversation progresses, the assistant extracts structured fields and builds a profile.

A read-only view in the UI that lists the current travel preferences. Side panel, section below the chat, separate page — your call on placement, but it should be part of the app, not a debug route.

The profile persists across reloads.


Must have
A working chat UI with streamed assistant responses (tokens appear as they arrive).

The assistant extracts structured profile data from the conversation. Pick your approach: tool/function calling, structured outputs, JSON mode, a second extraction call, whatever you can defend.

The profile persists (SQLite, a JSON file, Vercel KV, Postgres, or any other) and survives a page reload.

A read-only view in the UI that lists the current travel preferences. Placement is your call (panel, section, separate page), but it has to be part of the app.

A typed contract between client and server. We should be able to read your API and know what's flowing.

A destination tool your app calls. Whenever the conversation references a specific destination, the app must call getDestinationInfo and use the result to ask informed follow-up questions. Contract example below.

Conflict detection. When new conversation contradicts an already-extracted profile field (e.g., the user said "vegetarian" earlier, now mentions a steakhouse), the agent must surface the contradiction rather than silently overwriting. How you surface it — ask the user, flag it in the UI, propose a resolution — is your call.

A README.md that gets us running in under 5 minutes and walks us through your decisions.

The destination tool
You'll implement this in your codebase; it's a stand-in for what would be a real travel data API.

async function getDestinationInfo(name: string): Promise<DestinationInfo | null>

type DestinationInfo = {
  name: string;
  bestSeasons: Array<'spring' | 'summer' | 'fall' | 'winter'>;
  knownFor: string[]; // e.g., ["food", "architecture", "hiking"]
  averageDailyBudgetUSD: { budget: number; midRange: number; luxury: number };
  visaNotes?: string;
};

Hardcode data for at least 5 destinations of your choosing. Return null for unknown destinations — and make sure your agent does something sensible with that case rather than hallucinating. Feel free to extend the schema if it makes the conversation richer; just keep the function name and the existing fields.

Native LLM tool-calling is welcome but not required. An explicit orchestration step (detect the destination in app code, call the function, inject the result back into the prompt) is also fine if you can defend it.



Nice to have (only if you have time)
Structured logs for LLM calls and tool calls (model, latency, token counts, request IDs). JSON to stdout is fine.

Live updates to the profile view as the conversation progresses (vs. only after the turn completes).

Handling for the assistant changing its mind or correcting earlier extractions.

Anything else that shows judgment about the experience.

Explicitly out of scope
Authentication, accounts, or any notion of multiple users; assume one user.

Real travel data or third-party travel APIs; getDestinationInfo is the only source of truth.

Mobile or responsive polish. Desktop only; "doesn't break at smaller widths" is plenty.

Bookings, payments, sharing, search history, or any feature beyond the core loop.

Test coverage. A few targeted tests on parts that would hurt if they broke is welcome; full coverage is not.

A "polished" product. Two hours is short; cutting scope intelligently is part of the exercise.

Your call (we want to see how you decide)
What fields belong on a travel profile, and why those.

How proactive the assistant is — does it interview the user, or does it draft a profile and ask for corrections?

How and where the profile view sits in the layout.

How you handle ambiguity, contradictions, or the user changing their mind.

Where you stop. Two hours is the budget; cutting scope intelligently is part of the exercise.



The Process Deliverable
This is the part most candidates underweight, and it's the part we read most carefully. The goal is to give us a window into how you think with these tools.



1. Full session transcript(s)
Every prompt you sent and every response you got back, in order. Most assistants can export this:

Claude Code: /export or share the .jsonl from the session

Cursor: export chat

Codex CLI: commit the raw session file from ~/.codex/sessions/, or use jinghan23/codex-export for markdown

If you used multiple sessions or tools, include all of them, labeled. If you used spec-driven development, include the spec files too. If your tool doesn't support export (e.g. inline Copilot completions, tab-completes), say so and skip it. We'd rather have an honest gap than a reconstructed one.



2. Annotated highlights — 5 to 10 prompts in PROCESS.md
Pick the prompts where you made a real decision: scoping the schema, choosing an extraction approach, debugging a streaming bug, handling a conflict case, deciding what to cut. For each, two or three lines on:

What you were trying to do

What the tool gave you back (briefly)

What you kept, changed, or threw away — and why

This is the highest-signal part of the submission. Treat it like a code review comment.



3. A short reflection (same PROCESS.md)
Your overall approach. Did you plan first, or dive in? Did you let the agent drive, or stay in tight control? Why?

What you reviewed by hand vs. trusted. Where did you read every line? Where did you skim? Where (honestly) did you ship something you didn't fully verify?

What you'd do differently next time.

If this had to run at scale. What would you change about model choice, prompting, schema, or eval strategy if this were serving 10k requests an hour? Don't implement it, just sketch your thinking.

4. The repo itself
A public GitHub or GitLab repo with the working code, README, and PROCESS.md. Runnable in under 5 minutes from a clean clone.



What we're evaluating
We care about your judgment in the loop, not your typing speed. Roughly in the order it shapes our impression:

The annotated prompts. Clarity of thought, willingness to push back on the model, good taste about when to write something yourself rather than prompting for it.

Commit history. Small, focused commits with messages that explain the why. One giant "initial commit" tells us very little. We're are dogmatic about being able to read your work as a story.

README. Setup steps that work. A short section on the decisions you made and the trade-offs you accepted. A short section on what you'd do with another day.

Code structure. Where things live and why. Separation between transport, business logic, and UI. Naming that doesn't make us hover over things.

Types and API contract. Are client and server speaking the same language? Are runtime boundaries (LLM output, user input, persisted data) validated? We're looking for taste, not maximum strictness.

Streaming and AI integration. Does the streaming actually work end-to-end? Is the extraction robust to the LLM occasionally being weird? How do you handle errors and partial state? How does the tool call thread back into the conversation — does the agent actually use what getDestinationInfo returned, or does it ignore it?

Conflict handling. Conflicts are a place where lazy implementations show up fast. We'll look for: do you detect the conflict at all, do you handle it in a way that respects the user, and is the implementation localized or scattered across the codebase?

What you cut and why. Two hours is short on purpose. We want to see deliberate scope decisions, not panicked omissions.

What you didn't build. A short list of known gaps and how you'd address them is a strong positive signal.

Provider choice and configuration. We are not evaluating which paid model you have access to. We are evaluating whether you made a reasonable provider choice, kept credentials out of the repo, documented setup cleanly, and handled model/API failure modes thoughtfully.

Be honest about what you didn't fully understand or verify. If you copy-pasted a chunk of code from a prompt without reading it carefully, say so. Don't ship code you can't explain.


Questions
If anything is unclear, make an assumption and record it or send us a note before you start rather than guessing. 


Submission
Reply with:

Repo link (public GitHub or GitLab)

Transcript file(s)

PROCESS.md (in the repo is fine)

Approximate time spent. If you went over 2 hours, tell us where the time went; we'd rather know

Good luck! We're looking forward to seeing what you build.

Submission
Files
No file chosen

Upload File(s)
or drag and drop here

Notes



Submit Assignment
Powered by 
Privacy PolicySecurityVulnerability Disclosure

