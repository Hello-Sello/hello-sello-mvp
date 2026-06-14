"use client";

/**
 * The Sella strip (4.5.2; was the "Deal:" selector bar, 3a → 5A.2) - the deal's
 * home + Sella's single in-chat action surface, wrapping the message stream.
 *
 * It has three states (build plan 4.5 §3):
 *   - A · no deal, no proposal → a dashed "Start a deal" (p2p only).
 *   - B · a PROPOSAL is pending → the pre-card object. The other side accepts
 *         here (the loud pill → confirm_detected_deal → atomic birth); the
 *         proposer sees "waiting". This is the ONLY place a card is born now.
 *   - C · a live deal is selected → the deal chip + selector dropdown + "Open
 *         card" + the quiet "Workspace ↗" door.
 *
 * Neutral + system-voice + both-sides (D7): both people see the same strip and
 * press the same buttons. The PRIVATE per-side Sella stays in the right panel.
 *
 * Self-contained: it lists the relationship's deals, loads the selected card,
 * AND reads the thread's pending proposal - and refreshes itself live on its own
 * realtime channel (a new proposal = a chat_message insert; a birth = a new deal
 * chat_thread insert). The realtime is INLINED on the shared db client on
 * purpose: importing messaging's hook would make deals ↔ messaging a cycle
 * (messaging already renders this component).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ChevronDown, FileText, Kanban, Plus, Sparkles } from "lucide-react";
import { createClient } from "@/shared/db/client";
import {
  getDealCard,
  getPendingProposal,
  listRelationshipDeals,
  type RelationshipDealRow,
} from "../supabase/reads";
import { confirmDeal, confirmDetectedDeal } from "../actions";
import { formatMoney } from "../lib/derive";
import { DealCard } from "./DealCard";
import { CreateDealForm } from "./CreateDealForm";
import { EditDealForm } from "./EditDealForm";
import type {
  ConfirmDecision,
  DealCardStatus,
  DealCardView,
  PendingProposalView,
} from "../types";

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
 * The EU-AI-Act "AI" mark - the strip's system voice is Sella. Reuses the same
 * Sparkles mark the Sella chat lines use, so it reads as one voice. Shows three
 * gently-pulsing dots in place of "AI" while Sella is working (`thinking`).
 */
