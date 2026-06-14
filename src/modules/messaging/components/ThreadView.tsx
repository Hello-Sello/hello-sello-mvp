import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Users, MoreHorizontal, BellOff, Search, type LucideIcon } from "lucide-react";
import { DealPin } from "@/modules/deals";
import type { ChatMessageView, ConversationListItem } from "../types";
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
}

export function ThreadView({ conversation, messages, onSend }: ThreadViewProps) {
  const isC2C = conversation.threadType === "c2c";
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // header overflow menu (⋯) - the home for secondary actions (some still stubs)
  const [menuOpen, setMenuOpen] = useState(false);

  // keep the latest message in view as the stream grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex h-full flex-col">
      {/* header (5A.2) - identity leads; the relationship door is now a quiet
          icon button (was a wordy "My Relationship with …" pill, which read as
          unprofessional). Pro-app pattern: words for the one thing that changes
          (the name), an icon + tooltip for the repeated action. */}
      <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-ink/70 ring-1 ring-black/5">
          {isC2C ? (
            <Building2 size={17} strokeWidth={1.75} className="text-ink/55" />
          ) : (
            conversation.initials
          )}
          {/* presence dot - UI placeholder until real presence (Supabase
              Realtime) is wired. Only on a person (P2P); a company channel is
              never "online", so no dot there. */}
          {!isC2C && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-white" />
          )}
        </span>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{conversation.name}</span>
            <span className="shrink-0 rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/45">
              {isC2C ? "C2C" : "P2P"}
            </span>
          </div>
          <span className="truncate text-[11px] text-ink/45">{conversation.subtitle}</span>
        </div>

        {/* actions - the relationship door (icon) + an overflow (⋯) menu for
            secondary actions. Some menu items are UI placeholders ("soon")
            until their backends (notifications, search) are built. */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Link
            href={`/connect/relationship/${conversation.relationshipId}`}
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
                    href={`/connect/relationship/${conversation.relationshipId}`}
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

      {/* the deal "Talking about" bar + the card floated on the right (3a);
          P2P + C2C both hang off a relationship, so the pin works in either */}
      <DealPin
        key={conversation.relationshipId}
        relationshipId={conversation.relationshipId}
        // propose + the pending-proposal strip are connected-P2P only (D13):
        // pass the thread for a P2P, omit it for a C2C company channel.
        threadId={isC2C ? undefined : conversation.threadId}
        counterpartyName={conversation.companyName}
      >
        {/* stream */}
        <div className="h-full overflow-y-auto p-4">
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
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
