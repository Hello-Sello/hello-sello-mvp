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
 *   - C · a live deal is selected → the two-tier strip: identity on top, the
 *         [Deal Room | Deal Card] toggle + the // Sella mark + a translate glyph.
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
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  FileText,
  MoreVertical,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { createClient } from "@/shared/db/client";
import {
  getDealCard,
  getPendingProposal,
  listRelationshipDeals,
  type RelationshipDealRow,
} from "../supabase/reads";
import {
  confirmDetectedDeal,
  createDeal,
  proposeDealChange,
} from "../actions";
import { dealChatUrl } from "../lib/dealChatUrl";
import { formatMoney } from "../lib/derive";
import { DealCard } from "./DealCard";
import { CreateDealForm } from "./CreateDealForm";
import { EditDealForm, type ProposeChangePayload } from "./EditDealForm";
import type {
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
  // 07-06 reopen-ticket states (D-30 colours: blue / dark-green). The badge UI
  // itself is deferred (D-17); these keep the exhaustive record complete.
  ticket_created: { label: "Ticket opened", cls: "bg-blue-100 text-blue-700" },
  ticket_closed: { label: "Ticket closed", cls: "bg-emerald-900/10 text-emerald-800" },
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
  threadId,
  counterpartyName,
  counterpartyPersonName,
  counterpartyInitials,
  children,
}: {
  relationshipId: string;
  variant?: "chat" | "workspace";
  /**
   * Vestigial (Phase 7): the Deal Room is retired (D-15), so this flag no longer
   * changes the strip. Kept on the prop contract only so the orphaned `DealChat`
   * (which still passes it) keeps compiling until the messaging rail rework
   * (07-05) removes that caller.
   */
  inRoom?: boolean;
  /**
   * The p2p chat thread (chat variant only). Required to propose + to read the
   * thread's pending proposal; absent for c2c threads and the workspace variant,
   * which keeps propose/accept connected-P2P only (D13).
   */
  threadId?: string;
  /** the other company's name - the relationship button + the dropdown heading +
   *  the create-form recipient + the held-change "From X" lines */
  counterpartyName?: string;
  /** the other PERSON's name (P2P) - the top-bar identity on the left */
  counterpartyPersonName?: string;
  /**
   * The counterparty avatar initials for the strip's top-tier identity (D-02).
   * ThreadView passes `conversation.initials` on the P2P deal path; the workspace
   * variant supplies none, so the top tier only renders when this/name is present.
   */
  counterpartyInitials?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [deals, setDeals] = useState<RelationshipDealRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // the latest selected id for the realtime handler (avoids re-subscribing the
  // channel on every selection just to read the current card id, 4.5.4). Kept in
  // sync inside the card-load effect, never written during render.
  const selectedIdRef = useRef<string | null>(null);
  const [data, setData] = useState<DealCardView | null>(null);
  const [open, setOpen] = useState(false); // the card overlay
  const [picking, setPicking] = useState(false); // the deal dropdown
  const [menuOpen, setMenuOpen] = useState(false); // the top-tier three-dot menu
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  // Task 8c (Round 2) - "Create a deal" direct-birth in flight (disables the
  // "Start a deal" button so a double-click can't fire create_deal_draft twice).
  const [creatingDeal, setCreatingDeal] = useState(false);
  // a ref twin of creatingDeal for the reentrancy guard itself: the window-event
  // listener below closes over this function once per (canPropose) subscription,
  // so a state read there could go stale between renders - the ref never does.
  const creatingDealRef = useRef(false);

  // 04C - the conversation-rail slot the card portals into (chat variant only). The
  // card now opens as a LEAFLET over the conversation rail (same place/shape as the
  // New chat picker), not floating inside the thread. Read at render time (guarded for
  // SSR); the card defaults closed, so the slot need not exist on the first client
  // render - by the time the user opens the card the rail has long since mounted and
  // getElementById resolves it. The workspace variant has no rail, so this stays null
  // and the inline overlay is used instead.
  const cardHost =
    variant === "chat" && typeof document !== "undefined"
      ? document.getElementById("hs-deal-card-slot")
      : null;

  // 4.5.2 - the pending proposal (State B) + its popover + its accept/decline
  const [proposal, setProposal] = useState<PendingProposalView | null>(null);
  const [asksOpen, setAsksOpen] = useState(false); // the loud pill's popover
  const [acting, setActing] = useState(false); // accept/decline in flight

  // 4.5.4 - the held two-sided CHANGE. The pending change itself rides on the
  // loaded card (`data.pendingChange`), so it stays in sync with the card on
  // every re-read. These drive the SEND reason pop-up + the strip controls.
  const [pendingEdit, setPendingEdit] = useState<ProposeChangePayload | null>(null); // the edit awaiting Send
  const [sendReason, setSendReason] = useState(""); // the proposer's required Send reason
  const [changeOpen, setChangeOpen] = useState(false); // the responder review popover
  const [changeBusy, setChangeBusy] = useState(false); // a change action in flight (send/accept/decline/withdraw)

  // whether THIS strip can host a proposal: chat variant over a real p2p thread
  const canPropose = variant === "chat" && !!threadId;

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

  // Task 8c (Round 2, Product Basket) - "Create a deal" no longer opens the
  // propose form (CreateDealForm -> proposeDeal -> wait for accept). It births
  // a REAL empty draft immediately via the same `createDeal` RPC the basket
  // flow uses, then hands the viewer to the relationship's c2c chat with the
  // card already open - `dealChatUrl` (Task 8b), the exact mechanism
  // BasketDrawer's draft() uses. `relationshipId` is reused as-is (the same
  // value proposeDeal already relies on); no new resolution logic.
  // `setSelectedId` runs BEFORE the navigation so this instance - which
  // survives a P2P -> C2C thread switch since it is keyed on relationshipId,
  // not threadId - never flashes "No deal yet" while the route change lands.
  const createEmptyDraft = useCallback(async () => {
    if (creatingDealRef.current) return;
    creatingDealRef.current = true;
    setCreatingDeal(true);
    try {
      const { dealCardId } = await createDeal({ relationshipId, lines: [] });
      setSelectedId(dealCardId);
      void listRelationshipDeals(relationshipId).then(setDeals);
      router.push(dealChatUrl(relationshipId, dealCardId));
    } catch (e) {
      console.error("create deal failed", e);
    } finally {
      creatingDealRef.current = false;
      setCreatingDeal(false);
    }
  }, [relationshipId, router]);

  // 4.5.4 - re-read the loaded card after a change resolves. The card read also
  // refreshes `pendingChange`, so the strip control + the pencil lock both update
  // from one fresh server read (no second state to drift). Every resolve path
  // ends with the hs:deal-updated dispatch so the sibling chat + workspace pill
  // re-read too (the project's cross-component refresh rule; Pitfall 4/5).
  async function refreshAfterChange(dealCardId: string) {
    const fresh = await getDealCard(dealCardId);
    setData(fresh);
    void listRelationshipDeals(relationshipId).then(setDeals);
    window.dispatchEvent(
      new CustomEvent("hs:deal-updated", { detail: { dealCardId } }),
    );
  }

  // 4.5.4 - the PROPOSER's Send: the edit form handed up its SHARED fields (the
  // per-line own-side input rides inside `lines`); this collects the required
  // reason and writes the held change. proposeDealChange writes the per-line
  // input to deal_line_item_private immediately + ungated (D-09) and holds the
  // SHARED draft. On success we re-read (the pending change + the lock appear)
  // and dispatch the refresh event.
  async function runSendChange() {
    if (!data || !pendingEdit || changeBusy || !sendReason.trim()) return;
    setChangeBusy(true);
    try {
      await proposeDealChange({
        dealCardId: data.card.id,
        lines: pendingEdit.lines,
        freeDelivery: pendingEdit.freeDelivery,
        dueDate: pendingEdit.dueDate,
        paymentTermsCode: pendingEdit.paymentTermsCode,
        note: pendingEdit.note,
        reason: sendReason.trim(),
      });
      setChangeOpen(false);
      setPendingEdit(null);
      setSendReason("");
      await refreshAfterChange(data.card.id);
    } catch (e) {
      console.error("propose change failed", e);
    } finally {
      setChangeBusy(false);
    }
  }

  // NOTE (07-01 teardown): the responder Accept/Decline + proposer Withdraw
  // handlers lived here to drive the now-removed inline review popup (D-10). The
  // backend change engine is untouched; the on-card red/green diff + decision bar
  // that replace this review UI are rebuilt on the card in plan 07-07 (D-18/D-19/
  // D-20). The proposer's Send flow (runSendChange) stays - it still holds a change.

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
    // 4.5.4 - re-read the currently-selected card (via the ref, so we never go
    // stale) when a held change appears or clears, so the pending pill + the
    // Edit-pencil lock update LIVE on both screens without a manual reload.
    const reloadCard = () => {
      const id = selectedIdRef.current;
      if (!id) return;
      void getDealCard(id)
        .then((d) => !cancelled && setData(d))
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
        // 4.5.4 - a held change was proposed (INSERT) or resolved (DELETE on every
        // exit) → re-read the selected card so the lock + pending pill flip live
        // on the OTHER screen too (Pitfall 5). The card read also refreshes
        // `pendingChange`, so one re-read drives both the strip and the pencil.
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "deal_pending_change" },
          () => reloadCard(),
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "deal_pending_change" },
          () => reloadCard(),
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [canPropose, threadId, relationshipId]);

  // the composer's "+ → Create a deal" door (5A.3 -> Task 8c): it fires a
  // window event so the footer button and this component stay decoupled. p2p
  // chat only - the RPC needs a relationship member either way, but this
  // trigger's availability is unchanged from the old propose gate (D13: the
  // workspace/c2c chats don't show the composer's create-deal affordance
  // reacting here). Round 2: births the real draft directly (createEmptyDraft)
  // instead of opening CreateDealForm.
  useEffect(() => {
    if (!canPropose) return;
    const onCreate = () => void createEmptyDraft();
    window.addEventListener("hs:create-deal", onCreate);
    return () => window.removeEventListener("hs:create-deal", onCreate);
  }, [canPropose, createEmptyDraft]);

  // load the full card for the selected deal (drives the overlay + confirm gate).
  // setState only inside the async callback - no selection resolves to null.
  useEffect(() => {
    // keep the realtime handler's id fresh without re-subscribing the channel.
    selectedIdRef.current = selectedId;
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

  // Phase 7 / D-08/D-32 - open the deal CARD as a right-side panel. The strip only
  // DISPATCHES a window event; the route-level DealCardPanelHost (in the Connect
  // layout) listens, fetches the card, and mounts it as the right panel. This keeps
  // deals <-> messaging acyclic (no back-import), mirroring the app's existing
  // hs:deal-updated / hs:create-deal contract. Carries the selected card id so the
  // host knows which deal to open.
  function openDealCard() {
    if (!selectedId) return;
    window.dispatchEvent(
      new CustomEvent("hs:open-deal-card", { detail: { dealCardId: selectedId } }),
    );
  }

  // D-08 - the single "Deal [code]" chip (replaces the retired [Deal Room | Deal
  // Card] segmented toggle). Shown only when the chat is tied to a deal; clicking
  // it opens the card as a RIGHT-SIDE panel via openDealCard (dispatches
  // hs:open-deal-card, which the layout-level DealCardPanelHost mounts, D-32).
  const dealCardChip = (
    <button
      type="button"
      onClick={openDealCard}
      title="Open the deal card"
      aria-label="Open the deal card"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand/15 bg-white px-3 py-1.5 text-xs font-semibold text-brand-deep transition hover:bg-brand-soft/30"
    >
      <FileText size={14} strokeWidth={2} className="text-brand" />
      Deal {selectedDeal?.hsNumber ?? "card"}
    </button>
  );

  // the strip's row shell - same border + padding across all three states
  const rowCls = "flex items-center gap-3 border-b border-black/5 px-4 py-2.5";

  return (
    <>
      {/* P2P top bar (04A polish, modeled on the C2C strip) - the SINGLE top bar
          for a P2P deal thread. LEFT: a circle avatar + the PERSON's name, read as
          one identity unit. RIGHT (grouped by the ⋯): the company as a clean
          relationship button (icon + name) + the deal-number dropdown + the ⋯
          menu. A thin divider sits under it, separating it from the controls. */}
      {variant === "chat" && threadId && (
        <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-3">
          {/* left: circle avatar + person name */}
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-ink/70 ring-1 ring-black/5">
            {counterpartyInitials}
            {/* presence dot - UI placeholder until real presence is wired */}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-white" />
          </span>
          <span className="min-w-0 shrink truncate text-[15px] font-semibold text-ink">
            {counterpartyPersonName ?? counterpartyName ?? "Deal"}
          </span>

          {/* one merged header line now: the company + the deal all sit LEFT next
              to the name (strip 1 - the standalone deal chip - is retired). The
              deal number opens the card via the small pink card icon beside it. */}
          {/* relationship - icon + company name as one calm glass button */}
          <Link
            href={`/connect/relationship/${relationshipId}`}
            title={`Relationship with ${counterpartyName ?? "this company"}`}
            className="inline-flex max-w-[10rem] shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-ink/70 ring-1 ring-black/[0.06] transition hover:bg-white/70 hover:text-brand hover:ring-brand/20"
          >
            <Users size={14} strokeWidth={1.75} className="shrink-0 text-ink/45" />
            <span className="truncate">{counterpartyName ?? "Relationship"}</span>
          </Link>

          {/* deal-number dropdown - the PICKER (choose among the relationship's
              deals). Its popover now drops from the LEFT since it moved left. */}
          {hasDeal && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setPicking((p) => !p)}
                aria-haspopup="listbox"
                aria-expanded={picking}
                aria-label="Choose a deal"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-ink/70 ring-1 ring-black/[0.06] transition hover:bg-white/70 hover:text-ink"
              >
                {selectedDeal?.hsNumber ?? "Draft deal"}
                <ChevronDown size={13} strokeWidth={2} className="text-ink/40" />
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
                    {/* D-03 - "See all N deals" → the relationship page */}
                    <Link
                      href={`/connect/relationship/${relationshipId}`}
                      onClick={() => setPicking(false)}
                      className="mt-0.5 flex items-center justify-center rounded-lg px-2.5 py-2 text-[11px] font-semibold text-brand-deep transition hover:bg-brand-soft/30"
                    >
                      See all {deals.length} deals
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}

          {/* the pink card icon - the clickable "open the deal card" cue beside
              the deal number (replaces the retired strip-1 chip). Opens the card
              as the 50/50 side panel. */}
          {hasDeal && (
            <button
              type="button"
              onClick={openDealCard}
              aria-label="Open the deal card"
              title="Open the deal card"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft/50 text-brand ring-1 ring-brand/20 transition hover:bg-brand-soft hover:text-brand-deep"
            >
              <FileText size={15} strokeWidth={2} />
            </button>
          )}

          {/* ⋮ menu - secondary actions, pushed right; vertical dots to spare
              horizontal room now that the chat can be 50% wide */}
          <div className="relative ml-auto shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="More"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink/55 ring-1 ring-black/[0.06] transition hover:bg-white/70 hover:text-brand hover:ring-brand/20"
            >
              <MoreVertical size={17} strokeWidth={1.75} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="glass-strong absolute right-0 top-full z-20 mt-1.5 w-56 rounded-2xl p-1.5">
                  <Link
                    href={`/connect/relationship/${relationshipId}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink transition hover:bg-black/[0.04]"
                  >
                    <Users size={15} strokeWidth={1.75} /> View relationship
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* State B - a proposal is pending (the pre-card object, the new heart) */}
      {variant === "chat" && showProposal && (
        <div className={rowCls}>
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

      {/* State C - a live deal is selected. Its whole identity + the open-card
          control now live in the P2P top bar above (the deal number + the pink
          card icon), so the old standalone "Deal [code]" chip strip is retired -
          it was a wasted row (feedback: "this strip has to go"). */}

      {/* State A - no deal, no proposal: a quiet invitation. p2p only (propose
          needs a p2p thread); a c2c thread with no deal shows just the label. */}
      {variant === "chat" && !showProposal && !hasDeal && (
        <div className={rowCls}>
          <span className="shrink-0 text-[11px] text-ink/45">No deal yet</span>
          {canPropose && (
            <button
              type="button"
              onClick={() => void createEmptyDraft()}
              disabled={creatingDeal}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-brand/45 px-3 py-1.5 text-xs font-semibold text-brand transition hover:border-brand hover:bg-brand-soft/30 disabled:cursor-wait disabled:opacity-50"
            >
              <Plus size={13} strokeWidth={2.5} />
              {creatingDeal ? "Starting…" : "Start a deal"}
            </button>
          )}
        </div>
      )}

      {/* workspace variant - the deal is fixed; NO top-tier identity (no source in
          the host, D-02): the status chip + the single "Deal [code]" chip that
          opens the card as a right-side panel. The retired toggle + // Sella mark
          (D-10) are gone. (The Deal Room is retired, so `inRoom` no longer splits
          this row; the whole workspace path is dead until 07-07 revisits it.) */}
      {variant === "workspace" && hasDeal && (
        <div className={rowCls}>
          <span className="shrink-0 text-[11px] text-ink/45">Deal:</span>
          <DealChip status={chipStatus} selectable={false} />
          {dealCardChip}
        </div>
      )}

      {/* the stream. 04C: the card no longer floats inside the thread - in the chat
          variant it opens as a LEAFLET over the conversation rail (portaled into the
          rail slot below). The workspace variant has no rail, so it keeps the inline
          right-floated overlay. PENCIL LOCK (DCHG-03): while a change is held, pass no
          onEdit so the Edit pencil disappears on both sides (the DB unique index is the
          real lock; this is the UX half). */}
      <div className="relative min-h-0 flex-1">
        {children}
        {data && open && variant === "workspace" && (
          <div className="pointer-events-none absolute inset-0 z-10 flex justify-end p-4">
            <div className="pointer-events-auto w-[390px] max-w-full self-start">
              <DealCard
                data={data}
                onEdit={data.pendingChange ? undefined : () => setEditing(true)}
              />
            </div>
          </div>
        )}
      </div>

      {/* 04C - chat variant: portal the card into the conversation-rail slot as a
          glass leaflet (same place/shape as the New chat picker). */}
      {data &&
        open &&
        variant === "chat" &&
        cardHost &&
        createPortal(
          <div className="glass-strong pointer-events-auto absolute inset-x-2 bottom-2 top-1 z-50 flex flex-col overflow-hidden rounded-2xl">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <DealCard
                data={data}
                onEdit={data.pendingChange ? undefined : () => setEditing(true)}
              />
            </div>
          </div>,
          cardHost,
        )}

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

      {/* the edit form (3.5b → 4.5.4) - the form no longer commits. It hands the
          edited SHARED fields + the private box UP via onProposeChange; we stash
          them, close the form, and open the strip Send pop-up to collect the
          required reason (D-08) before proposeDealChange holds the change. */}
      {editing && data && (
        <EditDealForm
          data={data}
          onClose={() => setEditing(false)}
          onProposeChange={(payload) => {
            setEditing(false);
            setPendingEdit(payload);
            setSendReason("");
            setChangeOpen(true);
          }}
        />
      )}

      {/* 4.5.4 the proposer's SEND reason pop-up (D-08) - the required change
          reason is collected HERE in the strip, never on the edit form. On Send
          proposeDealChange holds the change (private box written immediately +
          ungated, D-09) and the strip re-reads so the lock + pending pill appear. */}
      {changeOpen && pendingEdit && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              setChangeOpen(false);
              setPendingEdit(null);
            }}
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
          />
          <div className="glass-strong relative w-full max-w-sm overflow-hidden rounded-3xl">
            <div className="flex items-stretch">
              <span className="w-1 shrink-0 bg-brand" aria-hidden />
              <div className="min-w-0 flex-1 p-5">
                <div className="mb-0.5 flex items-center gap-1.5 text-sm font-bold text-ink">
                  <Sparkles size={14} strokeWidth={2} className="text-brand" />
                  Send this change
                </div>
                <p className="mb-3 text-[12px] text-ink/55">
                  {`${counterpartyName ?? "The other side"} reviews it before it takes effect. Say what changed and why - everyone sees this on the deal's history.`}
                </p>
                <textarea
                  value={sendReason}
                  onChange={(e) => setSendReason(e.target.value)}
                  rows={3}
                  autoFocus
                  className="w-full resize-none rounded-lg bg-white px-3 py-2 text-sm text-ink ring-1 ring-black/5 placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="e.g. Bumped the price to match the new supplier cost…"
                />
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setChangeOpen(false);
                      setPendingEdit(null);
                    }}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-ink/55 ring-1 ring-ink/15 transition hover:bg-ink/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void runSendChange()}
                    disabled={changeBusy || !sendReason.trim()}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:opacity-50"
                  >
                    {changeBusy ? "Sending…" : "Send change"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
