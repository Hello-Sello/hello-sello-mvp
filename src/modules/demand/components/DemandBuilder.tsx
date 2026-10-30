"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Link2, Mail } from "lucide-react";
import { DEMO_PRODUCTS, POLL_LIFETIME_DAYS, contactById } from "../data";
import { createPoll, shareUrl } from "../store";
import type { DemandChannel, DemandPoll } from "../types";
import { AudiencePillar } from "./AudiencePillar";
import { ProductPillar } from "./ProductPillar";
import { PillarHeader } from "./ui";

/**
 * The poll builder as three pillars, left to right: (1) products, (2) who,
 * (3) send by email or create a link. On create it hands the new poll up so the
 * Polls section below can open it.
 */
export function DemandBuilder({ onCreated }: { onCreated: (poll: DemandPoll) => void }) {
  const [products, setProducts] = useState<Set<string>>(new Set());
  const [recipients, setRecipients] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [created, setCreated] = useState<{ poll: DemandPoll; url: string } | null>(null);

  function create(channel: DemandChannel) {
    const productIds = DEMO_PRODUCTS.filter((p) => products.has(p.id)).map((p) => p.id);
    const poll = createPoll({
      title: title.trim() || `Demand poll · ${productIds.length} products`,
      productIds,
      recipientIds: [...recipients],
      channel,
    });
    setCreated({ poll, url: shareUrl(window.location.origin, poll) });
    onCreated(poll);
  }

  function startOver() {
    setCreated(null);
    setProducts(new Set());
    setRecipients(new Set());
    setTitle("");
  }

  if (created) return <Created poll={created.poll} url={created.url} onAgain={startOver} />;

  const hasProducts = products.size > 0;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
      <ProductPillar selected={products} onChange={setProducts} />
      <AudiencePillar selected={recipients} onChange={setRecipients} />

      {/* Pillar 3 — send */}
      <section className="glass flex flex-col rounded-3xl p-4">
        <PillarHeader n={3} title="Send" />

        <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-ink-muted/80">
          Poll title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. December restock"
          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 text-sm outline-none focus:border-brand/40"
        />

        <dl className="mt-4 grid grid-cols-2 gap-2">
          <Stat label="Products" value={products.size} />
          <Stat label="Recipients" value={recipients.size} />
        </dl>
        <p className="mt-3 text-xs text-ink-muted">Open for {POLL_LIFETIME_DAYS} days. No account needed to answer.</p>

        <div className="mt-auto flex flex-col gap-2 pt-5">
          <button
            type="button"
            onClick={() => create("email")}
            disabled={!hasProducts || recipients.size === 0}
            className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep disabled:opacity-40"
          >
            <Mail size={15} />
            Send email{recipients.size ? ` to ${recipients.size}` : ""}
          </button>
          <button
            type="button"
            onClick={() => create("link")}
            disabled={!hasProducts}
            className="flex items-center justify-center gap-2 rounded-full border border-brand/30 bg-white px-5 py-2.5 text-sm font-bold text-brand-deep transition hover:bg-brand/[0.05] disabled:opacity-40"
          >
            <Link2 size={15} />
            Create link
          </button>
          <p className="min-h-[16px] text-center text-[11px] text-ink-muted">
            {!hasProducts ? "Pick at least one product." : recipients.size === 0 ? "Pick who gets the email, or just create a link." : ""}
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-muted/70">{label}</dt>
      <dd className="text-xl font-extrabold text-ink">{value}</dd>
    </div>
  );
}

function Created({ poll, url, onAgain }: { poll: DemandPoll; url: string; onAgain: () => void }) {
  const [copied, setCopied] = useState(false);
  const n = poll.recipientIds.length;
  const names = poll.recipientIds.map((id) => contactById(id)?.name).filter(Boolean);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="glass flex flex-col items-center gap-4 rounded-3xl p-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
        <Check size={22} />
      </span>
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">
          {poll.channel === "email" ? `Emailed to ${n} contact${n === 1 ? "" : "s"}` : "Your poll link is ready"}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          “{poll.title}” · {poll.productIds.length} products · open for {POLL_LIFETIME_DAYS} days
        </p>
        {poll.channel === "email" && (
          <p className="mx-auto mt-1 max-w-xl text-xs text-ink-muted">
            {names.slice(0, 6).join(", ")}
            {names.length > 6 ? ` +${names.length - 6} more` : ""}
            <span className="block italic">Demo: no real email is sent.</span>
          </p>
        )}
      </div>
      <div className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-2">
        <Link2 size={15} className="shrink-0 text-brand" />
        <span className="min-w-0 flex-1 truncate text-left font-mono text-[12px] text-ink-muted">{url}</span>
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-deep"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-black/[0.06] hover:text-ink"
          aria-label="Open poll page"
        >
          <ExternalLink size={14} />
        </a>
      </div>
      <button
        type="button"
        onClick={onAgain}
        className="rounded-full px-4 py-2 text-sm font-semibold text-brand-deep hover:bg-brand/[0.06]"
      >
        Create another poll
      </button>
    </div>
  );
}
