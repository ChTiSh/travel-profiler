"use client";

import { useId, useState } from "react";
import type { ProfileConflict } from "@/lib/contracts";
import { FIELD_LABELS, formatValue } from "@/lib/profile/format";

type Props = {
  conflict: ProfileConflict;
  busy: boolean;
  onDecide: (action: "approve" | "keep") => void;
  onClarify: (note: string) => void;
};

/**
 * An approval prompt, not an editor (B7): the change was asked for in
 * conversation, and nothing is saved until the user decides. Buttons carry
 * full context in their accessible names ("Approve changing Dietary needs…").
 */
export function ConflictCard({ conflict, busy, onDecide, onClarify }: Props) {
  const headingId = useId();
  const noteId = useId();
  const [clarifying, setClarifying] = useState(false);
  const [note, setNote] = useState("");
  const label = FIELD_LABELS[conflict.field];
  const current = formatValue(conflict.currentValue);

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-neutral-900 dark:bg-amber-950/40 dark:text-neutral-100"
    >
      <h3 id={headingId} className="font-semibold">
        <span aria-hidden="true">⚠ </span>
        {label}: needs your decision
      </h3>

      <dl className="mt-2 space-y-1">
        <div>
          <dt className="inline font-medium">Saved now: </dt>
          <dd className="inline">{current}</dd>
        </div>
        {conflict.kind === "change" ? (
          <div>
            <dt className="inline font-medium">Would become: </dt>
            <dd className="inline">{formatValue(conflict.proposedValue)}</dd>
          </div>
        ) : (
          <div>
            <dt className="inline font-medium">But you: </dt>
            <dd className="inline">{conflict.observation}</dd>
          </div>
        )}
        <div>
          <dt className="inline font-medium">You said: </dt>
          <dd className="inline italic">“{conflict.evidence}”</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {conflict.kind === "change" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide("approve")}
            aria-label={`Approve changing ${label} from ${current} to ${formatValue(conflict.proposedValue)}`}
            className="btn btn-primary"
          >
            Approve change
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide("keep")}
          aria-label={`Keep ${label} as ${current}`}
          className="btn"
        >
          Keep {current}
        </button>
        <button
          type="button"
          disabled={busy}
          aria-expanded={clarifying}
          onClick={() => setClarifying((v) => !v)}
          className="btn"
        >
          Clarify…
        </button>
      </div>

      {clarifying && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            onClarify(note.trim());
            setNote("");
            setClarifying(false);
          }}
        >
          <label htmlFor={noteId} className="block font-medium">
            Add context for the assistant
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. It's a one-off for a friend's birthday"
            className="w-full rounded border border-neutral-400 bg-white p-2 dark:bg-neutral-900"
          />
          <button type="submit" disabled={busy || !note.trim()} className="btn btn-primary">
            Send context
          </button>
        </form>
      )}
    </section>
  );
}
