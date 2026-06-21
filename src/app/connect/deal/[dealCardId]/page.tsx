import { DealWorkspace } from "@/modules/deals";
import { DealChat } from "@/modules/messaging";

/**
 * Deal Workspace route (screen ④, 3b) - the deal container, deep-linked by
 * card id (both doors know it: the Chat list's Deals tab and the chat card
 * bar's "Deal workspace ↗"). RLS scopes every read to the two deal companies.
 *
 * This page is the deep-link composition root: deals owns the container,
 * messaging owns the deal chat - composing them HERE keeps the modules acyclic.
 *
 * Phase 5 (D-01): the Room is normally reached as a FULL BLURRED OVERLAY from the
 * chat, NOT this full-page detour. The overlay open/close lives at the Connect
 * layout's `DealRoomOverlayHost` (the strip dispatches `hs:open-deal-room`; the
 * host listens + mounts `DealWorkspace` + the `DealChat` slot, closing straight
 * back to the chat per D-03 - never via the relationship page). This page stays
 * as the acyclic deep-link entry; both modules are composed at the route, never
 * back-imported into each other.
 *
 * Next 16: `params` is async - await it before reading the segment.
 */
export default async function ConnectDealWorkspacePage({
  params,
}: {
  params: Promise<{ dealCardId: string }>;
}) {
  const { dealCardId } = await params;
  return <DealWorkspace dealCardId={dealCardId} chat={<DealChat dealCardId={dealCardId} />} />;
}
