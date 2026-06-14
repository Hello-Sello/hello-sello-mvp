"use client";

/**
 * Deal pin (3a → reworked in 5A.2) - the deal card's home inside a chat. Wraps
 * the message stream: renders the "Deal:" selector bar above it and, when
 * opened, floats the DealCard on the RIGHT of the stream.
 *
 * The bar is a DEAL SELECTOR (5A.2): the active deal shows as a small "deal
 * card" chip (no raw HS number - that lives inside the opened card), and the
 * chevron opens a dropdown to pick a different deal of this relationship - real
 * context for a seller juggling several deals with one company. Multi-deal is
 * the demo norm of one (DEV-37), so the list is usually a single row; the
 * control is honestly ready for more.
 *
 * Two variants:
 *   - `chat` (default, screen ②): the full selector + "Open card" + a quiet
 *     "Workspace ↗" door (screen ④). No deal yet → a dashed "Start a deal".
 *   - `workspace` (screen ④): the deal is fixed here, so just the chip (no
 *     dropdown) + "Open card" - you are already in the workspace.
 *
 * Self-contained: lists the relationship's deals + loads the selected one, so
 * the messaging module just wraps its stream with <DealPin>.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ChevronDown, FileText, Kanban, Plus } from "lucide-react";
import {
  getDealCard,
  listRelationshipDeals,
  type RelationshipDealRow,
} from "../supabase/reads";
import { confirmDeal } from "../actions";
import { DealCard } from "./DealCard";
import { CreateDealForm } from "./CreateDealForm";
import { EditDealForm } from "./EditDealForm";
import type { ConfirmDecision, DealCardStatus, DealCardView } from "../types";

/** Statuses still "live" (not terminal) - the preferred default selection. */
const LIVE_STATUSES = new Set<DealCardStatus>(["draft", "confirmed", "amended"]);

/** Status → badge label + colour. Pink for in-progress, gold for confirmed. */
const STATUS_BADGE: Record<DealCardStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-brand-soft/70 text-brand-deep" },
  amended: { label: "Amended", cls: "bg-brand-soft/70 text-brand-deep" },
  confirmed: { label: "Confirmed", cls: "bg-amber-100 text-amber-700" },
  done: { label: "Done", cls: "bg-success/15 text-success" },
  withdrawn: { label: "Withdrawn", cls: "bg-ink/10 text-ink/50" },
  cancelled: { label: "Cancelled", cls: "bg-ink/10 text-ink/50" },
};

