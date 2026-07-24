"use client";

import { useEffect, useRef, useState } from "react";
import {
  getDealCard,
  getWorkspace,
  getThings,
  getDealPeople,
  createDeal,
  DealCard,
  type DealCardView,
  type CardCreateInput,
  type MemberView,
  type ThingView,
} from "@/modules/deals";

/**
 * A not-yet-born draft view for CREATE mode (chj/07-08) - the PRE-BIRTH empty
 * paper ONLY (Phase-12 D-13: a saved draft is a REAL born card with status
 * 'unsent' and real workspace/line ids; this fake never represents one). The
 * card renders it empty, seller = me, buyer = the recipient DealPin passed.
 * `id: "new"` never reaches the DB - "Save draft" calls createDeal, which mints
 * the real card. The cast fills the DealCard DB columns the create front never
 * reads (Muskan's localized-cast pattern); the create card hides the id-bound
 * sections.
 */
function emptyDraftView(buyerName: string): DealCardView {
  return {
    card: {
      id: "new",
      status: "unsent",
      currency: "EUR",
      payment_terms_code: null,
      delivery_date_target: null,
      metadata: {},
      hs_deal_number: null,
    } as unknown as DealCardView["card"],
    sellerName: "You",
    buyerName,
    sellerCompanyId: "",
    lineItems: [],
    lineMargins: [],
    signals: [],
    log: [],
    viewerSide: "seller",
    pendingChange: null,
    myNote: null,
    theirNote: null,
  };
}

/**
 * `onEdit` on DealCard is only a truthy "editing allowed" gate - its pencil toggles
 * inline edit itself and never calls this. So the panel passes this stable noop to
 * mean "editable" (vs `undefined` = locked while a change is held). Both parties may
 * edit a live deal; editing IS Negotiate (Send change -> proposeDealChange).
 */
const ALLOW_EDIT = () => {
  /* gate only - DealCard.onEdit is a truthiness flag, never called */
};

/**
 * Deal card panel host (Phase 7, D-31/D-32) - the ROUTE-LEVEL composition root
 * that opens a deal card as a RIGHT-SIDE panel, wherever the card is opened from
 * (a chat chip, the Relationship page, or any future page). It replaces the old
 * Phase-5 Deal Room overlay host (which mounted the now-retired Deal Room
 * container in a full blurred overlay). The Deal Room + Stages are gone
 * (D-15/D-17); this host mounts ONLY the flip `DealCard`, never a container.
 *
 * ACYCLIC by design: the emitter (DealPin's chip, RecordTabs' button) only
 * DISPATCHES a window event (`hs:open-deal-card` with `{ dealCardId }`) and this
 * host LISTENS + fetches + mounts. No module back-imports another; the coupling
 * stays at the route, exactly like the deal deep-link page. Mirrors the app's
 * existing `hs:deal-updated` / `hs:create-deal` window-event contract.
 *
 * `openCardId` is pure UI state - it grants no data access. The card is fetched
 * with the RLS-scoped `getDealCard`, so a non-member who forges the event reads
 * nothing (existing guarantee, unchanged). It only changes WHERE the data renders.
 *
 * D-31: while the panel is open, it dispatches `hs:deal-card-panel` with
 * `{ open }` so the chat-list rail can auto-collapse to free space (the rail's
 * listener lands with the rail rework in plan 07-05). This host owns the signal;
 * consumers subscribe - no shared store, no cross-module import.
 */
