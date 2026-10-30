"use client";

import { useState } from "react";
import { Check, Link2, Pencil, Plus } from "lucide-react";
import { contactById, productById } from "../data";
import { saveResponse } from "../store";
import type { DemandResponse, SharedPoll } from "../types";
import { initials } from "./ui";

export function formatGrams(g: number) {
  return g >= 1000 ? `${(g / 1000).toLocaleString("en-GB", { maximumFractionDigits: 2 })} kg` : `${g} g`;
}

type Row = {
  /** contact id for invited pharmacies, response id for link walk-ins */
  key: string;
  contactId?: string;
  company: string;
  person: string;
  response?: DemandResponse;
};

function buildRows(shared: SharedPoll, responses: DemandResponse[]): Row[] {
  const invited: Row[] = shared.recipientIds.map((cid) => {
    const c = contactById(cid);
    return {
      key: cid,
      contactId: cid,
      company: c?.company ?? cid,
      person: c?.name ?? "",
      response: responses.find((r) => r.contactId === cid),
    };
  });
  const walkIns: Row[] = responses
    .filter((r) => !r.contactId || !shared.recipientIds.includes(r.contactId))
    .map((r) => ({ key: r.id, company: r.company, person: r.name, response: r }));
  return [...invited, ...walkIns];
}

/**
 * The group poll grid: one row per pharmacy (named, so each invitee spots
 * their own line), one column per product, totals at the bottom. Everyone sees
 * everyone's numbers. In `fill` mode the viewer claims a row ("This is me"),
 * then edits only that row with explicit Save / Cancel.
 */
