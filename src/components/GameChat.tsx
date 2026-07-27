"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GameView } from "@/server/views";
import { api } from "@/lib/client";

type Toast = { id: string; text: string };

type ChatCtx = {
  toasts: Record<string, Toast>;
};

const ChatContext = createContext<ChatCtx>({ toasts: {} });

export function useSeatChatToast(playerId: string): Toast | null {
  return useContext(ChatContext).toasts[playerId] ?? null;
}

const TOAST_MS = 4200;

/**
 * Table talk: docked right panel (shrinks the game on desktop); seat bubbles
 * flash when someone posts. Wraps children so seats can read toasts.
 */
export function GameChat({
  view,
  onUpdate,
  fillViewport = false,
  children,
}: {
  view: GameView;
  onUpdate: (v: GameView) => void;
  /** Lock the shell to the browser height (arrange / reveal). */
  fillViewport?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Record<string, Toast>>({});
  const [unread, setUnread] = useState(0);
  const seenToastIds = useRef<Set<string>>(new Set());
  const readIds = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const youId = view.you?.playerId ?? view.spectatorId ?? undefined;
  const chat = view.chat ?? [];

  // First paint: treat existing history as seen/read (no toast flood).
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    for (const m of chat) {
      seenToastIds.current.add(m.id);
      readIds.current.add(m.id);
    }
  }, [chat]);

  // Seat toasts for newly arrived messages.
  useEffect(() => {
    if (!seeded.current) return;
    const fresh = chat.filter((m) => !seenToastIds.current.has(m.id));
    if (!fresh.length) return;
    for (const m of fresh) seenToastIds.current.add(m.id);

    setToasts((prev) => {
      const next = { ...prev };
      for (const m of fresh) {
        next[m.playerId] = { id: m.id, text: m.text };
      }
      return next;
    });

    for (const m of fresh) {
      window.setTimeout(() => {
        setToasts((prev) => {
          if (prev[m.playerId]?.id !== m.id) return prev;
          const next = { ...prev };
          delete next[m.playerId];
          return next;
        });
      }, TOAST_MS);
    }
  }, [chat]);

  // Unread while panel closed.
  useEffect(() => {
    if (open) {
      for (const m of chat) readIds.current.add(m.id);
      setUnread(0);
      return;
    }
    const n = chat.filter((m) => m.playerId !== youId && !readIds.current.has(m.id)).length;
    setUnread(n);
  }, [chat, open, youId, view.chatRevision]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, chat.length]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const { view: next } = await api.chat(view.id, text);
      setDraft("");
      onUpdate(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t send");
    } finally {
      setSending(false);
    }
  }, [draft, sending, view.id, onUpdate]);

  const ctx = useMemo(() => ({ toasts }), [toasts]);
  const lockHeight = fillViewport || open;

  return (
    <ChatContext.Provider value={ctx}>
      <div
        className={`flex w-full ${lockHeight ? "h-dvh max-h-dvh overflow-hidden" : "min-h-dvh"}`}
      >
        <div
          className={`min-h-0 min-w-0 flex-1 ${
            fillViewport ? "overflow-hidden" : open ? "overflow-y-auto" : ""
          }`}
        >
          {children}
        </div>

        {open && (
          <aside
            className="flex h-full max-h-dvh w-[min(20rem,82vw)] shrink-0 flex-col border-l border-white/10 bg-felt-900 max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:shadow-2xl md:w-80"
            aria-label="Chat"
          >
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <span className="text-lg leading-none" aria-hidden>
                ×
              </span>
            </button>

            <div
              ref={listRef}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3 pt-11"
            >
              {chat.length === 0 && (
                <p className="py-8 text-center text-sm text-muted">No messages yet. Say hello.</p>
              )}
              {chat.map((m) => {
                const mine = m.playerId === youId;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${
                        mine ? "bg-accent/90 text-felt-900" : "bg-white/10 text-ink"
                      }`}
                    >
                      {!mine && (
                        <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent-soft">
                          <span>{m.displayName}</span>
                          {m.isSpectator && (
                            <span className="rounded bg-white/10 px-1 py-px text-[9px] font-medium normal-case tracking-normal text-muted">
                              spectating
                            </span>
                          )}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <form
              className="flex shrink-0 gap-2 border-t border-white/10 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <div className="field flex-1 !py-2">
                <input
                  className="field-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={200}
                  placeholder="Message…"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-primary !px-3" disabled={sending || !draft.trim()}>
                Send
              </button>
            </form>
            {error && <div className="px-3 pb-3 text-xs text-red-300">{error}</div>}
          </aside>
        )}
      </div>

      {!open && (
        <button
          type="button"
          aria-label="Open chat"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-lg ring-1 ring-black/10 transition hover:bg-white/90 active:scale-95"
        >
          <ChatIcon />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    </ChatContext.Provider>
  );
}

/** Seat-adjacent speech bubble. */
export function SeatSpeechBubble({
  playerId,
  placement = "above",
}: {
  playerId: string;
  placement?: "above" | "below" | "left" | "right";
}) {
  const toast = useSeatChatToast(playerId);
  if (!toast) return null;

  const pos =
    placement === "left"
      ? "right-full top-1/2 mr-2 -translate-y-1/2"
      : placement === "right"
        ? "left-full top-1/2 ml-2 -translate-y-1/2"
        : placement === "below"
          ? "left-1/2 top-full mt-2 -translate-x-1/2"
          : "left-1/2 bottom-full mb-2 -translate-x-1/2";

  const anim =
    placement === "left"
      ? "chat-seat-pop-left"
      : placement === "right"
        ? "chat-seat-pop-right"
        : "chat-seat-pop";

  const tip =
    placement === "left"
      ? "absolute right-0 top-1/2 h-2 w-2 translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#f3efe6]"
      : placement === "right"
        ? "absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#f3efe6]"
        : placement === "below"
          ? "absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#f3efe6]"
          : "absolute left-1/2 bottom-0 h-2 w-2 -translate-x-1/2 translate-y-1/2 rotate-45 bg-[#f3efe6]";

  return (
    <div
      key={toast.id}
      className={`pointer-events-none absolute z-20 w-max max-w-[9.5rem] ${pos} ${anim}`}
    >
      <div className="relative rounded-xl bg-[#f3efe6] px-2.5 py-1.5 text-[11px] font-medium leading-snug text-felt-900 shadow-lg">
        <span className="line-clamp-3 break-words">{toast.text}</span>
        <span className={tip} />
      </div>
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-3.5 3.2V15H7.5A2.5 2.5 0 0 1 5 12.5v-6Z"
        fill="currentColor"
      />
    </svg>
  );
}
