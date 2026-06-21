"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import type { ChatMessageView, ConversationListItem, MyConnectionsView } from "../types";
import type { ChatFilter } from "./ConversationList";
import type { NewChatSelection } from "./NewChatDropdown";
import {
  getConversations,
  getMessages,
  markRead,
  postMessage,
} from "../supabase/store";
import {
  getMyConnections,
  openOrCreateP2pThread,
  resolveC2cThread,
} from "@/modules/messaging";
import { useChatRealtime } from "../lib/use-chat-realtime";
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
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [loading, setLoading] = useState(true);
  // live unread counts per thread, cleared on open - in-memory for the demo
  const [unread, setUnread] = useState<Record<string, number>>({});
  // the new-chat picker: the connected directory + its open/closed flag + the
  // live conversation-search value (local useState only - no global store)
  const [connections, setConnections] = useState<MyConnectionsView>({ companies: [] });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  // initial load - auto-select the first conversation
  useEffect(() => {
    let alive = true;
    void getConversations().then((list) => {
      if (!alive) return;
      setConversations(list);
      // No auto-select: Chat opens on the empty pink state (locked decision, F2).
      // A thread opens only when a conversation is tapped (WhatsApp-style).
      setLoading(false);
    });
    // the new-chat picker directory (connected companies + their people)
    void getMyConnections().then((c) => {
      if (alive) setConnections(c);
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

  // overlay the live unread counts onto the list rows (drives the badge + Unread filter)
  const listConversations = useMemo(
    () => conversations.map((c) => ({ ...c, unreadCount: unread[c.threadId] ?? 0 })),
    [conversations, unread],
  );

  function handleSelect(threadId: string) {
    // a deal row is a DOOR: it opens the workspace (the deal chat's one home)
    const item = conversations.find((c) => c.threadId === threadId);
    if (item?.threadType === "deal" && item.dealCardId) {
      router.push(`/connect/deal/${item.dealCardId}`);
      return;
    }
    if (threadId === selectedThreadId) return;
    setMessages([]); // drop the prior thread's stream so it can't flash under the new header
    setUnread((prev) => ({ ...prev, [threadId]: 0 })); // opening a thread clears its badge
    setSelectedThreadId(threadId);
  }

  // a new-chat pick: person -> open/create the P2P thread, company -> the C2C.
  async function handleNewChatSelect(sel: NewChatSelection) {
    const threadId =
      sel.kind === "person"
        ? await openOrCreateP2pThread(sel.relationshipId, sel.otherPersonId!)
        : await resolveC2cThread(sel.relationshipId);
    // refresh the list FIRST so selectedConversation (looked up from the list)
    // resolves the brand-new thread - else the panel shows the empty state (Pitfall 5).
    await getConversations().then(setConversations);
    setSelectedThreadId(threadId);
    setPickerOpen(false);
  }

  async function handleSend(body: string) {
    const text = body.trim();
    if (!selectedThreadId || !text) return;
    // optimistic: show my message instantly; the canonical refetch below (and the
    // realtime echo) replace the whole list, so the temp is swapped for the real row.
    const optimistic: ChatMessageView = {
      id: `optimistic-${crypto.randomUUID()}`,
      thread_id: selectedThreadId,
      sender: "person",
      sender_person_id: null,
      type: "message",
      body: text,
      metadata: {},
      created_at: new Date().toISOString(),
      deleted_at: null,
      isMine: true,
      authorName: "",
      authorInitials: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    const updated = await postMessage(selectedThreadId, text);
    setMessages(updated);
    // refresh the list so the new message updates the preview + ordering
    void getConversations().then(setConversations);
  }

  // live updates - a message or new thread from the other side appears with no
  // reload (Supabase Realtime, RLS-filtered so privacy holds).
  useChatRealtime({
    onMessageInsert: (threadId) => {
      if (threadId === selectedThreadId) {
        void getMessages(threadId).then(setMessages);
      } else {
        setUnread((prev) => ({ ...prev, [threadId]: (prev[threadId] ?? 0) + 1 }));
      }
      void getConversations().then(setConversations);
    },
    onThreadInsert: () => {
      void getConversations().then(setConversations);
    },
  });

  return (
    <div className="flex h-full gap-3">
      {/* panel 3 - conversation list */}
      <div className="glass flex w-64 shrink-0 flex-col overflow-hidden rounded-3xl">
        {loading ? (
          <p className="flex-1 p-6 text-center text-sm text-ink/40">Loading conversations…</p>
        ) : (
          <ConversationList
            conversations={listConversations}
            filter={filter}
            onFilterChange={setFilter}
            selectedThreadId={selectedThreadId}
            onSelect={handleSelect}
            connections={connections}
            search={search}
            onSearchChange={setSearch}
            pickerOpen={pickerOpen}
            onTogglePicker={() => setPickerOpen((v) => !v)}
            onClosePicker={() => setPickerOpen(false)}
            onNewChatSelect={handleNewChatSelect}
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