export function PollGrid({
  shared,
  responses,
  mode,
  initialMe = null,
  linkFor,
}: {
  shared: SharedPoll;
  responses: DemandResponse[];
  mode: "fill" | "view";
  /** row key pre-selected as the viewer's own (from a personal link) */
  initialMe?: string | null;
  /** view mode: builds the personal link for an invited row */
  linkFor?: (contactId: string) => string;
}) {
  const [me, setMe] = useState<string | null>(initialMe);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const rows = buildRows(shared, responses);
  const products = shared.productIds.map((id) => ({ id, p: productById(id) }));
  const filled = rows.filter((r) => r.response).length;
  const totals = products.map(({ id }) => responses.reduce((s, r) => s + (r.quantities[id] ?? 0), 0));
  const grand = totals.reduce((s, g) => s + g, 0);

  function startEdit(row: Row | "new") {
    if (row === "new") {
      setEditKey("new");
      setDraft({});
      return;
    }
    setMe(row.key);
    setEditKey(row.key);
    setDraft({ ...(row.response?.quantities ?? {}) });
  }

  function save(row: Row | "new") {
    const quantities = Object.fromEntries(Object.entries(draft).filter(([, g]) => g > 0));
    if (row === "new") {
      if (!newCompany.trim()) return;
      const id = saveResponse(shared, { name: newName.trim(), company: newCompany.trim(), quantities });
      setMe(id);
    } else {
      saveResponse(shared, {
        id: row.response?.id,
        contactId: row.contactId,
        name: row.person,
        company: row.company,
        quantities,
      });
    }
    setEditKey(null);
  }

  async function copy(cid: string) {
    if (!linkFor) return;
    try {
      await navigator.clipboard.writeText(linkFor(cid));
      setCopied(cid);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  const cellInput = (pid: string) => (
    <input
      inputMode="numeric"
      value={draft[pid] || ""}
      placeholder="0"
      onChange={(e) => setDraft({ ...draft, [pid]: Math.min(100000, Number(e.target.value.replace(/\D/g, "")) || 0) })}
      aria-label={`Grams of ${productById(pid)?.name ?? pid}`}
      className="w-full min-w-[64px] rounded-md border border-brand/30 bg-white px-2 py-1 text-right text-sm font-semibold outline-none focus:border-brand"
    />
  );

  const saveCancel = (row: Row | "new") => (
    <div className="mt-1.5 flex gap-1">
      <button
        type="button"
        onClick={() => save(row)}
        disabled={row === "new" && !newCompany.trim()}
        className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-bold text-white hover:bg-brand-deep disabled:opacity-40"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditKey(null)}
        className="rounded-md px-2 py-1 text-[11px] font-semibold text-ink-muted hover:text-ink"
      >
        Cancel
      </button>
    </div>
  );

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-2.5 text-xs text-ink-muted">
        <span>
          <span className="font-bold text-ink">{filled}</span> of {rows.length} pharmacies filled in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> Live — everyone in this poll sees
          these numbers
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[200px] bg-[#fdf5f9] px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-ink-muted/70">
                Pharmacy
              </th>
              {products.map(({ id, p }) => (
                <th key={id} className="min-w-[110px] bg-brand/[0.03] px-3 py-2 text-right align-bottom">
                  <span className="block text-[12px] font-bold text-ink">{p?.name ?? id}</span>
                  {p && (
                    <span className="block whitespace-nowrap text-[10px] font-medium text-ink-muted">
                      {p.thc}% · €{p.pricePerGram.toFixed(2)}/g
                    </span>
                  )}
                </th>
              ))}
              <th className="min-w-[90px] bg-brand/[0.03] px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-ink-muted/70">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isMe = mode === "fill" && me === row.key;
              const editing = editKey === row.key;
              const rowTotal = Object.values(row.response?.quantities ?? {}).reduce((s, g) => s + g, 0);
              return (
                <tr
                  key={row.key}
                  className={`border-t border-black/[0.06] ${isMe ? "bg-brand/[0.06]" : ""} ${
                    isMe && !row.response && !editing ? "outline outline-2 -outline-offset-2 outline-brand/50" : ""
                  }`}
                >
                  <td className={`sticky left-0 z-10 px-3 py-2 ${isMe ? "bg-[#fbeaf2]" : "bg-[#fdf9fb]"}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft/60 text-[10px] font-bold text-brand-deep">
                        {initials(row.company)}
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-semibold text-ink">{row.company}</span>
                          {isMe && (
                            <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                              You
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-ink-muted">
                          {row.person}
                          {row.response ? (
                            <span className="text-success"> · ✓ filled in</span>
                          ) : (
                            <span className="text-brand"> · waiting</span>
                          )}
                        </span>
                      </span>
                      {mode === "view" && row.contactId && linkFor && (
                        <button
                          type="button"
                          onClick={() => copy(row.contactId!)}
                          aria-label={`Copy ${row.company}'s personal link`}
                          className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-black/[0.05] hover:text-ink"
                        >
                          {copied === row.contactId ? <Check size={13} /> : <Link2 size={13} />}
                        </button>
                      )}
                    </div>
                    {mode === "fill" && !editing && (isMe || !me) && (
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className={`mt-1.5 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold ${
                          isMe && !row.response
                            ? "bg-brand text-white hover:bg-brand-deep"
                            : "text-brand-deep hover:bg-brand/[0.08]"
                        }`}
                      >
                        <Pencil size={11} />
                        {isMe ? (row.response ? "Change" : "Fill in your order") : "This is me"}
                      </button>
                    )}
                    {editing && saveCancel(row)}
                  </td>
                  {products.map(({ id }) => (
                    <td key={id} className="px-3 py-2 text-right">
                      {editing ? (
                        cellInput(id)
                      ) : row.response?.quantities[id] ? (
                        <span className="font-semibold text-ink">{formatGrams(row.response.quantities[id])}</span>
                      ) : (
                        <span className="text-ink/20">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-bold text-ink">
                    {editing
                      ? formatGrams(Object.values(draft).reduce((s, g) => s + g, 0))
                      : rowTotal
                        ? formatGrams(rowTotal)
                        : ""}
                  </td>
                </tr>
              );
            })}

            {/* walk-in row for anyone with the link who isn't on the list */}
            {mode === "fill" &&
              (editKey === "new" ? (
                <tr className="border-t border-black/[0.06] bg-brand/[0.06]">
                  <td className="sticky left-0 z-10 bg-[#fbeaf2] px-3 py-2">
                    <input
                      autoFocus
                      value={newCompany}
                      onChange={(e) => setNewCompany(e.target.value)}
                      placeholder="Pharmacy"
                      className="w-full rounded-md border border-brand/30 bg-white px-2 py-1 text-sm outline-none focus:border-brand"
                    />
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Your name"
                      className="mt-1 w-full rounded-md border border-black/[0.08] bg-white px-2 py-1 text-xs outline-none focus:border-brand"
                    />
                    {saveCancel("new")}
                  </td>
                  {products.map(({ id }) => (
                    <td key={id} className="px-3 py-2 text-right align-top">
                      {cellInput(id)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right align-top font-bold text-ink">
                    {formatGrams(Object.values(draft).reduce((s, g) => s + g, 0))}
                  </td>
                </tr>
              ) : (
                !me && (
                  <tr className="border-t border-black/[0.06]">
                    <td colSpan={products.length + 2} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => startEdit("new")}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-brand-deep hover:bg-brand/[0.08]"
                      >
                        <Plus size={12} /> My pharmacy isn&apos;t listed
                      </button>
                    </td>
                  </tr>
                )
              ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black/[0.08]">
              <td className="sticky left-0 z-10 bg-[#fdf5f9] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                Group total
              </td>
              {products.map(({ id, p }, i) => (
                <td key={id} className="bg-brand/[0.03] px-3 py-2 text-right">
                  <span className="block font-extrabold text-ink">{formatGrams(totals[i])}</span>
                  {p && <span className="block text-[10px] text-ink-muted">of {p.stockKg} kg</span>}
                </td>
              ))}
              <td className="bg-brand/[0.03] px-3 py-2 text-right font-extrabold text-brand-deep">
                {formatGrams(grand)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