function StatusBadge({ status }: { status: DealCardStatus }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

/** A short "Updated 3d ago" hint from an ISO timestamp. */
function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * The active deal as a small "deal card" object: a raspberry spine + a card
 * icon + "Deal card" + its status. A chevron when it doubles as a selector.
 */
function DealChip({ status, selectable }: { status: DealCardStatus; selectable: boolean }) {
  return (
    <span className="flex items-stretch overflow-hidden rounded-xl border border-brand/15 bg-white">
      <span className="w-1.5 shrink-0 bg-brand" aria-hidden />
      <span className="flex items-center gap-2 py-1.5 pl-2 pr-2.5">
        <FileText size={15} strokeWidth={2} className="text-brand" />
        <span className="text-xs font-semibold text-ink">Deal card</span>
        <StatusBadge status={status} />
        {selectable && <ChevronDown size={14} strokeWidth={2} className="text-ink/35" />}
      </span>
    </span>
  );
}

export function DealPin({
  relationshipId,
  variant = "chat",
  counterpartyName,
  children,
}: {
  relationshipId: string;
  variant?: "chat" | "workspace";
  /** the other company's name - the dropdown heading + the create-form recipient */
  counterpartyName?: string;
  children: React.ReactNode;
}) {
  const [deals, setDeals] = useState<RelationshipDealRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<DealCardView | null>(null);
  const [open, setOpen] = useState(false); // the card overlay
  const [picking, setPicking] = useState(false); // the deal dropdown
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  // 3d gate: run a confirm/decline/withdraw on the server, then re-read the card
  // (and refresh the list so the chip's status badge updates).
  async function runDecision(decision: ConfirmDecision) {
    if (!data || busy) return;
    setBusy(true);
    try {
      await confirmDeal({ dealCardId: data.card.id, version: data.card.version, decision });
      const fresh = await getDealCard(data.card.id);
      setData(fresh);
      void listRelationshipDeals(relationshipId).then(setDeals);
      // tell sibling views (the workspace header's lifecycle pill) to re-read.
      window.dispatchEvent(
        new CustomEvent("hs:deal-updated", { detail: { dealCardId: data.card.id } }),
      );
    } catch (e) {
      console.error("deal confirm failed", e);
    } finally {
      setBusy(false);
    }
  }

  // list the relationship's deals + pick a default (prefer the most recent LIVE
  // one, matching the old getCurrentDealCardId behaviour the workspace relies on).
  // DealPin is keyed by relationshipId at the mount site, so it remounts fresh.
  useEffect(() => {
    let alive = true;
    void listRelationshipDeals(relationshipId)
      .then((list) => {
        if (!alive) return;
        setDeals(list);
        const def = list.find((d) => LIVE_STATUSES.has(d.status)) ?? list[0] ?? null;
        setSelectedId(def?.id ?? null);
      })
      .catch(() => {
        if (alive) {
          setDeals([]);
          setSelectedId(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [relationshipId]);

  // the composer's "+ → Create a deal" door (5A.3): it fires a window event so
  // the footer button and this form stay decoupled. Chat variant only - the
  // workspace chat is for an existing deal, not a place to mint a new one.
  useEffect(() => {
    if (variant !== "chat") return;
    const onCreate = () => setCreating(true);
    window.addEventListener("hs:create-deal", onCreate);
    return () => window.removeEventListener("hs:create-deal", onCreate);
  }, [variant]);

  // load the full card for the selected deal (drives the overlay + confirm gate).
  useEffect(() => {
    if (!selectedId) {
      setData(null);
      return;
    }
    let alive = true;
    void getDealCard(selectedId)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  function pickDeal(id: string) {
    setSelectedId(id);
    setPicking(false);
    setOpen(false); // fresh context - let the user open the newly chosen card
  }

  const selectedDeal = deals.find((d) => d.id === selectedId) ?? null;
  const chipStatus: DealCardStatus = selectedDeal?.status ?? data?.card.status ?? "draft";
  const hasDeal = deals.length > 0 && !!selectedId;

  const openCardButton = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-deep"
    >
      {open ? "Close card" : "Open card"}
    </button>
  );

  return (
    <>
      {/* chat variant - the deal selector bar */}
      {variant === "chat" && hasDeal && (
        <div className="flex items-center gap-3 border-b border-black/5 px-4 py-2.5">
          <span className="shrink-0 text-[11px] text-ink/45">Deal:</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPicking((p) => !p)}
              aria-haspopup="listbox"
              aria-expanded={picking}
              aria-label="Choose a deal"
              className="block transition hover:opacity-90"
            >
              <DealChip status={chipStatus} selectable />
            </button>
            {picking && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPicking(false)} />
                <div className="glass-strong absolute left-0 top-full z-20 mt-1.5 w-72 rounded-2xl p-1.5">
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                    Deals with {counterpartyName ?? "this company"}
                  </p>
                  {deals.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => pickDeal(d.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-black/[0.04]"
                    >
                      <span className="w-1 self-stretch rounded-full bg-brand" aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-semibold text-ink">
                          {d.hsNumber ?? "Draft deal"}
                        </span>
                        <span className="text-[10px] text-ink/45">Updated {timeAgo(d.updatedAt)}</span>
                      </span>
                      <StatusBadge status={d.status} />
                      {d.id === selectedId && (
                        <Check size={14} strokeWidth={2.5} className="shrink-0 text-brand" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {openCardButton}
          <Link
            href={`/connect/deal/${selectedId}`}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-ink/55 transition hover:bg-ink/5 hover:text-ink"
          >
            <Kanban size={14} strokeWidth={1.75} />
            Workspace
            <ArrowUpRight size={13} strokeWidth={2} />
          </Link>
        </div>
      )}

      {/* chat variant, no deal yet - a quiet invitation (the card is born here
          on a human press → it fills this bar on the next read, the AI fence) */}
      {variant === "chat" && deals.length === 0 && (
        <div className="flex items-center gap-3 border-b border-black/5 px-4 py-2.5">
          <span className="shrink-0 text-[11px] text-ink/45">No deal yet</span>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-brand/45 px-3 py-1.5 text-xs font-semibold text-brand transition hover:border-brand hover:bg-brand-soft/30"
          >
            <Plus size={13} strokeWidth={2.5} />
            Start a deal
          </button>
        </div>
      )}

      {/* workspace variant - the deal is fixed; chip + open only */}
      {variant === "workspace" && hasDeal && (
        <div className="flex items-center gap-3 border-b border-black/5 px-4 py-2.5">
          <span className="shrink-0 text-[11px] text-ink/45">Deal:</span>
          <DealChip status={chipStatus} selectable={false} />
          {openCardButton}
        </div>
      )}

      {/* the stream, with the card floated on the right when open */}
      <div className="relative min-h-0 flex-1">
        {children}
        {data && open && (
          <div className="pointer-events-none absolute inset-0 z-10 flex justify-end p-4">
            <div className="pointer-events-auto self-start">
              <DealCard
                data={data}
                confirm={{
                  busy,
                  onConfirm: () => void runDecision("confirm"),
                  onDecline: () => void runDecision("decline"),
                  onWithdraw: () => void runDecision("withdraw"),
                }}
                onEdit={() => setEditing(true)}
              />
            </div>
          </div>
        )}
      </div>

      {/* the create form (3.5a) - a human-pressed commit; on success the new
          card is selected + opened (the AI fence: only this button writes). */}
      {creating && (
        <CreateDealForm
          relationshipId={relationshipId}
          counterpartyName={counterpartyName ?? "your contact"}
          onClose={() => setCreating(false)}
          onCreated={(cardId) => {
            setCreating(false);
            void listRelationshipDeals(relationshipId).then((list) => {
              setDeals(list);
              setSelectedId(cardId);
              setOpen(true);
            });
          }}
        />
      )}

      {/* the edit form (3.5b) - a change makes a new version + resets the gate;
          on success we re-read so the card shows the new version and seats. */}
      {editing && data && (
        <EditDealForm
          data={data}
          onClose={() => setEditing(false)}
          onUpdated={() => {
            setEditing(false);
            void getDealCard(data.card.id).then((d) => {
              setData(d);
              void listRelationshipDeals(relationshipId).then(setDeals);
              window.dispatchEvent(
                new CustomEvent("hs:deal-updated", { detail: { dealCardId: data.card.id } }),
              );
            });
          }}
        />
      )}
    </>
  );
}
