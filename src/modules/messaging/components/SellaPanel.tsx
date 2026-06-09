import { useState } from "react";
import {
  Sparkles,
  PencilLine,
  Handshake,
  FileText,
  ScrollText,
  Send,
  type LucideIcon,
} from "lucide-react";
import type { ConversationListItem } from "../types";

/**
 * Sella rail (panel 5) - the copilot's *persistent* presence beside the thread.
 * Where an in-chat Sella line is an active, centered intervention, this panel is
 * the always-there context: who you're talking to + the next steps Sella can take.
 * Suggestions are visual stubs for now (the deal flow is 3a+); they show the
 * shape of the copilot without pretending the actions are wired.
 */
export interface SellaPanelProps {
  conversation: ConversationListItem | null;
}

export function SellaPanel({ conversation }: SellaPanelProps) {
  return (
    <div className="glass flex w-80 shrink-0 flex-col overflow-hidden rounded-3xl">
      {/* header */}
      <div className="flex items-center gap-2.5 border-b border-black/5 p-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft/60 text-brand-deep ring-1 ring-brand/15">
          <Sparkles size={16} strokeWidth={2} />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-ink">Sella</span>
          <span className="text-[11px] text-ink/45">Your deal copilot</span>
        </div>
      </div>

      {conversation ? (
        <SellaContext conversation={conversation} />
      ) : (
        <SellaEmpty />
      )}

      {/* ask-Sella input - the human side of the copilot chat */}
      <SellaComposer />
    </div>
  );
}

/**
 * The human's line to Sella. A single quiet input (no formatting toolbar - this
 * is a copilot quick-ask, not a peer message). The reply path is the Sella
 * runtime (4a+); for now it clears on send rather than faking a response.
 */
function SellaComposer() {
  const [text, setText] = useState("");
  const canSend = text.trim().length > 0;

  function submit() {
    if (!canSend) return;
    // TODO(4a): hand the prompt to the Sella runtime and stream a reply.
    setText("");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2 border-t border-black/5 p-3"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask Sella anything…"
        className="min-w-0 flex-1 rounded-xl bg-white/70 px-3.5 py-2 text-sm text-ink ring-1 ring-black/5 outline-none placeholder:text-ink/35 focus:ring-brand/30"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Ask Sella"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-deep disabled:opacity-40 disabled:hover:bg-brand"
      >
        <Send size={16} strokeWidth={2} />
      </button>
    </form>
  );
}

/** Per-conversation copilot content. */
function SellaContext({ conversation }: { conversation: ConversationListItem }) {
  const isC2C = conversation.threadType === "c2c";

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      {/* context card */}
      <div className="rounded-2xl bg-white/55 p-3 ring-1 ring-black/5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">
          Context
        </p>
        <p className="mt-1 text-sm leading-snug text-ink/75">
          {isC2C ? (
            <>
              The company channel with{" "}
              <span className="font-medium text-ink">{conversation.companyName}</span> -
              you&apos;re messaging on behalf of your company here.
            </>
          ) : (
            <>
              You&apos;re chatting with{" "}
              <span className="font-medium text-ink">{conversation.name}</span> at{" "}
              <span className="font-medium text-ink">{conversation.companyName}</span>.
            </>
          )}
        </p>
      </div>

      {/* suggested next steps */}
      <div>
        <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
          Suggested next steps
        </p>
        <div className="flex flex-col gap-2">
          {(isC2C ? C2C_ACTIONS : P2P_ACTIONS).map((a) => (
            <SuggestionButton key={a.label} icon={a.icon} label={a.label} hint={a.hint} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SellaEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <Sparkles size={22} strokeWidth={1.5} className="text-brand/50" />
      <p className="text-sm text-ink/45">
        Pick a conversation and I&apos;ll surface deal ideas and quick replies here.
      </p>
    </div>
  );
}

interface SellaAction {
  icon: LucideIcon;
  label: string;
  hint: string;
}

const P2P_ACTIONS: ReadonlyArray<SellaAction> = [
  { icon: PencilLine, label: "Draft a reply", hint: "Sella suggests a response" },
  { icon: Handshake, label: "Start a deal", hint: "Open a deal card in this chat" },
  { icon: FileText, label: "Share a price list", hint: "Send your latest catalog" },
  { icon: ScrollText, label: "Summarize this thread", hint: "Catch up in one line" },
];

const C2C_ACTIONS: ReadonlyArray<SellaAction> = [
  { icon: ScrollText, label: "Summarize activity", hint: "What's happened with this company" },
  { icon: Handshake, label: "View the relationship", hint: "Deals, people and history" },
];

/** A Sella suggestion - visual stub until the deal/draft flows land (3a+). */
function SuggestionButton({ icon: Icon, label, hint }: SellaAction) {
  return (
    <button
      type="button"
      title="Coming soon"
      className="flex items-start gap-2.5 rounded-2xl bg-white/55 p-3 text-left ring-1 ring-black/5 transition-colors hover:bg-white/80 hover:ring-brand/20"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft/50 text-brand-deep">
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-[11px] text-ink/45">{hint}</span>
      </span>
    </button>
  );
}
