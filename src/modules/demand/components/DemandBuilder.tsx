"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Search, Send, Users } from "lucide-react";
import { DEMO_CONTACTS, DEMO_PRODUCTS, POLL_LIFETIME_DAYS } from "../data";
import { createPoll, shareUrl } from "../store";
import type { DemandPoll } from "../types";

type Mode = "contacts" | "link";
const GENETICS = ["All", "Indica", "Sativa", "Hybrid"] as const;

/**
 * The two-step poll builder: (1) pick products from the list, (2) send the poll
 * to contacts or create a public link. On create it hands the new poll up so
 * the Polls section below can highlight it.
 */
export function DemandBuilder({ onCreated }: { onCreated: (poll: DemandPoll) => void }) {
  const [query, setQuery] = useState("");
  const [genetics, setGenetics] = useState<(typeof GENETICS)[number]>("All");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<Mode>("contacts");
  const [recipients, setRecipients] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState<{ poll: DemandPoll; url: string; mode: Mode } | null>(null);
  const [copied, setCopied] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEMO_PRODUCTS.filter(
      (p) =>
        (genetics === "All" || p.genetics === genetics) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
  }, [query, genetics]);

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));

  function toggle(set: Set<string>, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function toggleAllVisible() {
    const next = new Set(selected);
    visible.forEach((p) => (allVisibleSelected ? next.delete(p.id) : next.add(p.id)));
    setSelected(next);
  }

  const canCreate =
    selected.size > 0 && (mode === "link" || recipients.size > 0);

  function create() {
    if (!canCreate) return;
    const productIds = DEMO_PRODUCTS.filter((p) => selected.has(p.id)).map((p) => p.id);
    const poll = createPoll({
      title: title.trim() || `Demand poll · ${productIds.length} products`,
      productIds,
      recipientIds: mode === "contacts" ? [...recipients] : [],
    });
    setCreated({ poll, url: shareUrl(window.location.origin, poll), mode });
    setCopied(false);
    onCreated(poll);
  }

  function startOver() {
    setCreated(null);
    setSelected(new Set());
    setRecipients(new Set());
    setTitle("");
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (created) {
    const n = created.poll.recipientIds.length;
    return (
      <div className="glass flex flex-col items-center gap-4 rounded-3xl p-8 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
          <Check size={22} />
        </span>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-ink">
            {created.mode === "contacts" ? `Poll sent to ${n} contact${n === 1 ? "" : "s"}` : "Your poll link is ready"}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            “{created.poll.title}” · {created.poll.productIds.length} products · open for {POLL_LIFETIME_DAYS} days
          </p>
        </div>
        <div className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-2">
          <Link2 size={15} className="shrink-0 text-brand" />
          <span className="min-w-0 flex-1 truncate text-left font-mono text-[12px] text-ink-muted">{created.url}</span>
          <button
            type="button"
            onClick={() => copy(created.url)}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-deep"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={created.url}
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
          onClick={startOver}
          className="rounded-full px-4 py-2 text-sm font-semibold text-brand-deep hover:bg-brand/[0.06]"
        >
          Create another poll
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Step 1 — products */}
      <section className="glass flex min-h-0 flex-col rounded-3xl p-5">
        <StepHeader n={1} title="Pick products" hint={`${selected.size} of ${DEMO_PRODUCTS.length} selected`} />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-2">
            <Search size={15} className="text-ink-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products"
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-muted/70"
            />
          </label>
          <div className="flex gap-1">
            {GENETICS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGenetics(g)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  genetics === g ? "bg-brand text-white" : "bg-ink/5 text-ink/60 hover:bg-ink/10"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between px-1 text-xs text-ink-muted">
          <button type="button" onClick={toggleAllVisible} className="font-semibold text-brand-deep hover:underline">
            {allVisibleSelected ? "Clear visible" : `Select all ${visible.length}`}
          </button>
          {selected.size > 0 && (
            <button type="button" onClick={() => setSelected(new Set())} className="hover:text-ink">
              Clear selection
            </button>
          )}
        </div>

        <ul className="mt-2 grid max-h-[420px] grid-cols-1 gap-1.5 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => {
            const on = selected.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelected(toggle(selected, p.id))}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                    on
                      ? "border-brand/40 bg-brand/[0.06]"
                      : "border-black/[0.06] bg-white/70 hover:border-brand/25 hover:bg-white"
                  }`}
                >
                  <Checkbox on={on} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                    <span className="block text-[11px] text-ink-muted">
                      {p.genetics} · THC {p.thc}% · €{p.pricePerGram.toFixed(2)}/g
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="col-span-full py-8 text-center text-sm text-ink-muted">No products match.</li>
          )}
        </ul>
      </section>

      {/* Step 2 — audience */}
      <section className="glass flex flex-col rounded-3xl p-5">
        <StepHeader n={2} title="Send or share" />

        <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-ink-muted/80">
          Poll title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. December restock"
          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-brand/40"
        />

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1">
          <ModeTab active={mode === "contacts"} onClick={() => setMode("contacts")} icon={<Users size={14} />}>
            Contacts
          </ModeTab>
          <ModeTab active={mode === "link"} onClick={() => setMode("link")} icon={<Link2 size={14} />}>
            Link
          </ModeTab>
        </div>

        {mode === "contacts" ? (
          <ul className="mt-3 flex max-h-[260px] flex-col gap-1 overflow-auto">
            {DEMO_CONTACTS.map((c) => {
              const on = recipients.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setRecipients(toggle(recipients, c.id))}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                      on ? "bg-brand/[0.06]" : "hover:bg-black/[0.03]"
                    }`}
                  >
                    <Checkbox on={on} />
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft/60 text-[11px] font-bold text-brand-deep">
                      {c.name
                        .split(/[\s-]+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                      <span className="block text-[11px] text-ink-muted">{c.city}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-ink-muted">
            Creates a temporary page on Hello Sello that anyone with the link can fill in — no account
            needed. It closes after {POLL_LIFETIME_DAYS} days.
          </p>
        )}

        <div className="mt-auto pt-5">
          <button
            type="button"
            onClick={create}
            disabled={!canCreate}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep disabled:opacity-40"
          >
            {mode === "contacts" ? <Send size={15} /> : <Link2 size={15} />}
            {mode === "contacts"
              ? `Send poll${recipients.size ? ` to ${recipients.size}` : ""}`
              : "Create poll link"}
          </button>
          {selected.size === 0 && (
            <p className="mt-2 text-center text-[11px] text-ink-muted">Pick at least one product first.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">
        {n}
      </span>
      <h2 className="text-lg font-extrabold tracking-tight text-ink">{title}</h2>
      {hint && <span className="ml-auto text-xs font-semibold text-ink-muted">{hint}</span>}
    </div>
  );
}

function Checkbox({ on }: { on: boolean }) {
  return (
    <span
      className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border transition ${
        on ? "border-brand bg-brand text-white" : "border-black/20 bg-white"
      }`}
    >
      {on && <Check size={12} strokeWidth={3} />}
    </span>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-semibold transition ${
        active ? "bg-white text-ink shadow-sm" : "text-ink/55 hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
