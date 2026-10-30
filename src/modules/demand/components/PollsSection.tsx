"use client";

import { useState } from "react";
import { BarChart3, Check, ChevronDown, Copy, ExternalLink, Trash2 } from "lucide-react";
import { deletePoll, shareUrl, usePolls } from "../store";
import type { DemandPoll } from "../types";
import { PollGrid, formatGrams } from "./PollGrid";

const DAY = 24 * 60 * 60 * 1000;

/** "Your polls" — each poll with the same live group grid the pharmacies see. */
export function PollsSection({ highlightId }: { highlightId: string | null }) {
  const polls = usePolls();
  const [openId, setOpenId] = useState<string | null>(null);
  const [seenHighlight, setSeenHighlight] = useState<string | null>(null);

  // a freshly created poll opens itself
  if (highlightId !== seenHighlight) {
    setSeenHighlight(highlightId);
    if (highlightId) setOpenId(highlightId);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight text-ink">Polls</h2>
        <span className="rounded-full bg-brand-soft/60 px-2.5 py-0.5 text-[11px] font-bold text-brand-deep">
          {polls.length}
        </span>
      </div>

      {polls.length === 0 ? (
        <div className="glass rounded-2xl px-4 py-10 text-center text-sm text-ink-muted">
          No polls yet — create one above.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {polls.map((poll) => (
            <PollRow
              key={poll.id}
              poll={poll}
              open={openId === poll.id}
              onToggle={() => setOpenId(openId === poll.id ? null : poll.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PollRow({ poll, open, onToggle }: { poll: DemandPoll; open: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);
  // eslint-disable-next-line react-hooks/purity -- demo: status is read at render time
  const now = Date.now();
  const closed = now > poll.expiresAt;
  const daysLeft = Math.max(0, Math.ceil((poll.expiresAt - now) / DAY));
  const totalGrams = poll.responses.reduce(
    (s, r) => s + Object.values(r.quantities).reduce((a, g) => a + g, 0),
    0,
  );
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = shareUrl(origin, poll);
  const invited = poll.recipientIds.length;
  const filled = poll.responses.length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="glass overflow-hidden rounded-2xl">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-brand/[0.03]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <BarChart3 size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-ink">{poll.title}</span>
            <span className="block text-xs text-ink-muted">
              {poll.productIds.length} products ·{" "}
              {poll.channel === "email" ? `emailed to ${invited} pharmacies` : "shared by link"} · created{" "}
              {new Date(poll.createdAt).toLocaleDateString("en-GB")}
            </span>
          </span>
          <span className="hidden text-right sm:block">
            <span className="block text-sm font-bold text-ink">{formatGrams(totalGrams)}</span>
            <span className="block text-[11px] text-ink-muted">
              {invited ? `${Math.min(filled, invited)} of ${invited} filled in` : `${filled} filled in`}
            </span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              closed ? "bg-ink/5 text-ink-muted" : "bg-success/10 text-success"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {closed ? "Closed" : `Open · ${daysLeft}d`}
          </span>
          <ChevronDown size={16} className={`shrink-0 text-ink-muted transition ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.06] px-4 py-2.5">
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-deep"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy group link"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-black/[0.05] hover:text-ink"
            >
              <ExternalLink size={13} /> Open poll page
            </a>
            <span className="text-[11px] text-ink-muted">Each pharmacy&apos;s own link: the link icon on its row.</span>
            <button
              type="button"
              onClick={() => deletePoll(poll.id)}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}
      </div>

      {open && (
        <PollGrid
          shared={poll}
          responses={poll.responses}
          mode="view"
          linkFor={(cid) => shareUrl(origin, poll, cid)}
        />
      )}
    </div>
  );
}
