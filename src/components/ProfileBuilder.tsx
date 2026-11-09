"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useRef, useState } from "react";
import {
  chatDataPartSchemas,
  type ChatUIMessage,
  type ProfileConflict,
  type ProfileDataPart,
  type ProfileField,
} from "@/lib/contracts";
import { toApiError } from "@/lib/chat/errors";
import { FIELD_LABELS, formatValue } from "@/lib/profile/format";
import { ChatPanel } from "./ChatPanel";
import { ProfilePanel } from "./ProfilePanel";
import { useProfile } from "./useProfile";

const transport = new DefaultChatTransport<ChatUIMessage>({ api: "/api/chat" });

export function ProfileBuilder() {
  const { view, setView, loadError, resolve } = useProfile();
  const [announcement, setAnnouncement] = useState("");
  const [recentlyUpdated, setRecentlyUpdated] = useState<ReadonlySet<ProfileField>>(new Set());
  const [deciding, setDeciding] = useState(false);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // One polite live region for the whole app (A1): completed replies, profile changes, decisions.
  const announce = useCallback((text: string) => setAnnouncement(text), []);

  const highlight = useCallback((fields: ProfileField[]) => {
    if (!fields.length) return;
    setRecentlyUpdated(new Set(fields));
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setRecentlyUpdated(new Set()), 4000);
  }, []);

  const onProfileData = useCallback(
    ({ view: next, changes }: ProfileDataPart) => {
      setView(next);
      highlight(changes.updatedFields);
      const parts = [
        changes.updatedFields.length && `Profile updated: ${changes.updatedFields.map((f) => FIELD_LABELS[f]).join(", ")}.`,
        changes.newConflictIds.length && `${changes.newConflictIds.length} item needs your decision.`,
      ].filter(Boolean);
      if (parts.length) announce(parts.join(" "));
    },
    [announce, highlight, setView],
  );

  const chat = useChat<ChatUIMessage>({
    transport,
    dataPartSchemas: chatDataPartSchemas,
    onData: (part) => {
      if (part.type === "data-profile") onProfileData(part.data);
    },
    onFinish: ({ message }) => {
      const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
      if (text) announce(`Assistant: ${text}`);
    },
  });

  const busy = chat.status === "submitted" || chat.status === "streaming";

  const decide = async (conflict: ProfileConflict, action: "approve" | "keep") => {
    setDeciding(true);
    const result = await resolve(conflict.id, { action });
    setDeciding(false);
    const label = FIELD_LABELS[conflict.field];
    if (!result.ok) return announce(result.error.message);
    if (action === "approve") {
      highlight([conflict.field]);
      announce(`${label} updated.`);
    } else {
      announce(`Kept ${label} as ${formatValue(conflict.currentValue)}.`);
    }
  };

  const clarify = async (conflict: ProfileConflict, note: string) => {
    setDeciding(true);
    const result = await resolve(conflict.id, { action: "clarify", note });
    setDeciding(false);
    if (!result.ok) return announce(result.error.message);
    // The note goes into the conversation so the agent can respond (and propose a revised value).
    void chat.sendMessage({ text: `About my ${FIELD_LABELS[conflict.field].toLowerCase()}: ${note}` });
  };

  return (
    <main className="mx-auto grid h-dvh w-full max-w-6xl grid-rows-[auto_1fr] gap-4 p-4 md:grid-cols-[1fr_22rem] md:grid-rows-[auto_minmax(0,1fr)]">
      <header className="md:col-span-2">
        <h1 className="text-xl font-semibold">Profile Builder</h1>
        <p className="text-sm text-ink-muted">
          Chat about how you travel; your durable travel profile builds itself as you go.
        </p>
      </header>

      <section aria-labelledby="chat-heading" className="flex min-h-[24rem] flex-col md:min-h-0">
        <h2 id="chat-heading" className="sr-only">
          Chat
        </h2>
        <ChatPanel
          messages={chat.messages}
          status={chat.status}
          error={chat.error ? toApiError(chat.error) : null}
          view={view}
          onSend={(text) => void chat.sendMessage({ text })}
          onStop={() => void chat.stop()}
          onRetry={() => void chat.regenerate()}
          onDismissError={() => chat.clearError()}
        />
      </section>

      <aside aria-labelledby="profile-heading" className="overflow-y-auto rounded-lg border border-line bg-surface p-4">
        <h2 id="profile-heading" className="mb-3 text-lg font-semibold">
          Your travel profile
        </h2>
        <ProfilePanel
          view={view}
          loadError={loadError}
          recentlyUpdated={recentlyUpdated}
          busy={deciding || busy}
          onDecide={decide}
          onClarify={clarify}
        />
      </aside>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </main>
  );
}
