// Dedup / supersession decision (Sella 4b, step 3). PURE - no I/O. Given the last
// preview Sella surfaced on a thread and the fresh detection outcome, it decides what
// the chat should do: post nothing, stay quiet (a repeat), post the first preview, or
// replace a stale one. The Edge Function (the outer layer) reads the prior state from
// the DB and carries out the decision, so this judgment stays testable without a DB.
//
// The two keys, kept deliberately apart (Muskan's B2):
//   - productKey   = the dedup IDENTITY (which product), EXCLUDING qty/price. Two runs
//                    about the same product are "the same deal" even as numbers move.
//   - dealSignature = the SUPERSESSION trigger: verdict + qty/price/currency. When this
//                    changes, the deal materially changed and the old preview is stale.
import type { DetectDealResult } from "./tools.ts";

type DealBody = DetectDealResult["deal"];

/** Normalized product identity for dedup. Null when there is no concrete product. */
export function productKey(deal: DealBody): string | null {
  if (!deal || deal.line_items.length === 0) return null;
  const names = deal.line_items
    .map((li) => (li.name ?? "").trim().toLowerCase())
    .filter((n) => n.length > 0)
    .sort();
  return names.length ? names.join(" | ") : null;
}

/**
 * A stable string over everything a MATERIAL change can touch (verdict, currency, and
 * each line's qty/unit/price). Equal signatures => nothing worth re-surfacing.
 */
export function dealSignature(verdict: string, deal: DealBody): string {
  if (!deal) return `${verdict}::none`;
  const items = deal.line_items
    .map(
      (li) =>
        `${(li.name ?? "").trim().toLowerCase()}#${li.quantity ?? ""}#${li.unit ?? ""}#${
          li.unit_price ?? ""
        }`,
    )
    .sort()
    .join(",");
  return `${verdict}::${deal.currency ?? ""}::${items}`;
}

/** The last preview Sella surfaced on this thread (from the newest sella_detection row). */
export interface SurfacedState {
  verdict: string;
  /** the stored draft body (sella_detection.draft). */
  draft: DealBody;
  /** the deal_detected chat_message it points at. */
  surfacedMessageId: string;
}

/** The fresh detection result, reduced to what the decision needs. */
export interface NextDetection {
  /** a real forming/firm deal WITH grounded evidence (detect.ts already computed this). */
  isDeal: boolean;
  verdict: string;
  deal: DealBody;
}

export type SurfaceDecision =
  // not a surfaceable deal (no_deal, or a positive verdict with invented evidence):
  // remember the run for dedup, post nothing.
  | { kind: "none" }
  // identical to the live preview: a repeat. Keep the existing message, post nothing.
  | { kind: "suppress"; keepMessageId: string }
  // first preview on this thread: post a fresh deal_detected message.
  | { kind: "post" }
  // the deal materially changed (qty/price jump, or forming -> firm): post a fresh
  // message AND mark the prior one superseded so its stale votes never carry over.
  | { kind: "supersede"; previousMessageId: string };

export function decideSurface(prev: SurfacedState | null, next: NextDetection): SurfaceDecision {
  if (!next.isDeal) return { kind: "none" };
  if (!prev) return { kind: "post" };
  const unchanged = dealSignature(prev.verdict, prev.draft) === dealSignature(next.verdict, next.deal);
  return unchanged
    ? { kind: "suppress", keepMessageId: prev.surfacedMessageId }
    : { kind: "supersede", previousMessageId: prev.surfacedMessageId };
}

/** A one-line "previously surfaced" hint fed back into the prompt (context.ts). */
export function surfacedSummary(state: SurfacedState | null): string | null {
  if (!state?.draft) return null;
  const key = productKey(state.draft);
  return state.draft.summary ?? key ?? null;
}
