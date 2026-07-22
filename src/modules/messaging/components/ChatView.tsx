"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare } from "lucide-react";
import type { ChatMessageView, ConversationListItem, MyConnectionsView } from "../types";
import type { ChatFilter } from "./ConversationList";
import { NewChatDropdown, type NewChatSelection } from "./NewChatDropdown";
import {
  getConversations,
  getMessages,
  markRead,
  postMessage,
  createGroupThread,
} from "../supabase/store";
import {
  getMyConnections,
  openOrCreateP2pThread,
  resolveC2cThread,
  NEW_GROUP_EVENT,
  type NewGroupEventDetail,
} from "@/modules/messaging";
import { useChatRealtime } from "../lib/use-chat-realtime";
import { usePersistedCollapse } from "@/shared/ui/use-persisted-collapse";
import { Dialog } from "@/modules/relationship/components/Dialog";
import { ConversationList } from "./ConversationList";
import { GroupPicker } from "./GroupPicker";
import { ThreadView } from "./ThreadView";

/**
 * Chat orchestrator (panels 3 + 4). The ONLY stateful piece of the chat: holds
 * conversations + active-filter + selected thread + current message stream.
 * Mirrors InboxView's structure so the data-swap path is the same: only the
 * import bindings change to real Supabase calls; layout + state stay put.
 */
