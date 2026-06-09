"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import type { ChatMessageView, ConversationListItem } from "../types";
import type { ChatFilter } from "./ConversationList";
import {
  getConversations,
  getMessages,
  markRead,
  postMessage,
} from "../mock/store";
import { ConversationList } from "./ConversationList";
import { ThreadView } from "./ThreadView";
import { SellaPanel } from "./SellaPanel";

/**
 * Chat orchestrator (panels 3 + 4). The ONLY stateful piece of the chat: holds
 * conversations + active-filter + selected thread + current message stream.
 * Mirrors InboxView's structure so the data-swap path is the same: only the
 * import bindings change to real Supabase calls; layout + state stay put.
 */
export function ChatView() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [loading, setLoading] = useState(true);

  // initial load - auto-select the first conversation
  useEffect(() => {
    let alive = true;
    void getConversations().then((list) => {
      if (!alive) return;
      setConversations(list);
      if (list[0]) setSelectedThreadId(list[0].threadId);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // load the stream whenever the selected thread changes. The clear-on-switch
  // lives in handleSelect (an event handler) so we never setState synchronously
  // inside the effect - the effect only ever syncs *from* the store.
  useEffect(() => {
    if (!selectedThreadId) return;
    void getMessages(selectedThreadId).then(setMessages);
    void markRead(selectedThreadId).then(() =>
      getConversations().then(setConversations),
    );
  }, [selectedThreadId]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.threadId === selectedThreadId) ?? null,
    [conversations, selectedThreadId],
  );

  function handleSelect(threadId: string) {
    if (threadId === selectedThreadId) return;
    setMessages([]); // drop the prior thread's stream so it can't flash under the new header
    setSelectedThreadId(threadId);
  }

  async function handleSend(body: string) {
    if (!selectedThreadId) return;
    const updated = await postMessage(selectedThreadId, body);
    setMessages(updated);
  }

  return (
    <div className="flex h-full gap-3">
      {/* panel 3 - conversation list */}
      <div className="glass flex w-64 shrink-0 flex-col overflow-hidden rounded-3xl">
        {loading ? (
          <p className="flex-1 p-6 text-center text-sm text-ink/40">Loading conversations…</p>
        ) : (
          <ConversationList
            conversations={conversations}
            filter={filter}
            onFilterChange={setFilter}
            selectedThreadId={selectedThreadId}
            onSelect={handleSelect}
          />
        )}
      </div>

      {/* panel 4 - thread */}
      <div className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
        {selectedConversation ? (
          <ThreadView
            conversation={selectedConversation}
            messages={messages}
            onSend={handleSend}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center text-ink/40">
            <MessageSquare size={28} strokeWidth={1.5} />
            <p className="mt-3 text-sm">Select a conversation to start reading</p>
          </div>
        )}
      </div>

      {/* panel 5 - Sella rail */}
      <SellaPanel conversation={selectedConversation} />
    </div>
  );
}
