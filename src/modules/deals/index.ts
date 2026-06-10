/**
 * Public surface for the deals module (screen ① - the Deal Card, and
 * screen ④ - the Deal Workspace).
 *
 * This barrel stays the ONLY public surface, exactly like messaging/ and
 * relationship/. UI components and reads are added here as the phases land.
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
  MemberRole,
  MemberView,
  WorkspaceVisibility,
  DealWorkspaceView,
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

export { getDealCard, getCurrentDealCardId, getWorkspace } from "./supabase/reads";
export { DealCard } from "./components/DealCard";
export { DealPin } from "./components/DealPin";
export { DealWorkspace } from "./components/DealWorkspace";