export function ChatView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [loading, setLoading] = useState(true);
  // panel-3 collapse (mirrors the global IconRail, same shared hook so it is
  // REMEMBERED across reloads): shrink the conversation list to a narrow avatar
  // strip so the thread + deal card get more room. The width lives on the
  // wrapper here (only the parent can shrink the rail); the list renders the
  // strip when collapsed.
  const [railCollapsed, toggleRailCollapsed] = usePersistedCollapse(
    "hs:chat-list-collapsed",
  );
  // live unread counts per thread, cleared on open - in-memory for the demo
  const [unread, setUnread] = useState<Record<string, number>>({});
  // the new-chat picker: the connected directory + its open/closed flag + the
  // live conversation-search value (local useState only - no global store)
  const [connections, setConnections] = useState<MyConnectionsView>({
    companies: [],
    viewerCompanyId: null,
    viewerPersonId: "",
    myCompany: null,
  });
  // which picker is open (D-02): the New-Chat picker, the New-Group picker, or
  // none. A New-Group opened from a deal card carries that deal's id (deal mode).
  const [pickerMode, setPickerMode] = useState<"newchat" | "group" | null>(null);
  const [groupDealCardId, setGroupDealCardId] = useState<string | null>(null);
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

  // Task 8b - land on a specific relationship's c2c chat with a deal card open
  // (dealChatUrl, `@/modules/deals`). Both createDeal() callers that need to
  // show their result (the basket popover + the chat "Create Deal" button)
  // route here as `?relationship=<id>&deal=<dealCardId>`. DealPin itself needs
  // no new selection logic - it already defaults to the newest live deal for a
  // relationship - so this effect only closes the actual gap: nothing else
  // lets you deep-link INTO a specific relationship's chat (selectedThreadId
  // is plain client state, never synced to the URL).
  useEffect(() => {
    const relationshipId = searchParams.get("relationship");
    const dealCardId = searchParams.get("deal");
    if (!relationshipId) return;
    let alive = true;
    let rafId: number | null = null;
    void resolveC2cThread(relationshipId)
      .then(async (threadId) => {
        await getConversations().then((list) => {
          if (alive) setConversations(list);
        });
        if (!alive) return;
        setSelectedThreadId(threadId);
        if (!dealCardId) return;
        // Deferred a frame, matching the deal deep-link page's dispatch
        // (src/app/connect/deal/[dealCardId]/page.tsx, D-32) for cheap
        // insurance against DealCardPanelHost's `hs:open-deal-card` listener
        // effect. By this point resolveC2cThread's network round-trip has
        // already let any same-commit mount effects settle, so - unlike that
        // page's SYNCHRONOUS dispatch on mount - the defer likely isn't
        // load-bearing here; kept anyway since it's free and one less thing
        // to reason about if the timing ever changes.
        rafId = requestAnimationFrame(() => {
          window.dispatchEvent(
            new CustomEvent("hs:open-deal-card", { detail: { dealCardId } }),
          );
        });
      })
      .catch((e) => console.error("Task 8b: resolve c2c thread failed", e));
    return () => {
      alive = false;
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [searchParams]);

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
    setPickerMode(null);
  }

  function handleOpenPicker(mode: "newchat" | "group") {
    // opening from the +New menu is always a plain (non-deal) picker; deal mode
    // is entered only via the hs:new-group event below.
    setGroupDealCardId(null);
    setPickerMode(mode);
  }

  function handleClosePicker() {
    setPickerMode(null);
    setGroupDealCardId(null);
  }

  // create a group (D-04 new-chat / deal). Every member is active immediately.
  async function handleCreateGroup(input: {
    name: string;
    memberPersonIds: string[];
    dealCardId?: string;
  }) {
    const result = await createGroupThread(input);
    // refresh so the new group row appears in the rail (and resolves on select)
    await getConversations().then(setConversations);
    return result;
  }

  // finished creating a group: open it + close the picker (mirrors new-chat).
  function handleGroupDone(threadId: string) {
    setSelectedThreadId(threadId);
    handleClosePicker();
  }

  // the deal card (07-07) dispatches hs:new-group to open the picker in deal
  // mode; messaging listens here, keeping the two modules acyclic.
  useEffect(() => {
    function onNewGroup(e: Event) {
      const detail = (e as CustomEvent<NewGroupEventDetail>).detail;
      setGroupDealCardId(detail?.dealCardId ?? null);
      setPickerMode("group");
    }
    window.addEventListener(NEW_GROUP_EVENT, onNewGroup);
    return () => window.removeEventListener(NEW_GROUP_EVENT, onNewGroup);
  }, []);

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
      {/* panel 3 - conversation list. Collapses to a narrow avatar strip via a
          toggle (mirrors the global IconRail's collapse) so the thread + deal
          card get more room. Width lives here on the wrapper so the rail can
          actually shrink; the list renders the strip when collapsed. w-72
          expanded keeps the Deal Card leaflet room to breathe (04C). */}
      <div
        className={`glass flex shrink-0 flex-col overflow-hidden rounded-3xl transition-[width] duration-200 ease-out motion-reduce:transition-none ${
          railCollapsed ? "w-[68px]" : "w-72"
        }`}
      >
        {loading && !railCollapsed ? (
          <p className="flex-1 p-6 text-center text-sm text-ink/40">Loading conversations…</p>
        ) : (
          <ConversationList
            conversations={listConversations}
            filter={filter}
            onFilterChange={setFilter}
            selectedThreadId={selectedThreadId}
            onSelect={handleSelect}
            collapsed={railCollapsed}
            onToggleCollapsed={toggleRailCollapsed}
            search={search}
            onSearchChange={setSearch}
            pickerMode={pickerMode}
            onOpenPicker={handleOpenPicker}
          />
        )}
      </div>

      {/* New-chat picker (D-01/D-02): a real centered dialog, not an inline
          sidebar leaflet - a single pick resolves + closes immediately (no
          name field, no Create/Cancel footer - unlike the group picker). */}
      <Dialog open={pickerMode === "newchat"} onClose={handleClosePicker} width="max-w-[420px]">
        <NewChatDropdown connections={connections} onSelect={handleNewChatSelect} />
      </Dialog>

      {/* New-group picker (D-02/D-05): a real centered dialog, not an inline
          sidebar leaflet - owned here since ChatView already holds pickerMode,
          groupDealCardId, and every handler the picker needs. */}
      <Dialog open={pickerMode === "group"} onClose={handleClosePicker} width="max-w-[640px]">
        <GroupPicker
          connections={connections}
          mode={groupDealCardId ? "deal" : "newchat"}
          dealCardId={groupDealCardId ?? undefined}
          onCreate={handleCreateGroup}
          onDone={handleGroupDone}
          onClose={handleClosePicker}
        />
      </Dialog>

      {/* panel 4 - thread */}
      <div className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
        {selectedConversation ? (
          <ThreadView
            conversation={selectedConversation}
            messages={messages}
            onSend={handleSend}
            onGroupRenamed={() => void getConversations().then(setConversations)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center text-ink/40">
            <MessageSquare size={28} strokeWidth={1.5} />
            <p className="mt-3 text-sm">Select a conversation to start reading</p>
          </div>
        )}
      </div>

      {/* Sella panel (old panel 5) removed - the thread now expands to fill.
          Sella's only presence is the route-level ping bubble (SellaPlaceholderBar,
          right edge); the real Sella opens from there in Phase 8. */}
    </div>
  );
}
