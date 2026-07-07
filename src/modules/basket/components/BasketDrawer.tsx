"use client";

import { useState } from "react";
import { X, Minus, Plus, Trash2, Send } from "lucide-react";
import { useBasket } from "../BasketProvider";
import { updateBasketLinePackCount, removeBasketLine } from "../supabase/writes";
import { sendBasketGroup } from "../actions";
import { RecipientPicker } from "./RecipientPicker";
import type { BasketGroup } from "../types";

export function BasketDrawer() {
  const { view, open, setOpen, refresh } = useBasket();

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px] transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`glass-strong fixed right-0 top-0 z-50 flex h-full w-[392px] max-w-[92vw] flex-col rounded-l-3xl shadow-2xl transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
          <h2 className="text-sm font-bold text-ink">Your basket</h2>
          <span className="text-xs text-ink/50">· {view.groups.length} {view.groups.length === 1 ? "shop" : "shops"}</span>
          <button aria-label="Close basket" onClick={() => setOpen(false)} className="ml-auto rounded-full p-1 text-ink/50 hover:bg-ink/5">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-4">
          {view.groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink/45">Your basket is empty.</p>
          ) : (
            view.groups.map((g) => <Group key={g.sellerCompanyId} group={g} onChanged={refresh} />)
          )}
        </div>
      </aside>
    </>
  );
}

function Group({ group, onChanged }: { group: BasketGroup; onChanged: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState<{ relationshipId: string; counterpartyPersonId: string | null } | null>(
    group.isOwnCompany ? null : (group.relationshipId ? { relationshipId: group.relationshipId, counterpartyPersonId: null } : null),
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!recipient) return;
    setSending(true);
    try {
      await sendBasketGroup(group, {
        relationshipId: recipient.relationshipId,
        counterpartyPersonId: recipient.counterpartyPersonId,
        note: note.trim() || null,
      });
      setSent(true);
      await onChanged();
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="border-b border-ink/10 py-4 text-sm font-semibold text-success">
        ✓ {group.isOwnCompany ? "Offer" : "Order"} sent to {group.sellerCompanyName}
      </div>
    );
  }

  return (
    <div className="border-b border-ink/10 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-bold text-ink">{group.sellerCompanyName}</span>
        {group.isOwnCompany && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand-deep">Your shop</span>}
        <span className="ml-auto text-xs text-ink/50">{group.lines.length}</span>
      </div>

      {group.lines.map((l) => (
        <div key={l.id} className="flex items-center gap-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink">{l.productName}</p>
            <p className="text-[10px] text-ink/50">
              {[l.cultivar, l.packSizeGrams ? `${l.packSizeGrams}g pack` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex items-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(20,10,16,0.15)]">
            <button aria-label="Decrease" className="grid h-6 w-6 place-items-center text-brand-deep"
              onClick={async () => { await updateBasketLinePackCount(l.id, Math.max(1, l.packCount - 1)); await onChanged(); }}>
              <Minus size={12} />
            </button>
            <span className="min-w-8 text-center text-[11px] font-bold tabular-nums">{l.packCount}</span>
            <button aria-label="Increase" className="grid h-6 w-6 place-items-center text-brand-deep"
              onClick={async () => { await updateBasketLinePackCount(l.id, l.packCount + 1); await onChanged(); }}>
              <Plus size={12} />
            </button>
          </div>
          <button aria-label="Remove" className="text-ink/40 hover:text-rose-600"
            onClick={async () => { await removeBasketLine(l.id); await onChanged(); }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)…"
        className="mt-2 w-full rounded-lg bg-white/80 px-2.5 py-1.5 text-xs ring-1 ring-black/10"
      />

      {group.isOwnCompany && (
        <div className="mt-2">
          <RecipientPicker onPick={setRecipient} />
        </div>
      )}

      <button
        disabled={!recipient || sending}
        onClick={send}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-xs font-bold text-white hover:bg-brand-deep disabled:opacity-40"
      >
        <Send size={13} /> {group.isOwnCompany ? "Send offer" : "Send order"}
      </button>
    </div>
  );
}
