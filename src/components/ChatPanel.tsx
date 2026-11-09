"use client";

import type { ChatStatus } from "ai";
import { useEffect, useId, useRef, useState } from "react";
import type { ApiError, ChatUIMessage, ProfileView } from "@/lib/contracts";
import { FIELD_LABELS, missingCoreFields } from "@/lib/profile/format";

type Props = {
  messages: ChatUIMessage[];
  status: ChatStatus;
  error: ApiError["error"] | null;
  view: ProfileView | null;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onDismissError: () => void;
};

export function ChatPanel({ messages, status, error, view, onSend, onStop, onRetry, onDismissError }: Props) {
  const inputId = useId();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    onSend(text);
    setInput("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Not a live region: streamed tokens would flood a screen reader. Completed replies are
          announced once by ProfileBuilder's announcer; aria-busy marks the in-progress state. */}
      <ol aria-label="Conversation" aria-busy={busy} className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
        <li>
          <Greeting view={view} />
        </li>
        {messages.map((m) => (
          <li key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <Message message={m} />
          </li>
        ))}
        {status === "submitted" && (
          <li className="text-sm text-ink-muted" aria-hidden="true">
            Thinking…
          </li>
        )}
        <div ref={endRef} />
      </ol>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-400 bg-red-50 p-3 text-sm">
          <p>
            <span className="font-semibold">Couldn&apos;t get a reply. </span>
            {error.message}
          </p>
          <div className="mt-2 flex gap-2">
            {!["missing_credentials", "misconfigured", "invalid_credentials"].includes(error.code) && (
              <button type="button" onClick={onRetry} className="btn">
                Retry
              </button>
            )}
            <button type="button" onClick={onDismissError} className="btn">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 border-t border-line pt-3"
      >
        <div className="flex-1">
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
            Message
          </label>
          <textarea
            id={inputId}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            maxLength={4000}
            aria-describedby={`${inputId}-hint`}
            placeholder="e.g. I'm vegetarian, fly out of SEA, and like a slow pace"
            className="w-full resize-none rounded-lg border border-ink-disabled bg-surface p-2"
          />
          <p id={`${inputId}-hint`} className="sr-only">
            Press Enter to send, Shift+Enter for a new line.
          </p>
        </div>
        {busy ? (
          <button type="button" onClick={onStop} className="btn">
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} className="btn btn-primary">
            Send
          </button>
        )}
      </form>
    </div>
  );
}

/** Static, no LLM call: a new user gets an invitation, a returning user a summary of what's saved. */
function Greeting({ view }: { view: ProfileView | null }) {
  const missing = view ? missingCoreFields(view.profile) : [];
  const returning = view && missing.length < 7;
  return (
    <div className="max-w-prose rounded-lg border border-line bg-surface p-3">
      {returning ? (
        <p>
          Welcome back! Your profile is saved on the right.{" "}
          {missing.length
            ? `Still missing: ${missing.map((f) => FIELD_LABELS[f].toLowerCase()).join(", ")}. Want to fill those in, or tell me about a place you're curious about?`
            : "Want to refine anything, or tell me about a place you're curious about?"}
        </p>
      ) : (
        <p>
          Hi! I&apos;ll build your travel profile as we talk. Tell me how you like to travel, in your own words:
          budget, pace, food, who you go with, where you fly from. You can also name a place you&apos;re curious
          about.
        </p>
      )}
    </div>
  );
}

function Message({ message }: { message: ChatUIMessage }) {
  const isUser = message.role === "user";
  // A turn that failed before producing anything leaves an empty assistant message; don't render a blank bubble.
  const visible = message.parts.some((p) => (p.type === "text" && p.text.trim()) || toolChip(p));
  if (!visible) return null;
  return (
    <div
      className={`max-w-prose rounded-lg p-3 ${isUser ? "bg-brand text-white" : "border border-line bg-surface"}`}
    >
      <span className="sr-only">{isUser ? "You said:" : "Assistant said:"}</span>
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return (
            <p key={i} className="whitespace-pre-wrap">
              {part.text}
            </p>
          );
        }
        const chip = toolChip(part);
        return chip ? (
          <p key={i} className="my-1 text-xs text-ink-muted">
            <span aria-hidden="true">• </span>
            {chip}
          </p>
        ) : null;
      })}
    </div>
  );
}

/** Makes tool use visible, so the user (and reviewer) can see the agent actually used getDestinationInfo. */
function toolChip(part: ChatUIMessage["parts"][number]): string | null {
  switch (part.type) {
    case "tool-getDestinationInfo":
      if (part.state !== "output-available") return `Looking up ${part.input?.name ?? "destination"}…`;
      return part.output.found ? `Looked up ${part.output.destination.name}` : `No data available for ${part.output.name}`;
    case "tool-updateProfile": {
      if (part.state !== "output-available") return "Updating your profile…";
      const by = (s: string) => part.output.results.filter((r) => r.status === s).map((r) => FIELD_LABELS[r.field]);
      const saved = by("applied");
      const pending = by("conflict");
      return [saved.length && `Saved: ${saved.join(", ")}`, pending.length && `Needs your decision: ${pending.join(", ")}`]
        .filter(Boolean)
        .join(" · ") || null;
    }
    case "tool-flagConflict":
      return part.state === "output-available" && part.output.status === "conflict"
        ? `Flagged a possible conflict: ${FIELD_LABELS[part.input.field]}`
        : null;
    case "tool-resolveConflict":
      if (part.state !== "output-available") return null;
      return part.output.status === "resolved"
        ? part.output.action === "approve"
          ? "Applied your approved change"
          : "Kept your saved value"
        : "Waiting for your explicit confirmation";
    default:
      return null;
  }
}
