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
  LineMarginView,
  LogEntry,
  SignalView,
  DealCardView,
  MemberRole,
  MemberView,
  WorkspaceVisibility,
  DealWorkspaceView,
  StageCode,
  ThingType,
  ThingStatus,
  ThingView,
  ArtifactView,
  StageCompletionView,
  StageView,
  ConfirmationStatus,
  ConfirmSeat,
  ConfirmDecision,
  ConfirmResult,
  FinalizeDealResult,
  CatalogProduct,
  DraftLineInput,
  DealBasket,
  DealBasketContent,
  DealRecipient,
  DealRecipientView,
  DealSource,
  CreateDealInput,
  CreateDealResult,
  EditDealInput,
  EditDealResult,
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

export {
  getDealCard,
  getCurrentDealCardId,
  getOwnCatalog,
  getWorkspace,
  getStagesAndThings,
  resolveP2pRecipient,
} from "./supabase/reads";
export { toggleThingStatus, createThing } from "./supabase/writes";
export { confirmDeal, createDeal, editDeal } from "./actions";
export { DealCard } from "./components/DealCard";
export { DealPin } from "./components/DealPin";
export { DealWorkspace } from "./components/DealWorkspace";
export { SellaMark } from "./components/SellaMark";
export { SellaCurtain } from "./components/SellaCurtain";
export { TranslateButton } from "./components/TranslateButton";
