/**
 * Deal card (3a) - the card object.
 *
 * Phase 3: renders the FRONT only. Phase 4 wraps this in the flip container and
 * adds the back (Signals + Logs tabs). Kept as the single card entry point so
 * the chat placement (Phase 5) mounts one component.
 */
import { CardFront } from "./CardFront";
import type { DealCardView } from "../types";

export function DealCard({ data }: { data: DealCardView }) {
  return <CardFront data={data} />;
}
