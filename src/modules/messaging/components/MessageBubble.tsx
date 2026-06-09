import { Sparkles } from "lucide-react";
import type { ChatMessageView } from "../types";
import { formatTimeAgo } from "../lib/chat-display";

/**
 * One line in the thread stream (panel 4), rendered in its sender's voice.
 * Two voices sit centered because neither belongs to a party in the chat:
 *   - system -> a quiet centered notice (the platform narrating a fact)
 *   - sella  -> a centered copilot card with a Sella mark (an agent intervening)
 * The two party voices take sides, driven by `isMine` (the viewer's perspective):
 *   - person mine   -> right + brand
 *   - person theirs -> left + glass
 */
export interface MessageBubbleProps {
  message: ChatMessageView;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.sender === "system") {
    return (
      <div className="my-1 flex justify-center">
        <span className="rounded-full bg-ink/5 px-3 py-1 text-center text-[11px] text-ink/50">
          {message.body}
        </span>
      </div>
    );
  }

  if (message.sender === "sella") {
    return (
      <div className="my-1 flex justify-center">
        <div className="max-w-md rounded-2xl bg-brand-soft/30 px-4 py-2.5 ring-1 ring-brand/15">
          <div className="mb-0.5 flex items-center justify-center gap-1 text-[11px] font-semibold text-brand-deep">
            <Sparkles size={12} strokeWidth={2} />
            Sella
          </div>
          <p className="text-center text-sm leading-snug text-ink/80">{message.body}</p>
        </div>
      </div>
    );
  }

  // person
  if (message.isMine) {
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-sm leading-snug text-white">
          {message.body}
        </div>
        <span className="mt-0.5 pr-1 text-[10px] text-ink/35">
          {formatTimeAgo(message.created_at)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-ink/70 ring-1 ring-black/5">
        {message.authorInitials}
      </span>
      <div className="flex flex-col items-start">
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white/70 px-3 py-2 text-sm leading-snug text-ink/85 ring-1 ring-black/5">
          {message.body}
        </div>
        <span className="mt-0.5 pl-1 text-[10px] text-ink/35">
          {message.authorName} · {formatTimeAgo(message.created_at)}
        </span>
      </div>
    </div>
  );
}
