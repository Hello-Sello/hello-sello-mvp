"use client";

import { Check, Clock, X, BadgeCheck } from "lucide-react";
import type { ConfirmSeat, PartySide } from "../types";

/**
 * The two-sided confirm gate UI (3d) - the Seal face.
 *
 * 4.5.3: this lives inside the Sella strip's Seal popover (DealPin State C). It
 * used to be a top-of-card banner; the contract is unchanged - only its host
 * moved, which is exactly why it was kept dumb.
 *
 * REUSABLE + DUMB (3d D2): it knows only the two seats + the viewer's side and
 * calls the handlers; it has NO `deal_confirmation` knowledge. 3.5 feeds the
 * same bar from the per-change accept source ("same face, different engine").
 * The parent owns the data and the golden card-level styling; this bar only
 * shows who has confirmed and offers the viewer's action.
 */
export interface ConfirmBarProps {
  /** [seller, buyer] seats for the current version */
  seats: ConfirmSeat[];
  /** which side the viewer is on; null = an onlooker (read-only) */
  viewerSide: PartySide | null;
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}

export function ConfirmBar({
  seats,
  viewerSide,
  busy,
  onConfirm,
  onDecline,
}: ConfirmBarProps) {
  const bothConfirmed = seats.length === 2 && seats.every((s) => s.status === "confirmed");
  const viewerSeat = viewerSide ? seats.find((s) => s.side === viewerSide) ?? null : null;
  const otherSeat = viewerSide ? seats.find((s) => s.side !== viewerSide) ?? null : null;

  const gold = bothConfirmed;

  return (
    <div
      className={`rounded-xl p-2.5 ${
        gold ? "bg-amber-50 ring-1 ring-amber-300" : "bg-white/70 ring-1 ring-brand/10"
      }`}
    >
      {/* headline */}
      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        {gold ? (
          <>
            <BadgeCheck size={14} className="text-amber-600" strokeWidth={2} />
            <span className="text-[11px] font-semibold text-amber-700">Agreed by both sides</span>
          </>
        ) : (
          <span className="text-[11px] font-semibold text-ink/55">
            Both sides must confirm to seal this deal
          </span>
        )}
      </div>

      {/* the two seats */}
      <div className="flex gap-2">
        {seats.map((s) => (
          <Seat key={s.side} seat={s} isYou={s.side === viewerSide} gold={gold} />
        ))}
      </div>

      {/* the viewer's action */}
      {viewerSeat && !bothConfirmed && (
        <div className="mt-2">
          {viewerSeat.status === "confirmed" ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink/55">
                Waiting for {otherSeat?.companyName ?? "the other side"}…
              </span>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check size={13} strokeWidth={2.5} />
                Confirm deal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onDecline}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink/55 ring-1 ring-ink/15 hover:bg-ink/5 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          )}
          {otherSeat?.status === "rejected" && (
            <p className="mt-1.5 text-[11px] text-rose-600">
              {otherSeat.companyName} declined - back to negotiation.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Seat({ seat, isYou, gold }: { seat: ConfirmSeat; isYou: boolean; gold: boolean }) {
  const confirmed = seat.status === "confirmed";
  const rejected = seat.status === "rejected";

  const tint = gold
    ? "bg-amber-100/70"
    : confirmed
      ? "bg-emerald-50"
      : rejected
        ? "bg-rose-50"
        : "bg-ink/[0.04]";

  return (
    <div className={`flex-1 rounded-lg px-2.5 py-1.5 ${tint}`}>
      <p className="text-[10px] uppercase tracking-wide text-ink/40">
        {seat.side === "seller" ? "Seller" : "Buyer"}
        {isYou && <span className="text-brand"> · you</span>}
      </p>
      <p className="truncate text-[11px] font-medium text-ink/75">{seat.companyName}</p>
      <p
        className={`mt-0.5 flex items-center gap-1 text-[11px] ${
          gold || confirmed
            ? "text-emerald-600"
            : rejected
              ? "text-rose-600"
              : "text-ink/40"
        }`}
      >
        {confirmed ? (
          <>
            <Check size={11} strokeWidth={3} />
            {seat.byName ? `confirmed · ${seat.byName.split(" ")[0]}` : "confirmed"}
          </>
        ) : rejected ? (
          <>
            <X size={11} strokeWidth={3} />
            declined
          </>
        ) : (
          <>
            <Clock size={11} strokeWidth={2} />
            not yet
          </>
        )}
      </p>
    </div>
  );
}
