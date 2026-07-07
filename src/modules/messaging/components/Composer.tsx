import { useRef, useState } from "react";
import {
  Plus,
  Type,
  Smile,
  AtSign,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link as LinkIcon,
  ListOrdered,
  List,
  Mic,
  Maximize2,
  Minimize2,
  Handshake,
  Upload,
  Image as ImageIcon,
  Video,
  type LucideIcon,
} from "lucide-react";

/**
 * The P2P message-entry area (panel 4 footer). Two stacked parts:
 *   1. The textarea - Enter sends; Shift+Enter = newline; expand grows it.
 *   2. A toolbar:
 *      - the `+` menu (Create a deal = real; uploads = "soon" placeholders).
 *      - WORKING formatting (5A.3): bold/italic/underline/strike wrap the
 *        selection in marks (**b** _i_ ++u++ ~~s~~), link inserts [text](url),
 *        the list buttons prefix the line, and emoji inserts a character. The
 *        marks render as real formatting in the bubble (see RichText) - the
 *        Slack/WhatsApp pattern, all frontend, no backend.
 *      - Text style + Mention stay "soon" (headings aren't needed; mentions need
 *        a people list we don't wire here).
 */
export interface ComposerProps {
  onSend: (body: string) => void;
  /** "Message to {name} from {company}…" - whom this draft is addressed to. */
  placeholder: string;
}

/** A small, B2B-friendly emoji set for the picker. */
const EMOJIS = [
  "👍", "🙏", "🤝", "✅", "❌", "🔥", "🎉", "💪",
  "📦", "🚚", "💰", "📈", "⭐", "❤️", "👋", "😊",
  "🙌", "💯", "⏰", "📝", "✨", "👀", "😅", "🚀",
];

export function Composer({ onSend, placeholder }: ComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const canSend = text.trim().length > 0;

  function submit() {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
    setExpanded(false);
  }

  /** Wrap the current selection (or a placeholder) in `before`/`after` marks. */
  function surround(before: string, after: string, placeholder: string) {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    const sel = text.slice(start, end) || placeholder;
    setText(text.slice(0, start) + before + sel + after + text.slice(end));
    const selStart = start + before.length;
    const selEnd = selStart + sel.length;
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(selStart, selEnd);
    });
  }

  /** Prefix the line the cursor sits on (for the list buttons). */
  function prefixLine(prefix: string) {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? 0;
    const end = ta?.selectionEnd ?? 0;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    setText(text.slice(0, lineStart) + prefix + text.slice(lineStart));
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(start + prefix.length, end + prefix.length);
    });
  }

  /** Insert a string (emoji) at the cursor. */
  function insertAtCursor(s: string) {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + s + text.slice(end));
    const caret = start + s.length;
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="border-t border-black/5 p-3">
      {/* Composer box: textarea + expand, then the toolbar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="rounded-2xl bg-white/70 ring-1 ring-black/5 transition-shadow focus-within:ring-brand/30"
      >
        <div className="relative">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            rows={expanded ? 10 : 2}
            className="w-full resize-none bg-transparent px-3.5 py-3 pr-10 text-sm text-ink outline-none transition-all placeholder:text-ink/35"
          />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse composer" : "Expand composer"}
            title={expanded ? "Collapse" : "Expand"}
            className="absolute right-2.5 top-2.5 text-ink/35 transition-colors hover:text-ink/60"
          >
            {expanded ? (
              <Minimize2 size={15} strokeWidth={1.75} />
            ) : (
              <Maximize2 size={15} strokeWidth={1.75} />
            )}
          </button>
        </div>

        {/* toolbar */}
        <div className="flex items-center gap-1 px-2 pb-2 pt-1">
          <div className="flex flex-wrap items-center gap-0.5">
            <PlusMenu open={menuOpen} setOpen={setMenuOpen} />
            <Divider />
            <ToolBtn icon={Type} label="Text style" soon />
            <EmojiButton open={emojiOpen} setOpen={setEmojiOpen} onPick={insertAtCursor} />
            <ToolBtn icon={AtSign} label="Mention" soon />
            <Divider />
            <ToolBtn icon={Bold} label="Bold" onClick={() => surround("**", "**", "bold")} />
            <ToolBtn icon={Italic} label="Italic" onClick={() => surround("_", "_", "italic")} />
            <ToolBtn icon={Underline} label="Underline" onClick={() => surround("++", "++", "underline")} />
            <ToolBtn icon={Strikethrough} label="Strikethrough" onClick={() => surround("~~", "~~", "strike")} />
            <Divider />
            <ToolBtn icon={LinkIcon} label="Link" onClick={() => surround("[", "](url)", "text")} />
            <ToolBtn icon={ListOrdered} label="Numbered list" onClick={() => prefixLine("1. ")} />
            <ToolBtn icon={List} label="Bulleted list" onClick={() => prefixLine("- ")} />
          </div>
          <div className="ml-auto">
            <ToolBtn icon={Mic} label="Voice message" soon />
          </div>
        </div>
      </form>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-black/10" aria-hidden />;
}

