"use client";

/**
 * Deal card (3a) - the card object with its FRONT and BACK.
 *
 * Flip (Phase 4 S2): a REAL CSS-3D flip. The card physically rotates on the Y
 * axis between the front (deal facts) and the back (Signals + Logs). The 3D is
 * inline-styled - `perspective` on the outer box, `preserve-3d` + `rotateY` on
 * the flipping layer, and `backface-visibility: hidden` on both faces so only
 * the facing side shows.
 *
 * The FRONT is in normal flow and DEFINES the card box; the BACK fills it
 * (`absolute inset-0`) pre-rotated 180deg so it faces forward once flipped.
 *
 * The two corner controls live in the header corners and sit OUTSIDE the flipping
 * layer, so they stay upright on both faces: flip top-left, EDIT top-right.
 *
 * EDIT-MODE (07-07, D-16/D-17): the top-right control is the SINGLE inline
 * edit-mode toggle for the WHOLE card (not a modal form). It renders as:
 *   - a LOCK icon when the deal is CLOSED (status `done`) - the ONLY closed-state
 *     cue now that the golden skin is gone (D-17); the card is sealed, no editing;
 *   - nothing while a change is HELD (`pendingChange`) - the responder resolves it
 *     via the on-card DecisionBar, so editing is locked (the DB unique index is the
 *     real lock; DealPin passes `onEdit=undefined` in that state);
 *   - a PENCIL otherwise - clicking toggles the card into inline row-edit mode.
 * `onEdit` from the strip is the "editing allowed" gate; the actual edit is now the
 * inline mode owned here + CardFront (the old EditDealForm modal is superseded).
 */
import { useRef, useState } from "react";
import { Check, FlipHorizontal2, Lock, Pencil } from "lucide-react";
import { CardFront } from "./CardFront";
import { CardBack } from "./CardBack";
import type { CardCreateInput, DealCardView, MemberView, ThingView } from "../types";

export function DealCard({
  data,
  onEdit,
  onClose,
  things = [],
  workspaceId,
  people = [],
  viewerPersonId,
  viewerCompanyId,
  createMode = false,
  onCreate,
}: {
  data: DealCardView;
  /**
   * The "editing allowed" gate (3.5b). DealPin passes `undefined` while a change
   * is held, which hides the pencil; when defined, the pencil toggles inline
   * edit-mode (D-16). Kept as a prop so the strip still controls editability.
   */
  onEdit?: () => void;
  /** close the whole card panel - forwarded to the title-bar X (panel host only). */
  onClose?: () => void;
  /** the flat Open Items list for the front (D-15); wired from the panel host. */
  things?: ThingView[];
  /** the deal_workspace_id - lets Open Items inline-add (createThing). */
  workspaceId?: string | null;
  /** both companies' deal members - Open Items' assignable people. */
  people?: MemberView[];
  /** the viewer's person + company - Open Items "You" + private ownership. */
  viewerPersonId?: string | null;
  viewerCompanyId?: string | null;
  /**
   * CREATE MODE (chj/07-08): render a not-yet-born draft. Edit mode starts ON and
   * stays on (no pencil, no flip, no back face), and the front's footer becomes
   * "Send deal" which calls `onCreate`. Used by the chat "+ Create a deal" door.
   */
  createMode?: boolean;
  onCreate?: (input: CardCreateInput) => Promise<void>;
}) {
  const [flipped, setFlipped] = useState(false);
  // create mode is always-editing: seed edit mode ON so the empty draft is fillable.
  const [editMode, setEditMode] = useState(!!createMode);
  // the front card registers its send-then-exit here (2026-07-22): the header ✓
  // routes through it so unsent edits are SENT, never silently discarded.
  const exitRequestRef = useRef<(() => void) | null>(null);

  // Any decided deal is locked (chj/07-08): once signed (confirmed), declined
  // (cancelled), executed (done) or ticketed, the pencil becomes a lock - no
  // editing. Open states (Phase-12): unsent (private draft) + negotiation (sent).
  const isClosed =
    data.card.status !== "unsent" && data.card.status !== "negotiation";
  // the pencil shows only when editing is allowed AND the deal is open.
  const canEdit = !!onEdit && !isClosed;

  return (
    <div className="relative h-full w-full" style={{ perspective: "1600px" }}>
      {/* flip - top-left corner. Sits in the title-bar's left gutter (CardFront
          leaves pl-12 clear), so it reads as the left-most title-bar control.
          Hidden in create mode: a not-yet-born draft has no Signals/Logs back. */}
      {!createMode && (
        <button
          onClick={() => setFlipped((f) => !f)}
          className="dc-tb-btn absolute left-3 top-3 z-30 grid h-[30px] w-[30px] place-items-center rounded-full"
          title={flipped ? "Flip to deal" : "Flip to signals & logs"}
          aria-label={flipped ? "Flip to deal" : "Flip to signals and logs"}
        >
          <FlipHorizontal2 className="h-[14px] w-[14px]" />
        </button>
      )}

      {/* edit / lock - top-right corner (D-16/D-17), in the title-bar's right gutter.
          Hidden in create mode: the card is already (and only) in edit mode. */}
      {createMode ? null : isClosed ? (
        <span
          className="dc-tb-btn absolute right-3 top-3 z-30 grid h-[30px] w-[30px] place-items-center rounded-full"
          title="This deal is sealed"
          aria-label="This deal is sealed"
        >
          <Lock className="h-[14px] w-[14px]" />
        </span>
      ) : (
        canEdit && (
          <button
            onClick={() => {
              // 2026-07-22: leaving edit mode goes through the card's exit
              // request, which SENDS unsent edits (or plainly exits when
              // nothing changed) — the ✓ must never silently discard work.
              if (editMode && exitRequestRef.current) {
                exitRequestRef.current();
                return;
              }
              setEditMode((e) => !e);
            }}
            className={`absolute right-3 top-3 z-30 grid h-[30px] w-[30px] place-items-center rounded-full border transition ${
              editMode
                ? "border-brand/30 bg-brand text-white"
                : "dc-tb-btn"
            }`}
            title={editMode ? "Done editing" : "Edit deal"}
            aria-label={editMode ? "Done editing" : "Edit deal"}
            aria-pressed={editMode}
          >
            {editMode ? (
              <Check className="h-[14px] w-[14px]" />
            ) : (
              <Pencil className="h-[14px] w-[14px]" />
            )}
          </button>
        )
      )}

      {/* ---- FLIPPING LAYER: rotates on Y between the two faces ---- */}
      <div
        className="relative h-full transition-transform duration-500 ease-in-out"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* FRONT - in normal flow, defines the card box; hidden once rotated away.
            h-full chain (D1, Wave 1): host box -> perspective wrapper -> flipping
            layer -> this face, so the card is BOUNDED and owns its inner scroll. */}
        <div
          className="h-full"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <CardFront
            data={data}
            things={things}
            workspaceId={workspaceId}
            people={people}
            viewerPersonId={viewerPersonId}
            viewerCompanyId={viewerCompanyId}
            editMode={editMode}
            onActivity={() => setFlipped(true)}
            onClose={onClose}
            createMode={createMode}
            onCreate={onCreate}
            onExitEdit={() => setEditMode(false)}
            registerExitRequest={(fn) => {
              exitRequestRef.current = fn;
            }}
          />
        </div>

        {/* BACK - fills the box, pre-rotated 180deg so it faces forward when flipped.
            Not mounted in create mode: the back reads signals/log that a
            not-yet-born draft does not have. */}
        {!createMode && (
          <div
            className="absolute inset-0"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <CardBack data={data} />
          </div>
        )}
      </div>
    </div>
  );
}
