"use client";

import { useEffect, useRef, useState } from "react";
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

  // keep the latest message in view as the stream grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

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
      <DealPin key={thread.relationshipId} relationshipId={thread.relationshipId}>
        <div className="h-full overflow-y-auto p-4">
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      </DealPin>
      <Composer onSend={handleSend} placeholder="Message in the deal chat…" />
    </div>
  );
}