export function DealCardPanelHost() {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [data, setData] = useState<DealCardView | null>(null);
  // the Open Items source (07-07): the card's flat Things list + the workspace id
  // that lets Open Items inline-add. Default empty so the section renders even
  // before (or when) the extra reads resolve.
  const [things, setThings] = useState<ThingView[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  // Open Items' assignable people (both companies' deal members) + who the viewer
  // is, resolved from the SAME getWorkspace read - powers @mention + assign (07-07).
  const [people, setPeople] = useState<MemberView[]>([]);
  const [viewerPersonId, setViewerPersonId] = useState<string | null>(null);
  const [viewerCompanyId, setViewerCompanyId] = useState<string | null>(null);

  // CREATE MODE (chj/07-08): a not-yet-born draft opened in the SAME 50/50 panel as
  // a real card. DealPin (which knows the relationship) fires `hs:create-deal-card`
  // with the recipient; we render an empty createMode card here, and on "Save draft"
  // mint it + swap to the born 'unsent' card. Null = not creating.
  const [createReq, setCreateReq] = useState<{
    relationshipId: string;
    buyerName: string;
    /** Lane A: present when the door is a p2p chat — the person persists on the
     *  born card (metadata.counterparty_person_id), so the LATER send_deal
     *  delivers person-target (chat bubble) instead of a company inbox ticket. */
    counterpartyPersonId?: string;
  } | null>(null);

  // D-13: the create card registers its close rule here (via registerCloseRequest)
  // so the host's OWN dismiss doors (Escape, opening another card) route through
  // the same content-check - auto-save a filled draft, discard an empty one.
  const createCloseRef = useRef<(() => void) | null>(null);
  // the ref only holds a rule while a create card is mounted - clear it when the
  // create panel goes away so a later dismiss cannot fire a stale closure.
  useEffect(() => {
    if (!createReq) createCloseRef.current = null;
  }, [createReq]);

  // bumped on `hs:deal-updated` to re-run the card fetch (chj/07-08). This is how
  // the open panel refreshes LIVE after a change is proposed / signed / declined -
  // same-browser (DecisionBar + CardFront dispatch it) AND cross-browser (DealPin's
  // realtime handler re-broadcasts it), so the red/green diff appears on both sides.
  const [reloadKey, setReloadKey] = useState(0);

  // listen for the open-card event (fired by DealPin's chip + RecordTabs' button)
  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<{ dealCardId?: string }>).detail?.dealCardId;
      if (id) {
        // opening a real card dismisses any pending create - through the D-13
        // close rule (a filled draft auto-saves), never a blind discard.
        if (createCloseRef.current) createCloseRef.current();
        else setCreateReq(null);
        setOpenCardId(id);
      }
    }
    window.addEventListener("hs:open-deal-card", onOpen);
    return () => window.removeEventListener("hs:open-deal-card", onOpen);
  }, []);

  // listen for the create-card event (fired by DealPin's "+ Create a deal" door,
  // which carries the relationship + recipient). Opens the create panel; a live
  // card that was open is closed so the create card takes the slot.
  useEffect(() => {
    function onCreate(e: Event) {
      const d = (
        e as CustomEvent<{
          relationshipId?: string;
          buyerName?: string;
          counterpartyPersonId?: string;
        }>
      ).detail;
      if (d?.relationshipId) {
        setOpenCardId(null);
        setCreateReq({
          relationshipId: d.relationshipId,
          buyerName: d.buyerName ?? "your contact",
          counterpartyPersonId: d.counterpartyPersonId,
        });
      }
    }
    window.addEventListener("hs:create-deal-card", onCreate);
    return () => window.removeEventListener("hs:create-deal-card", onCreate);
  }, []);

  // listen for `hs:deal-updated` and re-fetch the open card (chj/07-08). A change
  // to any OTHER card is ignored (the id must match, or carry no id). This is the
  // panel's live-refresh signal - see reloadKey above.
  useEffect(() => {
    function onUpdated(e: Event) {
      const id = (e as CustomEvent<{ dealCardId?: string }>).detail?.dealCardId;
      if (!id || id === openCardId) setReloadKey((k) => k + 1);
    }
    window.addEventListener("hs:deal-updated", onUpdated);
    return () => window.removeEventListener("hs:deal-updated", onUpdated);
  }, [openCardId]);

  // SAVE DRAFT (chj/07-08, reshaped Phase-12 D-13): the create card handed up
  // the assembled draft. Mint it via createDeal - a PRIVATE 'unsent' birth with
  // NO app-side delivery (D-06: delivery is written once, in send_deal, when the
  // user presses Send on the born card) - tell siblings it changed, then swap
  // the create panel for the born draft in the SAME slot: the user lands on
  // their persisted card, reloaded through the normal born-card read path, with
  // the DecisionBar showing "Send deal".
  async function handleCreate(input: CardCreateInput) {
    if (!createReq) return;
    const { dealCardId } = await createDeal({
      relationshipId: createReq.relationshipId,
      // Lane A routing key: a p2p door names the counterparty - persisted on
      // the card (metadata.counterparty_person_id) so the LATER send_deal
      // delivers person-target (chat bubble), not a company inbox ticket.
      counterpartyPersonId: createReq.counterpartyPersonId ?? null,
      ...input,
    });
    window.dispatchEvent(
      new CustomEvent("hs:deal-updated", { detail: { dealCardId } }),
    );
    setCreateReq(null);
    setOpenCardId(dealCardId);
  }

  // D-13 close rule, host half: the create card handed up its content on dismiss.
  // Content -> silent auto-birth (the draft lands in the DB as a private 'unsent'
  // card; the panel closes - the Deals tab shows it as a grey Draft). Null (an
  // empty card) -> plain discard (the locked C5 rule). A birth failure keeps the
  // panel open so the user's work is never thrown away.
  async function handleCloseCreate(input: CardCreateInput | null) {
    if (!createReq) return;
    if (!input) {
      setCreateReq(null);
      return;
    }
    try {
      const { dealCardId } = await createDeal({
        relationshipId: createReq.relationshipId,
        counterpartyPersonId: createReq.counterpartyPersonId ?? null,
        ...input,
      });
      window.dispatchEvent(
        new CustomEvent("hs:deal-updated", { detail: { dealCardId } }),
      );
      setCreateReq(null);
    } catch (err) {
      console.error("auto-saving the draft on close failed", err);
    }
  }

  // fetch the card view when a deal is opened (RLS-scoped; same fetch DealPin uses).
  // ALSO load the workspace + its Things so Open Items renders the real list
  // (07-07). Both extra reads are wrapped so a failure only leaves Open Items
  // empty - it never blanks the card. Reset to defaults up front so the previous
  // card's Things never flash on the next one; the `alive` guard drops stale
  // results on a fast close/reopen.
  useEffect(() => {
    let alive = true;
    void (async () => {
      // Reset up front (inside the async body, not synchronously in the effect
      // body) so the previous card's Things never flash on the next one - and
      // without tripping react-hooks/set-state-in-effect. This still runs in the
      // same tick (before the first await), so there is no stale flash.
      setThings([]);
      setWorkspaceId(null);
      setPeople([]);
      setViewerPersonId(null);
      setViewerCompanyId(null);
      const d = openCardId ? await getDealCard(openCardId).catch(() => null) : null;
      if (alive) setData(d);
      if (!openCardId) return;

      const ws = await getWorkspace(openCardId).catch(() => null);
      const wsId = ws?.workspaceId ?? null;
      // the Things list + the assignable ROSTER (both companies' people) in
      // parallel - the roster powers Open Items' @mention + assign list.
      const [list, roster] = await Promise.all([
        wsId ? getThings(wsId).catch(() => []) : Promise.resolve([] as ThingView[]),
        getDealPeople(openCardId).catch(() => [] as MemberView[]),
      ]);
      if (alive) {
        setWorkspaceId(wsId);
        setThings(list);
        setPeople(roster);
        setViewerCompanyId(ws?.viewerCompanyId ?? null);
        setViewerPersonId(
          roster.find((m) => m.isViewer)?.personId ??
            ws?.members.find((m) => m.isViewer)?.personId ??
            null,
        );
      }
    })();
    return () => {
      alive = false;
    };
    // reloadKey re-runs this on hs:deal-updated so the panel refreshes live.
  }, [openCardId, reloadKey]);

  // D-31 - tell the rail to collapse while the panel is open (create or real),
  // expand on close.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("hs:deal-card-panel", {
        detail: { open: !!openCardId || !!createReq },
      }),
    );
  }, [openCardId, createReq]);

  // close on Escape - the keyboard mirror of the backdrop click (either panel)
  useEffect(() => {
    if (!openCardId && !createReq) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenCardId(null);
        // D-13: dismissing the create panel goes through the card's close rule
        // (a filled draft auto-saves, an empty one discards) - never a blind
        // discard of typed work.
        if (createCloseRef.current) createCloseRef.current();
        else setCreateReq(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCardId, createReq]);

  function closePanel() {
    setOpenCardId(null);
  }

  if (!openCardId && !createReq) return null;

  return (
    // D-32 (revised): an IN-FLOW 50/50 panel, NOT a blurred overlay. As a flex
    // sibling of the surface content (see the Connect layout), this flex-1 aside
    // shrinks the content to the other half - the chat "minimizes" and the card
    // takes the right half, no backdrop, no blur. The X closes it and the content
    // expands back; the header's deal control reopens it.
    <aside
      aria-label="Deal card"
      className="glass-strong flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl"
    >
      {/* No separate top bar - the close X now lives ON the card's own title bar
          (passed as onClose), so the panel spends no extra row on it. */}
      {/* D1 (Wave 1): the host no longer scrolls - the card fills this box
          (h-full chain) and owns its own inner paper scroll, so the card's
          titlebar + decision zone stay pinned. */}
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {createReq ? (
          // CREATE MODE: an empty draft card. "Save draft" births it via
          // handleCreate (which swaps this panel for the born 'unsent' card);
          // dismissing routes through handleCloseCreate (D-13: content
          // auto-saves as a draft, an empty card discards). onClose stays as
          // the render gate for the title-bar X + a fallback plain close.
          <DealCard
            data={emptyDraftView(createReq.buyerName)}
            createMode
            onClose={() => setCreateReq(null)}
            onCloseCreate={handleCloseCreate}
            registerCloseRequest={(fn) => {
              createCloseRef.current = fn;
            }}
            onCreate={handleCreate}
          />
        ) : data ? (
          <DealCard
            key={openCardId}
            data={data}
            things={things}
            workspaceId={workspaceId}
            people={people}
            viewerPersonId={viewerPersonId}
            viewerCompanyId={viewerCompanyId}
            onClose={closePanel}
            // Editing is allowed ONLY on a live open card with no held change
            // (chj/07-08): unsent (a creator edits their private draft) or
            // negotiation (today's edit flow, Phase-12). Once signed (confirmed),
            // declined (cancelled), or executed (done) the card is locked; while
            // a change is held the responder uses the DecisionBar.
            onEdit={
              (data.card.status === "unsent" || data.card.status === "negotiation") &&
              !data.pendingChange
                ? ALLOW_EDIT
                : undefined
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink/40">
            Loading deal card…
          </div>
        )}
      </div>
    </aside>
  );
}
