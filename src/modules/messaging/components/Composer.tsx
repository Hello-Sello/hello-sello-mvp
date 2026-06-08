import { useState } from "react";
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
  type LucideIcon,
} from "lucide-react";

/**
 * The P2P message-entry area (panel 4 footer). Three stacked parts that match
 * the chat design:
 *   1. Sella suggestion chips - pre-written quick replies; clicking one drops its
 *      text into the box (the "recommendations" chip seeds a few bulleted lines).
 *   2. The textarea - the one real control. Enter sends; Shift+Enter = newline.
 *      The expand toggle grows it so longer / bulleted drafts are readable.
 *   3. A formatting toolbar - design chrome for now (rich-text is a later pass),
 *      so the icons render but don't format yet.
 * Rendered only for P2P threads; the C2C notice board is read-only.
 */
export interface ComposerProps {
  onSend: (body: string) => void;
  /** "Message to {name} from {company}…" - whom this draft is addressed to. */
  placeholder: string;
}

/** Pre-written suggestions. `fill` is the draft each chip drops into the box. */
const SUGGESTIONS: ReadonlyArray<{ label: string; fill: string }> = [
  {
    label: "Sella recommendations and pre-written answers…",
    fill: [
      "- Thanks for reaching out!",
      "- Here's what we currently have available:",
      "- Happy to put a custom offer together for you.",
    ].join("\n"),
  },
  { label: "What's new in stock?", fill: "Hi - what's new in your stock right now?" },
  {
    label: "Create offer for new products…",
    fill: "I'd like to put together an offer for our new products: ",
  },
];

/** Left-side toolbar groups (the dividers between them are drawn in render). */
const TOOL_GROUPS: ReadonlyArray<ReadonlyArray<{ icon: LucideIcon; label: string }>> = [
  [
    { icon: Plus, label: "Add attachment" },
    { icon: Type, label: "Text style" },
    { icon: Smile, label: "Emoji" },
    { icon: AtSign, label: "Mention" },
  ],
  [
    { icon: Bold, label: "Bold" },
    { icon: Italic, label: "Italic" },
    { icon: Underline, label: "Underline" },
    { icon: Strikethrough, label: "Strikethrough" },
  ],
  [
    { icon: LinkIcon, label: "Link" },
    { icon: ListOrdered, label: "Numbered list" },
    { icon: List, label: "Bulleted list" },
  ],
];

export function Composer({ onSend, placeholder }: ComposerProps) {
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const canSend = text.trim().length > 0;

  function submit() {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
    setExpanded(false);
  }

  return (
    <div className="border-t border-black/5 p-3">
      {/* 1. Sella suggestion chips */}
      <div className="mb-2 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => {
              setText(s.fill);
              if (s.fill.includes("\n")) setExpanded(true);
            }}
            className="rounded-lg bg-brand-soft/60 px-3 py-1.5 text-xs text-brand-deep ring-1 ring-brand/15 transition-colors hover:bg-brand-soft"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 2 + 3. Composer box: textarea + expand, then the toolbar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="rounded-2xl bg-white/70 ring-1 ring-black/5 transition-shadow focus-within:ring-brand/30"
      >
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts a newline (standard chat behaviour).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            rows={expanded ? 6 : 2}
            className="w-full resize-none bg-transparent px-3.5 py-3 pr-10 text-sm text-ink outline-none placeholder:text-ink/35"
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

        {/* formatting toolbar - design chrome (rich-text formatting is a later pass) */}
        <div className="flex items-center gap-1 px-2 pb-2 pt-1">
          <div className="flex flex-wrap items-center gap-0.5">
            {TOOL_GROUPS.map((group, gi) => (
              <div key={gi} className="flex items-center gap-0.5">
                {gi > 0 && <span className="mx-1 h-4 w-px bg-black/10" aria-hidden />}
                {group.map((tool) => (
                  <ToolbarButton key={tool.label} icon={tool.icon} label={tool.label} />
                ))}
              </div>
            ))}
          </div>
          <div className="ml-auto">
            <ToolbarButton icon={Mic} label="Voice message" />
          </div>
        </div>
      </form>
    </div>
  );
}

/**
 * One toolbar affordance. Visual-only for now: it carries a tooltip and is
 * keyboard-reachable, but formatting isn't wired yet - this is the chat's
 * design chrome, not a working rich-text editor.
 */
function ToolbarButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} - coming soon`}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink/65"
    >
      <Icon size={15} strokeWidth={1.75} />
    </button>
  );
}
