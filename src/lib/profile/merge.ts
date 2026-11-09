import type {
  FlagConflictInput,
  MergeResult,
  ProfileConflict,
  ProfileField,
  ProfileState,
  ProfileUpdateProposal,
  ProfileValue,
  ResolveConflictRequest,
  TravelProfile,
} from "@/lib/contracts";

/*
 * THE place where conflict rules live (docs/plan.md, "Conflict model").
 *
 *   The LLM detects, the server enforces, the user approves.
 *
 * Every function here is pure: (state, input) -> new state + outcome. Nothing
 * in this module can overwrite a stored value except `resolveConflict` with an
 * explicit `approve`. Filling an empty field or appending new list items are
 * the only writes that skip approval.
 */

export type MergeContext = { now: () => string; newId: () => string };

export type ResolveOutcome =
  | { status: "resolved"; conflict: ProfileConflict }
  | { status: "rejected"; code: "not_found" | "conflict_not_pending" | "bad_request"; reason: string };

// ---------------------------------------------------------------------------
// Updates proposed by the LLM (`updateProfile` tool)
// ---------------------------------------------------------------------------

export function mergeProposal(
  state: ProfileState,
  proposal: ProfileUpdateProposal,
  ctx: MergeContext,
): { state: ProfileState; result: MergeResult } {
  const { field, evidence } = proposal;
  const current = state.profile[field];

  if ("value" in proposal) {
    const { value } = proposal;
    if (current === undefined) return applied(state, field, value, evidence, ctx);
    if (valuesEqual(current, value)) return { state, result: { status: "unchanged", field } };
    return openChange(state, field, current, value, evidence, ctx);
  }

  const stored = (current ?? []) as string[];
  const items = dedupe(proposal.items);

  switch (proposal.op) {
    case "add": {
      const added = items.filter((i) => !includesItem(stored, i));
      if (added.length === 0) return { state, result: { status: "unchanged", field } };
      return applied(state, field, [...stored, ...added], evidence, ctx);
    }
    case "remove": {
      if (!items.some((i) => includesItem(stored, i))) return { state, result: { status: "unchanged", field } };
      const next = stored.filter((s) => !includesItem(items, s));
      return openChange(state, field, stored, next, evidence, ctx);
    }
    case "set": {
      if (valuesEqual(stored, items)) return { state, result: { status: "unchanged", field } };
      const removesSomething = stored.some((s) => !includesItem(items, s));
      if (!removesSomething) {
        // Superset of what's stored: nothing is lost, so it's an append.
        const added = items.filter((i) => !includesItem(stored, i));
        return applied(state, field, [...stored, ...added], evidence, ctx);
      }
      return openChange(state, field, stored, items, evidence, ctx);
    }
  }
}

// ---------------------------------------------------------------------------
// Contradictions noticed by the LLM (`flagConflict` tool)
// ---------------------------------------------------------------------------

export function flagContradiction(
  state: ProfileState,
  input: FlagConflictInput,
  ctx: MergeContext,
): { state: ProfileState; result: MergeResult } {
  const current = state.profile[input.field];
  if (!hasValue(current)) {
    return {
      state,
      result: {
        status: "rejected",
        field: input.field,
        reason: `Nothing is stored for "${input.field}", so there is nothing to contradict. If the user stated a preference, use updateProfile instead.`,
      },
    };
  }
  const conflict: ProfileConflict = {
    id: ctx.newId(),
    kind: "contradiction",
    field: input.field,
    currentValue: current,
    observation: input.observation,
    evidence: input.evidence,
    status: "pending",
    clarifications: [],
    createdAt: ctx.now(),
  };
  return { state: withConflict(state, conflict, ctx), result: { status: "conflict", conflict } };
}

// ---------------------------------------------------------------------------
// The user's decision (conflict card, or chat via the guarded resolveConflict tool)
// ---------------------------------------------------------------------------

