"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DealPin } from "@/modules/deals";
import type { ChatMessageView } from "../types";
import { getDealThread, getMessages, postMessage } from "../supabase/store";
import { useChatRealtime } from "../lib/use-chat-realtime";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";

/**
 * The deal chat (3b) - the workspace's wide hero. One per deal, born with it
 * (`chat_thread type='deal'`), invited-company-only via the workspace RLS.
 *
 * Self-contained like DealPin: takes only the card id, resolves its own thread
 * + relationship, then reuses the whole messaging spine (stream, composer,
 * realtime). No ThreadView header here - the workspace header band plays that
 * role; the DealPin "Talking about" bar tops the stream with the card pill.
 */
export function DealChat({ dealCardId }: { dealCardId: string }) {
  const [thread, setThread] = useState<{ threadId: string; relationshipId: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // at-bottom detection: a realtime message must NOT yank a reader who has
  // scrolled up; the jump-to-bottom arrow shows only when scrolled up. The ref
  // mirrors the state so the auto-scroll effect reads the latest value without
  // re-running on every scroll (and without an exhaustive-deps warning).
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const NEAR_BOTTOM_PX = 80; // "near the bottom" still counts as at-bottom

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
  }

  function jumpToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    isAtBottomRef.current = true;
    setIsAtBottom(true);
  }

  // resolve the deal thread, then its stream (remounts per card via key upstream)
  useEffect(() => {
    let alive = true;
    void getDealThread(dealCardId)
      .then(async (t) => {
        const stream = await getMessages(t.threadId);
        if (!alive) return;
        setThread(t);
        setMessages(stream);
      })
      .catch(() => {
        if (alive) setError("This deal's chat could not be loaded.");
      });
    return () => {
      alive = false;
    };
  }, [dealCardId]);

  // keep the latest message in view as the stream grows - but ONLY when the
  // reader is already at the bottom, so a realtime message never interrupts a
  // reader who has scrolled up the thread.
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length]);

  // one-time initial scroll: opening a deal chat ALWAYS lands at the newest
  // message once the thread resolves, regardless of isAtBottom (the at-bottom
  // gate only governs messages that arrive AFTER open). Keyed on the resolved
  // thread id. Only the ref is reset here; onScroll stays the single owner of
  // isAtBottom state (avoids a cascading render).
  useEffect(() => {
    if (!thread) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
    isAtBottomRef.current = true;
  }, [thread?.threadId, thread]);

  // live updates - only this deal thread matters here
  useChatRealtime({
    onMessageInsert: (threadId) => {
      if (thread && threadId === thread.threadId) {
        void getMessages(threadId).then(setMessages);
      }
    },
    onThreadInsert: () => {},
  });

  async function handleSend(body: string) {
    if (!thread) return;
    const updated = await postMessage(thread.threadId, body);
    setMessages(updated);
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-ink/40">
        {error}
      </div>
    );
  }
  if (!thread) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-ink/40">
        Loading deal chat…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* the card's home: "Talking about" bar + the floating flip card (same as ②) */}
      <DealPin
        key={thread.relationshipId}
        relationshipId={thread.relationshipId}
        variant="workspace"
      >
        {/* stream - relative so the floating jump-to-bottom arrow anchors here */}
        <div className="relative h-full">
          <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto p-4">
            <div className="mx-auto flex max-w-2xl flex-col gap-2">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              <div ref={bottomRef} />
            </div>
          </div>
          {/* jump-to-bottom arrow - shown ONLY when scrolled up; glass surface
              with a raspberry-accent icon, matching the app's button vocabulary */}
          {!isAtBottom && (
            <button
              type="button"
              onClick={jumpToBottom}
              aria-label="Jump to latest message"
              title="Jump to latest message"
              className="glass-strong absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-brand ring-1 ring-black/5 transition hover:text-brand-deep hover:ring-brand/20"
            >
              <ChevronDown size={20} strokeWidth={2} />
            </button>
          )}
        </div>
      </DealPin>
      <Composer onSend={handleSend} placeholder="Message in the deal chat…" />
    </div>
  );
}