/**
 * One toolbar affordance. With `onClick` it's a working control; with `soon` it's
 * a clearly-disabled placeholder (its backend - headings, mentions, voice - isn't
 * built). Formatting buttons are real (they insert marks RichText renders).
 */
function ToolBtn({
  icon: Icon,
  label,
  onClick,
  soon = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  soon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={soon}
      aria-label={label}
      title={soon ? `${label} - coming soon` : label}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
        soon
          ? "cursor-not-allowed text-ink/25"
          : "text-ink/45 hover:bg-ink/5 hover:text-ink/70"
      }`}
    >
      <Icon size={15} strokeWidth={1.75} />
    </button>
  );
}

/** Emoji button + a small popover grid; clicking inserts the emoji at the cursor. */
function EmojiButton({
  open,
  setOpen,
  onPick,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onPick: (emoji: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Emoji"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Emoji"
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
          open ? "bg-brand-soft/60 text-brand" : "text-ink/45 hover:bg-ink/5 hover:text-ink/70"
        }`}
      >
        <Smile size={15} strokeWidth={1.75} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute bottom-full left-0 z-20 mb-2 grid w-56 grid-cols-8 gap-0.5 rounded-2xl p-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onPick(e);
                  setOpen(false);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md text-base transition-colors hover:bg-brand-soft/50"
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The `+` attachment menu. "Create a deal" is REAL - it fires the `hs:create-deal`
 * window event that DealPin listens for, opening the existing create flow (a
 * second door, no new write path - the AI fence holds). The upload items are UI
 * placeholders ("soon") until a storage slice (bucket + RLS) lands.
 */
function PlusMenu({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  function createDeal() {
    window.dispatchEvent(new CustomEvent("hs:create-deal"));
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Add"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Add"
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
          open ? "bg-brand-soft/60 text-brand" : "text-ink/45 hover:bg-ink/5 hover:text-ink/70"
        }`}
      >
        <Plus size={15} strokeWidth={2} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute bottom-full left-0 z-20 mb-2 w-56 rounded-2xl p-1.5">
            <button
              type="button"
              onClick={createDeal}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-brand transition-colors hover:bg-brand-soft/45"
            >
              <Handshake size={16} strokeWidth={2} /> Create a deal
            </button>
            <div className="my-1 h-px bg-black/5" />
            <PlusStub icon={Upload} label="Upload a file" />
            <PlusStub icon={ImageIcon} label="Photo" />
            <PlusStub icon={Video} label="Video" />
          </div>
        </>
      )}
    </div>
  );
}

/** A disabled `+` menu item - a UI placeholder until storage (uploads) lands. */
function PlusStub({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink/35"
    >
      <Icon size={16} strokeWidth={1.75} /> {label}
      <span className="ml-auto text-[10px] font-normal text-ink/30">soon</span>
    </button>
  );
}