export function resolveConflict(
  state: ProfileState,
  conflictId: string,
  request: ResolveConflictRequest,
  ctx: MergeContext,
): { state: ProfileState; outcome: ResolveOutcome } {
  const conflict = state.conflicts.find((c) => c.id === conflictId);
  if (!conflict) {
    return { state, outcome: { status: "rejected", code: "not_found", reason: `No conflict with id ${conflictId}.` } };
  }
  if (conflict.status !== "pending") {
    return {
      state,
      outcome: { status: "rejected", code: "conflict_not_pending", reason: `Conflict is already ${conflict.status}.` },
    };
  }

  switch (request.action) {
    case "clarify": {
      const updated = { ...conflict, clarifications: [...conflict.clarifications, { note: request.note, at: ctx.now() }] };
      return { state: replaceConflict(state, updated), outcome: { status: "resolved", conflict: updated } };
    }
    case "keep": {
      const updated = { ...conflict, status: "kept" as const, resolvedAt: ctx.now() };
      return { state: replaceConflict(state, updated), outcome: { status: "resolved", conflict: updated } };
    }
    case "approve": {
      if (conflict.kind === "contradiction") {
        return {
          state,
          outcome: {
            status: "rejected",
            code: "bad_request",
            reason: "A contradiction has no proposed value to apply. Ask the user what should change, then propose it.",
          },
        };
      }
      // The field may have changed since the conflict was opened (e.g. an item was appended).
      // Applying the stale proposedValue would silently drop that change, so supersede instead.
      if (!valuesEqual(state.profile[conflict.field], conflict.currentValue)) {
        const stale = { ...conflict, status: "superseded" as const, resolvedAt: ctx.now() };
        return {
          state: replaceConflict(state, stale),
          outcome: {
            status: "rejected",
            code: "conflict_not_pending",
            reason: "The field changed after this conflict was raised. Re-confirm the change with the user.",
          },
        };
      }
      const approved = { ...conflict, status: "approved" as const, resolvedAt: ctx.now() };
      const next = writeField(replaceConflict(state, approved), conflict.field, conflict.proposedValue, conflict.evidence, ctx);
      return { state: next, outcome: { status: "resolved", conflict: approved } };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applied(
  state: ProfileState,
  field: ProfileField,
  value: ProfileValue,
  evidence: string,
  ctx: MergeContext,
): { state: ProfileState; result: MergeResult } {
  const next = writeField(state, field, value, evidence, ctx);
  return { state: next, result: { status: "applied", field, profile: next.profile } };
}

function openChange(
  state: ProfileState,
  field: ProfileField,
  currentValue: ProfileValue,
  proposedValue: ProfileValue,
  evidence: string,
  ctx: MergeContext,
): { state: ProfileState; result: MergeResult } {
  const conflict: ProfileConflict = {
    id: ctx.newId(),
    kind: "change",
    field,
    currentValue,
    proposedValue,
    evidence,
    status: "pending",
    clarifications: [],
    createdAt: ctx.now(),
  };
  return { state: withConflict(state, conflict, ctx), result: { status: "conflict", conflict } };
}

/** Values reaching here were validated against the field's schema (see proposal.ts). */
function writeField(
  state: ProfileState,
  field: ProfileField,
  value: ProfileValue,
  evidence: string,
  ctx: MergeContext,
): ProfileState {
  return {
    ...state,
    profile: { ...state.profile, [field]: value } as TravelProfile,
    provenance: { ...state.provenance, [field]: { evidence, updatedAt: ctx.now() } },
  };
}

/** One pending conflict per field: a newer one supersedes the older. */
function withConflict(state: ProfileState, conflict: ProfileConflict, ctx: MergeContext): ProfileState {
  const conflicts = state.conflicts.map((c) =>
    c.field === conflict.field && c.status === "pending"
      ? { ...c, status: "superseded" as const, resolvedAt: ctx.now() }
      : c,
  );
  return { ...state, conflicts: [...conflicts, conflict] };
}

function replaceConflict(state: ProfileState, updated: ProfileConflict): ProfileState {
  return { ...state, conflicts: state.conflicts.map((c) => (c.id === updated.id ? updated : c)) };
}

const norm = (s: string) => s.trim().toLowerCase();
const includesItem = (list: readonly string[], item: string) => list.some((x) => norm(x) === norm(item));
const dedupe = (items: readonly string[]) => items.filter((x, i) => items.findIndex((y) => norm(y) === norm(x)) === i);

function hasValue(value: ProfileValue | undefined): value is ProfileValue {
  return Array.isArray(value) ? value.length > 0 : value !== undefined;
}

/** Case-insensitive for strings; order-insensitive for lists. */
function valuesEqual(a: ProfileValue | undefined, b: ProfileValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x) => includesItem(b, x));
  }
  if (typeof a === "string" && typeof b === "string") return norm(a) === norm(b);
  return a === b;
}
