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
  ThingType,
  ThingStatus,
  ThingView,
  ArtifactView,
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
  PromotionState,
  PromotionLineDelta,
  PromotionConditionDelta,
  PromotionView,
  OfferPromotionInput,
  OfferPromotionResult,
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

export { promotionSavings } from "./lib/promotion";

export { dealChatUrl } from "./lib/dealChatUrl";

export {
  getDealCard,
  getCurrentDealCardId,
  getOwnCatalog,
  getWorkspace,
  getThings,
  getDealPeople,
  getDealArtifacts,
  getPromotion,
  resolveP2pRecipient,
} from "./supabase/reads";
export {
  toggleThingStatus,
  createThing,
  setThingVisibility,
  assignThing,
  uploadDealInvoice,
} from "./supabase/writes";
export {
  confirmDeal,
  createDeal,
  editDeal,
  finalizeDeal,
  offerPromotion,
  acceptPromotion,
  declinePromotion,
  reopenTicket,
  closeTicket,
} from "./actions";
export { DealCard } from "./components/DealCard";
export { DealPin } from "./components/DealPin";
