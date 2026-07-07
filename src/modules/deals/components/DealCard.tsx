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
import { useState } from "react";
import { FlipHorizontal2, Lock, Pencil } from "lucide-react";
import { CardFront } from "./CardFront";
import { CardBack } from "./CardBack";
import type { DealCardView, MemberView, ThingView } from "../types";

export function DealCard({
  data,
  onEdit,
  onClose,
  things = [],
  workspaceId,
  people = [],
  viewerPersonId,
  viewerCompanyId,
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
}) {
  const [flipped, setFlipped] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // D-17: a closed (sealed) deal locks editing - the pencil becomes a lock.
  const isClosed = data.card.status === "done";
  // the pencil shows only when editing is allowed AND the deal is open.
  const canEdit = !!onEdit && !isClosed;

  return (
    <div className="relative w-full" style={{ perspective: "1600px" }}>
      {/* flip - top-left corner. Sits in the title-bar's left gutter (CardFront
          leaves pl-12 clear), so it reads as the left-most title-bar control. */}
      <button
        onClick={() => setFlipped((f) => !f)}
        className="dc-tb-btn absolute left-3 top-3 z-30 grid h-[30px] w-[30px] place-items-center rounded-full"
        title={flipped ? "Flip to deal" : "Flip to signals & logs"}
        aria-label={flipped ? "Flip to deal" : "Flip to signals and logs"}
      >
        <FlipHorizontal2 className="h-[14px] w-[14px]" />
      </button>

      {/* edit / lock - top-right corner (D-16/D-17), in the title-bar's right gutter */}
      {isClosed ? (
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
            onClick={() => setEditMode((e) => !e)}
            className={`absolute right-3 top-3 z-30 grid h-[30px] w-[30px] place-items-center rounded-full border transition ${
              editMode
                ? "border-brand/30 bg-brand text-white"
                : "dc-tb-btn"
            }`}
            title={editMode ? "Done editing" : "Edit deal"}
            aria-label={editMode ? "Done editing" : "Edit deal"}
            aria-pressed={editMode}
          >
            <Pencil className="h-[14px] w-[14px]" />
          </button>
        )
      )}

      {/* ---- FLIPPING LAYER: rotates on Y between the two faces ---- */}
      <div
        className="relative transition-transform duration-500 ease-in-out"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* FRONT - in normal flow, defines the card box; hidden once rotated away */}
        <div style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
          <CardFront
            data={data}
            things={things}
            workspaceId={workspaceId}
            people={people}
            viewerPersonId={viewerPersonId}
            viewerCompanyId={viewerCompanyId}
            editMode={editMode}
            onExitEdit={() => setEditMode(false)}
            onActivity={() => setFlipped(true)}
            onClose={onClose}
          />
        </div>

        {/* BACK - fills the box, pre-rotated 180deg so it faces forward when flipped */}
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
      </div>
    </div>
  );
}
