"use client";

import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { Wordmark } from "@/shared/ui/Wordmark";
import { productById } from "../data";
import { addResponse, decodeShared, usePolls } from "../store";
import type { SharedPoll } from "../types";

const STEP = 50; // grams per +/- click

/**
 * The temporary public poll page (`/poll/<id>?d=…`). Anyone with the link can
 * enter how many grams of each product they'd want — no account. Rendered bare
 * (no app rail) like `/c/<handle>`, so outsiders never see app chrome.
 */
export function PollLanding({ pollId, encoded }: { pollId: string; encoded: string | null }) {
  const polls = usePolls();
  const local = polls.find((p) => p.id === pollId);
  const poll: SharedPoll | null = decodeShared(pollId, encoded) ?? local ?? null;

  const [qty, setQty] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  if (!poll) {
    return (
      <Frame>
        <h1 className="text-xl font-extrabold text-ink">Poll not found</h1>
        <p className="mt-2 text-sm text-ink-muted">This link is incomplete or the poll was removed.</p>
      </Frame>
    );
  }

  // eslint-disable-next-line react-hooks/purity -- demo: status is read at render time
  if (Date.now() > poll.expiresAt) {
    return (
      <Frame>
        <h1 className="text-xl font-extrabold text-ink">This poll has closed</h1>
        <p className="mt-2 text-sm text-ink-muted">“{poll.title}” is no longer collecting answers.</p>
      </Frame>
    );
  }

  if (done) {
    return (
      <Frame>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
          <Check size={22} />
        </span>
        <h1 className="mt-3 text-xl font-extrabold text-ink">Thank you!</h1>
        <p className="mt-2 text-sm text-ink-muted">Your demand for “{poll.title}” has been sent.</p>
      </Frame>
    );
  }

  const set = (id: string, g: number) => setQty({ ...qty, [id]: Math.max(0, Math.min(100000, g)) });
  const total = Object.values(qty).reduce((s, g) => s + g, 0);
  const canSubmit = total > 0 && name.trim() && company.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !poll) return;
    const quantities = Object.fromEntries(Object.entries(qty).filter(([, g]) => g > 0));
    addResponse(poll, { name: name.trim(), company: company.trim(), quantities, note: note.trim() || undefined });
    setDone(true);
  }

  const closes = new Date(poll.expiresAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="min-h-full px-4 py-8">
      <form onSubmit={submit} className="mx-auto flex max-w-xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <Wordmark />
          <span className="rounded-full bg-brand-soft/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-deep">
            Demand poll
          </span>
        </div>

        <div className="glass rounded-3xl p-5">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{poll.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Tell us how much of each product you would order. Open until {closes}.
          </p>
        </div>

        <ul className="glass flex flex-col divide-y divide-black/[0.06] rounded-3xl px-2">
          {poll.productIds.map((id) => {
            const p = productById(id);
            const g = qty[id] ?? 0;
            return (
              <li key={id} className="flex items-center gap-3 px-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{p?.name ?? id}</span>
                  {p && (
                    <span className="block text-[11px] text-ink-muted">
                      {p.genetics} · THC {p.thc}% · €{p.pricePerGram.toFixed(2)}/g
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <StepBtn label="Less" onClick={() => set(id, g - STEP)} disabled={g === 0}>
                    <Minus size={14} />
                  </StepBtn>
                  <label className="flex w-24 items-center rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 focus-within:border-brand/40">
                    <input
                      inputMode="numeric"
                      value={g || ""}
                      placeholder="0"
                      onChange={(e) => set(id, Number(e.target.value.replace(/\D/g, "")) || 0)}
                      className="w-full bg-transparent text-right text-sm font-semibold outline-none"
                      aria-label={`Grams of ${p?.name ?? id}`}
                    />
                    <span className="ml-1 text-xs text-ink-muted">g</span>
                  </label>
                  <StepBtn label="More" onClick={() => set(id, g + STEP)}>
                    <Plus size={14} />
                  </StepBtn>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="glass grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
          <Field label="Your name" value={name} onChange={setName} />
          <Field label="Pharmacy" value={company} onChange={setCompany} />
          <div className="sm:col-span-2">
            <Field label="Note (optional)" value={note} onChange={setNote} />
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-deep disabled:opacity-40"
        >
          Send my demand{total > 0 ? ` · ${total.toLocaleString("de-DE")} g` : ""}
        </button>
        <p className="text-center text-[11px] text-ink-muted">Powered by Hello Sello · no account needed</p>
      </form>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-md rounded-3xl p-8 text-center">
        <div className="mb-5 flex justify-center">
          <Wordmark />
        </div>
        {children}
      </div>
    </div>
  );
}

function StepBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-lg bg-ink/5 text-ink/70 transition hover:bg-brand/10 hover:text-brand disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-muted/80">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-brand/40"
      />
    </label>
  );
}
