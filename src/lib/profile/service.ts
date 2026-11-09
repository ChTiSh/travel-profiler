import type {
  FlagConflictInput,
  FlagConflictOutput,
  ProfileConflict,
  ProfileField,
  ProfileState,
  ProfileUpdateItem,
  ProfileView,
  ResolveConflictRequest,
  UpdateItemOutcome,
} from "@/lib/contracts";
import { flagContradiction, mergeProposal, resolveConflict, type MergeContext, type ResolveOutcome } from "./merge";
import { formatValue } from "./format";
import { parseUpdateItem } from "./proposal";
import type { ProfileStore } from "./store";

/*
 * Business logic for the profile, shared by the chat tools and the REST route
 * (so the conflict card and chat can't behave differently). Each operation is
 * one serialized store update: parse -> merge (pure rules) -> persist.
 */

export type ProfileChanges = { updatedFields: ProfileField[]; newConflictIds: string[] };
type WithView<T> = T & { view: ProfileView; changes: ProfileChanges };

const systemContext: MergeContext = {
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
};

export function toView(state: ProfileState): ProfileView {
  return {
    profile: state.profile,
    provenance: state.provenance,
    pendingConflicts: state.conflicts.filter((c) => c.status === "pending"),
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;

export function createProfileService(store: ProfileStore, ctx: MergeContext = systemContext) {
  return {
    async view(): Promise<ProfileView> {
      return toView(await store.read());
    },

    applyUpdates(items: ProfileUpdateItem[]): Promise<WithView<{ results: UpdateItemOutcome[] }>> {
      return store.update((initial) => {
        let state = initial;
        const results: UpdateItemOutcome[] = [];
        const changes: ProfileChanges = { updatedFields: [], newConflictIds: [] };

        for (const item of items) {
          const parsed = parseUpdateItem(item);
          if (!parsed.ok) {
            results.push({ field: item.field, status: "rejected", message: parsed.reason });
            continue;
          }
          const merged = mergeProposal(state, parsed.proposal, ctx);
          state = merged.state;
          const { result } = merged;
          switch (result.status) {
            case "applied":
              changes.updatedFields.push(result.field);
              results.push({ field: result.field, status: "applied", message: `Saved ${result.field}.` });
              break;
            case "unchanged":
              results.push({ field: result.field, status: "unchanged", message: `${result.field} already has that value.` });
              break;
            case "conflict":
              changes.newConflictIds.push(result.conflict.id);
              results.push({
                field: result.conflict.field,
                status: "conflict",
                conflictId: result.conflict.id,
                message: describeConflictForModel(result.conflict),
              });
              break;
            case "rejected":
              results.push({ field: item.field, status: "rejected", message: result.reason });
              break;
          }
        }
        return { state, value: { results, view: toView(state), changes } };
      });
    },

    flagConflict(input: FlagConflictInput): Promise<WithView<{ output: FlagConflictOutput }>> {
      return store.update<WithView<{ output: FlagConflictOutput }>>((initial) => {
        const { state, result } = flagContradiction(initial, input, ctx);
        if (result.status !== "conflict") {
          const reason = result.status === "rejected" ? result.reason : "Not recorded.";
          return { state, value: { output: { status: "rejected", reason }, view: toView(state), changes: noChanges() } };
        }
        return {
          state,
          value: {
            output: { status: "conflict", conflictId: result.conflict.id, instruction: describeConflictForModel(result.conflict) },
            view: toView(state),
            changes: { updatedFields: [], newConflictIds: [result.conflict.id] },
          },
        };
      });
    },

    resolve(conflictId: string, request: ResolveConflictRequest): Promise<WithView<{ outcome: ResolveOutcome }>> {
      return store.update((initial) => {
        const { state, outcome } = resolveConflict(initial, conflictId, request, ctx);
        const changed = outcome.status === "resolved" && outcome.conflict.status === "approved";
        return {
          state,
          value: {
            outcome,
            view: toView(state),
            changes: { updatedFields: changed ? [outcome.conflict.field] : [], newConflictIds: [] },
          },
        };
      });
    },
  };
}

const noChanges = (): ProfileChanges => ({ updatedFields: [], newConflictIds: [] });


/** What the model is told, so it surfaces the conflict instead of treating the change as done. */
function describeConflictForModel(conflict: ProfileConflict): string {
  const current = `"${conflict.field}" is currently ${formatValue(conflict.currentValue)}`;
  const ask = `Do NOT treat it as changed. Tell the user, and ask them to approve, keep the current value, or clarify (conflict ${conflict.id}).`;
  return conflict.kind === "change"
    ? `Not saved: ${current}; changing it to ${formatValue(conflict.proposedValue)} needs the user's explicit approval. ${ask}`
    : `Possible contradiction: ${current}, but the user ${conflict.observation}. ${ask}`;
}
