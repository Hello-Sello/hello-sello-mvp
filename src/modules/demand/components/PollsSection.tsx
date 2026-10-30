"use client";

import { useState } from "react";
import { BarChart3, Check, ChevronDown, Copy, ExternalLink, Trash2 } from "lucide-react";
import { contactById, productById } from "../data";
import { deletePoll, shareUrl, usePolls } from "../store";
import type { DemandPoll } from "../types";

const DAY = 24 * 60 * 60 * 1000;

function formatGrams(g: number) {
  return g >= 1000 ? `${(g / 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 })} kg` : `${g} g`;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function totalsFor(poll: DemandPoll) {
  return poll.productIds
    .map((id) => ({
      id,
      name: productById(id)?.name ?? id,
      grams: poll.responses.reduce((sum, r) => sum + (r.quantities[id] ?? 0), 0),
      voters: poll.responses.filter((r) => (r.quantities[id] ?? 0) > 0).length,
    }))
    .sort((a, b) => b.grams - a.grams);
}

/** "Your polls" — every poll with its live results, newest first. */
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
  const totals = totalsFor(poll);
  const totalGrams = totals.reduce((s, t) => s + t.grams, 0);
  const max = Math.max(1, ...totals.map((t) => t.grams));
  const url = typeof window === "undefined" ? "" : shareUrl(window.location.origin, poll);
  const sentTo = poll.recipientIds.map((id) => contactById(id)?.name).filter(Boolean);

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
            {sentTo.length ? `sent to ${sentTo.length} contacts` : "shared by link"} · created {formatDate(poll.createdAt)}
          </span>
        </span>
        <span className="hidden text-right sm:block">
          <span className="block text-sm font-bold text-ink">{formatGrams(totalGrams)}</span>
          <span className="block text-[11px] text-ink-muted">
            {poll.responses.length} response{poll.responses.length === 1 ? "" : "s"}
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
        <div className="grid gap-5 border-t border-black/[0.06] px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* demand per product */}
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-ink-muted/70">Demand per product</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {totals.map((t) => (
                <li key={t.id}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-semibold text-ink">{t.name}</span>
                    <span className="text-ink-muted">
                      <span className="font-bold text-ink">{formatGrams(t.grams)}</span> · {t.voters} pharm.
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/5">
                    <div
                      className="h-full rounded-full bg-brand transition-all"
                      style={{ width: `${(t.grams / max) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* responses */}
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-ink-muted/70">Responses</h3>
            {poll.responses.length === 0 ? (
              <p className="mt-2 rounded-xl bg-white/70 p-3 text-sm text-ink-muted">
                Waiting for the first answer. Share the link to collect demand.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {poll.responses.map((r) => {
                  const grams = Object.values(r.quantities).reduce((s, g) => s + g, 0);
                  return (
                    <li key={r.id} className="rounded-xl bg-white/70 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{r.company}</span>
                        <span className="shrink-0 text-sm font-bold text-ink">{formatGrams(grams)}</span>
                      </div>
                      <div className="text-[11px] text-ink-muted">
                        {r.name} · {formatDate(r.submittedAt)} ·{" "}
                        {Object.entries(r.quantities)
                          .map(([id, g]) => `${productById(id)?.name ?? id} ${formatGrams(g)}`)
                          .join(", ")}
                      </div>
                      {r.note && <div className="mt-1 text-[12px] italic text-ink/70">“{r.note}”</div>}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-deep"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy link"}
              </button>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-black/[0.05] hover:text-ink"
              >
                <ExternalLink size={13} /> Open poll page
              </a>
              <button
                type="button"
                onClick={() => deletePoll(poll.id)}
                className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
