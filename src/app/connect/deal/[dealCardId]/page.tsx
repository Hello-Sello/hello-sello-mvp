import { DealWorkspace } from "@/modules/deals";
import { DealChat } from "@/modules/messaging";

/**
 * Deal Workspace route (screen ④, 3b) - the deal container, deep-linked by
 * card id (both doors know it: the Chat list's Deals tab and the chat card
 * bar's "Deal workspace ↗"). RLS scopes every read to the two deal companies.
 *
 * This page is the composition root: deals owns the container, messaging owns
 * the deal chat - composing them HERE keeps the modules acyclic.
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
