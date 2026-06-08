import { useEffect, useRef } from "react";
import { Building2 } from "lucide-react";
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

  // keep the latest message in view as the stream grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-black/5 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink/70 ring-1 ring-black/5">
          {isC2C ? (
            <Building2 size={16} strokeWidth={1.75} className="text-ink/55" />
          ) : (
            conversation.initials
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
      </div>

      {/* stream */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

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
