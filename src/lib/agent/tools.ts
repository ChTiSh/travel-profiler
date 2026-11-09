import { tool, type ToolSet } from "ai";
import {
  FlagConflictInputSchema,
  GetDestinationInfoInputSchema,
  ResolveConflictInputSchema,
  UpdateProfileInputSchema,
  type FlagConflictOutput,
  type GetDestinationInfoOutput,
  type ProfileDataPart,
  type ResolveConflictOutput,
  type UpdateProfileOutput,
} from "@/lib/contracts";
import { DESTINATIONS, getDestinationInfo } from "@/lib/destinations";
import { isQuoteInMessage } from "@/lib/profile/approval";
import type { ProfileService } from "@/lib/profile/service";

export type ToolDeps = {
  service: ProfileService;
  /** Text of the user's latest message: the only place a chat approval may come from. */
  latestUserText: string;
  /** Called after every state change, to stream a live `data-profile` part. */
  onProfileChange: (part: ProfileDataPart) => void;
};

/*
 * Thin adapters between the model and the domain: validate (via the input
 * schemas), delegate to the service, report the change, and return a result
 * the model can act on. No profile rules live here.
 */
export function buildTools({ service, latestUserText, onProfileChange }: ToolDeps) {
  return {
    getDestinationInfo: tool({
      description:
        "Look up travel data for a specific named place (city, region, or country). Call it EVERY time the user names a destination, before saying anything about that place. It is the only allowed source of destination facts.",
      inputSchema: GetDestinationInfoInputSchema,
      execute: async ({ name }): Promise<GetDestinationInfoOutput> => {
        const destination = await getDestinationInfo(name);
        if (destination) return { found: true, destination };
        return {
          found: false,
          name,
          knownDestinations: DESTINATIONS.map((d) => d.info.name),
          instruction: `There is no data for "${name}". Tell the user you don't have information about it. Do NOT state facts about it from your own knowledge. You may keep exploring their preferences, or offer known destinations that fit their profile.`,
        };
      },
    }),

    updateProfile: tool({
      description:
        "Save travel preferences the user stated about themselves. Put every preference from the message into ONE call. Never use it for facts from destination data or for other people's preferences. Changes to stored values are not saved directly; they become conflicts the user must approve.",
      inputSchema: UpdateProfileInputSchema,
      execute: async ({ updates }): Promise<UpdateProfileOutput> => {
        const { results, view, changes } = await service.applyUpdates(updates);
        onProfileChange({ view, changes });
        return { results };
      },
    }),

    flagConflict: tool({
      description:
        "Call when the user says or asks something at odds with a value ALREADY STORED in their profile, without stating a new preference (e.g. stored vegetarian, then asks for a steakhouse). Do not use it when the user explicitly changes a preference; use updateProfile for that.",
      inputSchema: FlagConflictInputSchema,
      execute: async (input): Promise<FlagConflictOutput> => {
        const { output, view, changes } = await service.flagConflict(input);
        onProfileChange({ view, changes });
        return output;
      },
    }),

    resolveConflict: tool({
      description:
        "Record the user's decision on a PENDING conflict, only when their latest message clearly approves the change or says to keep the current value. Quote their exact words as evidence. If they add context instead, do not call this; respond to the context.",
      inputSchema: ResolveConflictInputSchema,
      execute: async ({ conflictId, action, evidence }): Promise<ResolveConflictOutput> => {
        if (!isQuoteInMessage(evidence, latestUserText)) {
          return {
            status: "rejected",
            reason:
              "The evidence is not an exact quote from the user's latest message, so no decision was recorded. Ask the user to confirm explicitly.",
          };
        }
        const { outcome, view, changes } = await service.resolve(conflictId, { action });
        onProfileChange({ view, changes });
        if (outcome.status === "rejected") return { status: "rejected", reason: outcome.reason };
        return {
          status: "resolved",
          conflictId,
          action,
          instruction:
            action === "approve"
              ? "The change is saved. Briefly confirm what changed."
              : "The stored value was kept. Briefly acknowledge.",
        };
      },
    }),
  } satisfies ToolSet;
}