function SellaMark({ thinking = false }: { thinking?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft/40 px-2 py-0.5 text-[10px] font-semibold text-brand-deep ring-1 ring-brand/15">
      <Sparkles size={11} strokeWidth={2} className="text-brand" />
      {thinking ? (
        <span className="inline-flex items-center gap-0.5" aria-label="Sella is thinking">
          {[0, 160, 320].map((d) => (
            <span
              key={d}
              className="h-1 w-1 animate-pulse rounded-full bg-brand"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </span>
      ) : (
        "AI"
      )}
    </span>
  );
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
  threadId,
  counterpartyName,
  children,
}: {
  relationshipId: string;
  variant?: "chat" | "workspace";
  /**
   * The p2p chat thread (chat variant only). Required to propose + to read the
   * thread's pending proposal; absent for c2c threads and the workspace variant,
   * which keeps propose/accept connected-P2P only (D13).
   */
  threadId?: string;
  /** the other company's name - the dropdown heading + the create-form recipient */
  counterpartyName?: string;
  children: React.ReactNode;
}) {
  const [deals, setDeals] = useState<RelationshipDealRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<DealCardView | null>(null);
  const [open, setOpen] = useState(false); // the card overlay
  const [picking, setPicking] = useState(false); // the deal dropdown
  const [busy, setBusy] = useState(false); // a seal decision (card overlay)
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  // 4.5.2 - the pending proposal (State B) + its popover + its accept/decline
  const [proposal, setProposal] = useState<PendingProposalView | null>(null);
  const [asksOpen, setAsksOpen] = useState(false); // the loud pill's popover
  const [acting, setActing] = useState(false); // accept/decline in flight

  // whether THIS strip can host a proposal: chat variant over a real p2p thread
  const canPropose = variant === "chat" && !!threadId;

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

  // 4.5.2 - the birth-accept. Record this side's vote; on both-accept the RPC
  // births the card atomically and hands back its id, so we select + open it.
  async function runProposal(decision: "accept" | "reject") {
    if (!proposal || acting || !threadId) return;
    const tid = threadId;
    setActing(true);
    try {
      const { bornCardId } = await confirmDetectedDeal({
        messageId: proposal.messageId,
        decision,
      });
      setAsksOpen(false);
      const list = await listRelationshipDeals(relationshipId);
      setDeals(list);
      setProposal(await getPendingProposal(tid));
      if (bornCardId) {
        setSelectedId(bornCardId);
        setOpen(true);
        window.dispatchEvent(
          new CustomEvent("hs:deal-updated", { detail: { dealCardId: bornCardId } }),
        );
      }
    } catch (e) {
      console.error("proposal decision failed", e);
    } finally {
      setActing(false);
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

  // 4.5.2 - load the thread's pending proposal (chat + p2p only). setState lives
  // only inside the async callback (never synchronously in the effect body) - no
  // cascading render, and a non-p2p thread resolves to null the same way.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const p =
        canPropose && threadId ? await getPendingProposal(threadId).catch(() => null) : null;
      if (alive) setProposal(p);
    })();
    return () => {
      alive = false;
    };
  }, [canPropose, threadId]);

  // 4.5.2 - live refresh on the strip's OWN channel so BOTH screens stay current:
  // a new proposal arrives (chat_message insert in this thread) → re-read the
  // proposal; a deal is born (a new deal chat_thread insert) → re-read deals +
  // proposal (the proposal is now born → it clears; the new card appears). The
  // re-reads only setState from fresh server data, so no stale-closure risk.
  useEffect(() => {
    if (!canPropose || !threadId) return;
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const reloadProposal = () => {
      void getPendingProposal(threadId)
        .then((p) => !cancelled && setProposal(p))
        .catch(() => {});
    };
    const reloadDeals = () => {
      void listRelationshipDeals(relationshipId)
        .then((list) => {
          if (cancelled) return;
          setDeals(list);
          // adopt the freshly-born deal only when nothing is selected yet
          setSelectedId(
            (cur) => cur ?? (list.find((d) => LIVE_STATUSES.has(d.status)) ?? list[0])?.id ?? null,
          );
        })
        .catch(() => {});
    };

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;
      channel = supabase
        .channel("deal-strip-realtime")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_message" },
          (payload) => {
            if ((payload.new as { thread_id?: string }).thread_id === threadId) reloadProposal();
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_thread" },
          () => {
            reloadDeals();
            reloadProposal();
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [canPropose, threadId, relationshipId]);

  // the composer's "+ → Create a deal" door (5A.3): it fires a window event so
  // the footer button and this form stay decoupled. p2p chat only - propose
  // needs a p2p thread (the workspace/c2c chats cannot mint a proposal).
  useEffect(() => {
    if (!canPropose) return;
    const onCreate = () => setCreating(true);
    window.addEventListener("hs:create-deal", onCreate);
    return () => window.removeEventListener("hs:create-deal", onCreate);
  }, [canPropose]);

  // load the full card for the selected deal (drives the overlay + confirm gate).
  // setState only inside the async callback - no selection resolves to null.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const d = selectedId ? await getDealCard(selectedId).catch(() => null) : null;
      if (alive) setData(d);
    })();
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

  // State B applies while a proposal is pending and the viewer has not declined
  // it (a decline reset is 4.5.5; here a declined proposal simply drops away).
  const showProposal = !!proposal && proposal.myVote !== "reject";
  const mustAct = showProposal && proposal!.myVote == null; // my turn to accept/decline
  const waiting = showProposal && proposal!.myVote === "accept" && proposal!.otherVote !== "accept";

  const openCardButton = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-deep"
    >
      {open ? "Close card" : "Open card"}
    </button>
  );

  // the strip's row shell - same border + padding across all three states
  const rowCls = "flex items-center gap-3 border-b border-black/5 px-4 py-2.5";

  return (
    <>
      {/* State B - a proposal is pending (the pre-card object, the new heart) */}
      {variant === "chat" && showProposal && (
        <div className={rowCls}>
          <SellaMark thinking={acting} />
          <span className="min-w-0 flex-1 truncate text-xs text-ink/70">
            <span className="font-semibold text-ink/85">
              {proposal!.iProposed
                ? "You proposed a deal"
                : proposal!.source === "sella"
                  ? "Sella spotted a deal"
                  : `${counterpartyName ?? "They"} proposed a deal`}
            </span>
            <span className="text-ink/45"> · {proposal!.summary}</span>
          </span>

          {/* the action lives on the right: a LOUD pill when it is my turn, a
              quiet "waiting" chip when I have accepted and the other side has not */}
          {mustAct && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setAsksOpen((o) => !o)}
                aria-haspopup="dialog"
                aria-expanded={asksOpen}
                className="relative inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-deep"
              >
                {/* the pulse - the one high-impact moment that says "act" */}
                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-soft opacity-80" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-soft ring-2 ring-white" />
                </span>
                <Sparkles size={13} strokeWidth={2} />
                Review
              </button>

              {asksOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAsksOpen(false)} />
                  <div className="glass-strong absolute right-0 top-full z-20 mt-1.5 w-80 overflow-hidden rounded-2xl">
                    <div className="flex items-stretch">
                      <span className="w-1 shrink-0 bg-brand" aria-hidden />
                      <div className="min-w-0 flex-1 p-3">
                        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-brand-deep">
                          <Sparkles size={12} strokeWidth={2} />
                          {proposal!.source === "sella" ? "Sella spotted a deal" : "Deal proposal"}
                        </div>
                        <p className="mb-2 text-[11px] text-ink/50">
                          {proposal!.iProposed
                            ? "Your proposal"
                            : `From ${counterpartyName ?? "your contact"}`}
                        </p>

                        <ul className="space-y-1.5">
                          {proposal!.lines.map((l, i) => (
                            <li
                              key={i}
                              className="flex items-baseline justify-between gap-3 text-xs"
                            >
                              <span className="min-w-0 flex-1 truncate text-ink/80">{l.name}</span>
                              <span className="shrink-0 font-mono text-[11px] text-ink/60">
                                {l.quantity}
                                {l.unit}
                                {l.unitPrice != null
                                  ? ` · ${formatMoney(l.unitPrice, l.currency)}`
                                  : ""}
                              </span>
                            </li>
                          ))}
                        </ul>

                        {(() => {
                          const priced = proposal!.lines.filter((l) => l.unitPrice != null);
                          if (priced.length === 0) return null;
                          const total = priced.reduce(
                            (s, l) => s + l.quantity * (l.unitPrice as number),
                            0,
                          );
                          return (
                            <div className="mt-2 flex items-baseline justify-between border-t border-black/5 pt-2 text-xs">
                              <span className="text-ink/50">Total</span>
                              <span className="font-mono font-semibold text-ink">
                                {formatMoney(total, proposal!.currency)}
                              </span>
                            </div>
                          );
                        })()}

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void runProposal("accept")}
                            disabled={acting}
                            className="flex-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-deep disabled:opacity-50"
                          >
                            {acting ? "Working…" : "Accept"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void runProposal("reject")}
                            disabled={acting}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink/55 ring-1 ring-black/5 transition hover:bg-black/[0.04] disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {waiting && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-medium text-ink/55 ring-1 ring-black/5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand/60" />
              Waiting for {counterpartyName ?? "the other side"}
            </span>
          )}
        </div>
      )}

      {/* State C - a live deal is selected: the selector bar */}
      {variant === "chat" && !showProposal && hasDeal && (
        <div className={rowCls}>
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
          <SellaMark thinking={busy} />
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

      {/* State A - no deal, no proposal: a quiet invitation. p2p only (propose
          needs a p2p thread); a c2c thread with no deal shows just the label. */}
      {variant === "chat" && !showProposal && !hasDeal && (
        <div className={rowCls}>
          <span className="shrink-0 text-[11px] text-ink/45">No deal yet</span>
          {canPropose && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-brand/45 px-3 py-1.5 text-xs font-semibold text-brand transition hover:border-brand hover:bg-brand-soft/30"
            >
              <Plus size={13} strokeWidth={2.5} />
              Start a deal
            </button>
          )}
        </div>
      )}

      {/* workspace variant - the deal is fixed; chip + open only */}
      {variant === "workspace" && hasDeal && (
        <div className={rowCls}>
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

      {/* the propose form (4.5.2, was create 3.5a) - a human-pressed Send writes
          a PROPOSAL (no card yet); on success the strip re-reads to show pending.
          p2p only - guarded by canPropose + threadId so c2c never reaches it. */}
      {creating && canPropose && threadId && (
        <CreateDealForm
          relationshipId={relationshipId}
          threadId={threadId}
          counterpartyName={counterpartyName ?? "your contact"}
          onClose={() => setCreating(false)}
          onProposed={() => {
            setCreating(false);
            void getPendingProposal(threadId)
              .then(setProposal)
              .catch(() => {});
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
