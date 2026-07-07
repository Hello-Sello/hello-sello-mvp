import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Users, MoreHorizontal, BellOff, Search, ChevronDown, Pencil, Check, X, FileText, type LucideIcon } from "lucide-react";
import { DealPin } from "@/modules/deals";
import type { ChatMessageView, ConversationListItem } from "../types";
import { renameGroupThread } from "../supabase/store";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";

/**
 * The thread (panel 4): header + ordered message stream + composer. Both thread
 * types are writable - a P2P is person-to-person, a C2C is the company channel
 * you message on behalf of your company (it just also carries system lines).
 * Presentational - the parent owns data + send.
 */
export interface ThreadViewProps {
  conversation: ConversationListItem;
  messages: ChatMessageView[];
  onSend: (body: string) => void;
  /** re-read the conversation list after an in-chat group rename (D-06) */
  onGroupRenamed?: () => void;
}

export function ThreadView({ conversation, messages, onSend, onGroupRenamed }: ThreadViewProps) {
  const isC2C = conversation.threadType === "c2c";
  const isGroup = conversation.threadType === "group";
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // header overflow menu (⋯) - the home for secondary actions (some still stubs)
  const [menuOpen, setMenuOpen] = useState(false);

  // at-bottom detection: a reader scrolled up is NOT yanked down by a new
  // message, and the jump-to-bottom arrow shows only when scrolled up. The ref
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

  // keep the latest message in view as the stream grows - but ONLY when the
  // reader is already at the bottom, so reading history is never interrupted.
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length]);

  // one-time initial scroll: opening or switching a thread ALWAYS lands at the
  // newest message, regardless of isAtBottom (the at-bottom gate only governs
  // messages that arrive AFTER open). Keyed on the thread id so it re-fires on
  // a thread switch. We only reset the ref + scroll the DOM here; onScroll
  // remains the single owner of isAtBottom state (avoids a cascading render).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
    isAtBottomRef.current = true;
  }, [conversation.threadId]);

  // the ordered message stream + the floating jump-to-bottom arrow, shared by
  // the deal/c2c path (inside DealPin) and the group path (standalone).
  const stream = (
    <div className="relative h-full">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
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
  );

  // A group thread has no relationship anchor (person_a/b are unused), so it
  // does NOT delegate to DealPin. It renders its own header with an in-chat
  // rename (D-06) + the plain stream + composer.
  if (isGroup) {
    return (
      <div className="flex h-full flex-col">
        <GroupHeader
          key={conversation.threadId}
          conversation={conversation}
          onGroupRenamed={onGroupRenamed}
        />
        <div className="min-h-0 flex-1">{stream}</div>
        <Composer onSend={onSend} placeholder={`Message ${conversation.name}…`} />
      </div>
    );
  }

  // non-group threads (c2c/p2p/deal) are always anchored to a relationship -
  // only a group carries a null relationship_id (07-02), and groups render
  // above. Pin the id into a local so the relationship link + DealPin get a
  // concrete value.
  const relationshipId = conversation.relationshipId;
  if (!relationshipId) {
    // a non-group thread with no relationship is a data fault; show just the
    // message stream rather than a broken relationship pin.
    return <div className="flex h-full flex-col">{stream}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* C2C company channels keep their identity header here. A P2P deal thread
          delegates the whole top bar (avatar + relationship + deal + actions) to
          DealPin below, so there is NO separate header bar for P2P - it used to
          render almost blank, which read as a wasted strip. */}
      {isC2C && (
        <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-ink/70 ring-1 ring-black/5">
            <Building2 size={17} strokeWidth={1.75} className="text-ink/55" />
          </span>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-ink">{conversation.name}</span>
              <span className="shrink-0 rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/45">
                C2C
              </span>
            </div>
            <span className="truncate text-[11px] text-ink/45">{conversation.subtitle}</span>
          </div>

          {/* actions - the relationship door + an overflow (⋯) menu */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Link
              href={`/connect/relationship/${relationshipId}`}
              aria-label={`Relationship with ${conversation.companyName}`}
              title={`Relationship with ${conversation.companyName}`}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-ink/55 ring-1 ring-black/5 transition hover:bg-white/70 hover:text-brand hover:ring-brand/20"
            >
              <Users size={17} strokeWidth={1.75} />
            </Link>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="More"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-ink/55 ring-1 ring-black/5 transition hover:bg-white/70 hover:text-brand hover:ring-brand/20"
              >
                <MoreHorizontal size={17} strokeWidth={1.75} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="glass-strong absolute right-0 top-full z-20 mt-1.5 w-56 rounded-2xl p-1.5">
                    <Link
                      href={`/connect/relationship/${relationshipId}`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink transition hover:bg-black/[0.04]"
                    >
                      <Users size={15} strokeWidth={1.75} /> View relationship
                    </Link>
                    <MenuStub icon={BellOff} label="Mute notifications" />
                    <MenuStub icon={Search} label="Search in conversation" />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* the deal "Talking about" bar + the card opened on the right (3a);
          P2P + C2C both hang off a relationship, so the pin works in either.
          Phase 7 (D-32): the strip's "Deal [code]" chip opens the card as a
          right-side panel by DISPATCHING a window event (hs:open-deal-card) that
          the Connect layout's DealCardPanelHost listens for - so no open-handler
          prop is threaded here, and messaging stays acyclic with deals. */}
      <DealPin
        key={relationshipId}
        relationshipId={relationshipId}
        // propose + the pending-proposal strip are connected-P2P only (D13):
        // pass the thread for a P2P, omit it for a C2C company channel.
        threadId={isC2C ? undefined : conversation.threadId}
        counterpartyName={conversation.companyName}
        // 04A polish: the strip's top bar owns identity on the P2P deal path - the
        // PERSON's name on the left, the company on the relationship button (right).
        counterpartyPersonName={conversation.name}
        counterpartyInitials={conversation.initials}
      >
        {stream}
      </DealPin>

      {/* composer - writable for both types; only the placeholder differs */}
      <Composer
        onSend={onSend}
        placeholder={
          isC2C
            ? `Message ${conversation.companyName}…`
            : `Message to ${conversation.name} from ${conversation.companyName}…`
        }
      />
    </div>
  );
}

/**
 * The group thread header: avatar, an in-chat editable title (D-06 - click the
 * title / ✎, Enter saves, Esc cancels, anyone in the thread may rename), the
 * member subtitle, and - for a deal-born group - a "Deal" chip that opens the
 * card as a right-side panel (D-08/D-32) by dispatching `hs:open-deal-card`.
 */
function GroupHeader({
  conversation,
  onGroupRenamed,
}: {
  conversation: ConversationListItem;
  onGroupRenamed?: () => void;
}) {
  // This header is keyed by threadId at the call site, so it remounts (and
  // re-initializes) whenever a different group opens - no reset effect needed.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.name);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(conversation.name); // start from the current title
    setEditing(true);
  }

  async function save() {
    const next = draft.trim();
    if (!next || next === conversation.name) {
      setEditing(false);
      setDraft(conversation.name);
      return;
    }
    setSaving(true);
    try {
      await renameGroupThread({ threadId: conversation.threadId, name: next });
      onGroupRenamed?.();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-ink/70 ring-1 ring-black/5">
        <Users size={17} strokeWidth={1.75} className="text-ink/55" />
      </span>
      <div className="flex min-w-0 flex-col">
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(conversation.name);
              }
            }}
            onBlur={() => void save()}
            disabled={saving}
            autoFocus
            aria-label="Group name"
            className="w-48 rounded-md bg-ink/5 px-2 py-0.5 text-sm font-semibold text-ink outline-none ring-1 ring-brand/20"
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            title="Rename group"
            className="group/title flex items-center gap-1.5 text-left"
          >
            <span className="truncate text-sm font-semibold text-ink">{conversation.name}</span>
            <Pencil
              size={12}
              strokeWidth={1.9}
              className="shrink-0 text-ink/30 opacity-0 transition-opacity group-hover/title:opacity-100"
            />
          </button>
        )}
        <span className="truncate text-[11px] text-ink/45">{conversation.subtitle}</span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {editing && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void save()}
            aria-label="Save name"
            title="Save"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-success ring-1 ring-black/5 transition hover:bg-white/70"
          >
            <Check size={17} strokeWidth={2} />
          </button>
        )}
        {editing && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setEditing(false);
              setDraft(conversation.name);
            }}
            aria-label="Cancel rename"
            title="Cancel"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-ink/55 ring-1 ring-black/5 transition hover:bg-white/70"
          >
            <X size={17} strokeWidth={2} />
          </button>
        )}
        {conversation.dealCardId && !editing && (
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("hs:open-deal-card", {
                  detail: { dealCardId: conversation.dealCardId },
                }),
              )
            }
            aria-label="Open deal card"
            title="Open deal card"
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-medium text-ink/60 ring-1 ring-black/5 transition hover:bg-white/70 hover:text-brand hover:ring-brand/20"
          >
            <FileText size={15} strokeWidth={1.75} /> Deal
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A disabled item in the header's ⋯ menu - a UI placeholder for an action whose
 * backend isn't built yet (notifications, search). The "soon" tag keeps it from
 * being mistaken for a working feature.
 */
function MenuStub({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink/35"
    >
      <Icon size={15} strokeWidth={1.75} /> {label}
      <span className="ml-auto text-[10px] font-normal text-ink/30">soon</span>
    </button>
  );
}
