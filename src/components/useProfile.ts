"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiErrorSchema,
  ProfileViewSchema,
  type ApiError,
  type ProfileView,
  type ResolveConflictRequest,
} from "@/lib/contracts";

export type ResolveResult = { ok: true; view: ProfileView } | { ok: false; error: ApiError["error"] };

const networkError: ApiError["error"] = { code: "internal", message: "Couldn't reach the server. Try again." };

/**
 * Client-side owner of the profile view. Server responses are validated with
 * the same schemas the server uses; a response that doesn't match the
 * contract is treated as an error, not rendered.
 */
export function useProfile() {
  const [view, setView] = useState<ProfileView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      setView(ProfileViewSchema.parse(await res.json()));
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load your saved profile.");
    }
  }, []);

  useEffect(() => {
    // Initial load from the server; this effect syncs with an external system (the API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const resolve = useCallback(
    async (conflictId: string, request: ResolveConflictRequest): Promise<ResolveResult> => {
      try {
        const res = await fetch(`/api/profile/conflicts/${encodeURIComponent(conflictId)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        });
        const json: unknown = await res.json();
        if (!res.ok) {
          const parsed = ApiErrorSchema.safeParse(json);
          // A stale or already-decided conflict: re-sync so the card disappears.
          if (res.status === 409) await refresh();
          return { ok: false, error: parsed.success ? parsed.data.error : networkError };
        }
        const next = ProfileViewSchema.parse(json);
        setView(next);
        return { ok: true, view: next };
      } catch {
        return { ok: false, error: networkError };
      }
    },
    [refresh],
  );

  return { view, setView, loadError, resolve };
}
