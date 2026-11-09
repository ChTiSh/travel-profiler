"use client";

import {
  CORE_FIELDS,
  PROFILE_FIELDS,
  type ProfileConflict,
  type ProfileField,
  type ProfileView,
} from "@/lib/contracts";
import { FIELD_LABELS, formatValue } from "@/lib/profile/format";
import { ConflictCard } from "./ConflictCard";

type Props = {
  view: ProfileView | null;
  loadError: string | null;
  recentlyUpdated: ReadonlySet<ProfileField>;
  busy: boolean;
  onDecide: (conflict: ProfileConflict, action: "approve" | "keep") => void;
  onClarify: (conflict: ProfileConflict, note: string) => void;
};

const hasValue = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== undefined);

/** Read-only view of the stored profile (R4). Values change only through conversation + approval. */
export function ProfilePanel({ view, loadError, recentlyUpdated, busy, onDecide, onClarify }: Props) {
  if (loadError) return <p role="alert">{loadError}</p>;
  if (!view) return <p className="text-ink-muted">Loading your profile…</p>;

  // Core fields always show (so gaps are visible); other fields only once they have a value.
  const fields = PROFILE_FIELDS.filter(
    (f) => (CORE_FIELDS as readonly string[]).includes(f) || hasValue(view.profile[f]),
  );

  return (
    <div className="space-y-4">
      {view.pendingConflicts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Needs your decision ({view.pendingConflicts.length})</h2>
          {view.pendingConflicts.map((c) => (
            <ConflictCard
              key={c.id}
              conflict={c}
              busy={busy}
              onDecide={(action) => onDecide(c, action)}
              onClarify={(note) => onClarify(c, note)}
            />
          ))}
        </div>
      )}

      <dl className="divide-y divide-line">
        {fields.map((field) => {
          const value = view.profile[field];
          const evidence = view.provenance[field]?.evidence;
          const fresh = recentlyUpdated.has(field);
          return (
            <div
              key={field}
              className={`py-2 transition-colors motion-reduce:transition-none ${fresh ? "bg-brand/10" : ""}`}
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {FIELD_LABELS[field]}
                {fresh && <span className="ml-2 font-semibold normal-case text-ink">✓ updated</span>}
              </dt>
              <dd className={hasValue(value) ? "" : "text-ink-muted"}>
                {hasValue(value) ? formatValue(value) : "Not yet"}
                {evidence && (
                  <span className="block text-xs italic text-ink-muted">
                    <span className="sr-only">You said: </span>“{evidence}”
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
