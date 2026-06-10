/**
 * Public surface for the deals module (screen ① - the Deal Card).
 *
 * Phase 0 exposes the data shapes + pure derivation helpers only. The UI
 * (DealCard / DealPin) and the reads/writes land in later phases and are added
 * here as they are built - this barrel stays the ONLY public surface, exactly
 * like messaging/ and relationship/.
 */
export type {
  DealType,
  DealCardStatus,
  PartySide,
  LineItemView,
  PartyFieldView,
  LogEntry,
  SignalView,
  DealCardView,
} from "./types";

export {
  docTerm,
  docAbbr,
  sellerCompanyId,
  buyerCompanyId,
  viewerSide,
  computeGross,
  formatMoney,
  lineTotalOf,
  DEMO_VAT_RATE,
} from "./lib/derive";

export { getDealCard } from "./supabase/reads";
export { DealCard } from "./components/DealCard";
