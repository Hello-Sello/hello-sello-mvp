/**
 * Task 8b plumbing: the URL that lands the viewer inside relationship R's
 * company-to-company chat with deal card D already open. Both `createDeal()`
 * callers that need to show their result use this - the basket popover
 * (Task 8a) and the chat "Create Deal" button (Task 8c):
 *
 *   const { dealCardId } = await sendBasketGroup(group, input);
 *   router.push(dealChatUrl(input.relationshipId, dealCardId));
 *
 * Investigation finding (see task-8b-report.md): DealPin needs NO new
 * selection logic. Its mount effect already defaults `selectedId` to the
 * newest live (unsent/negotiation/confirmed) deal for the relationship, and
 * `listRelationshipDeals` orders newest-first - so a just-created draft is
 * already first in that list by construction. The one real gap was that
 * NOTHING today lets you deep-link INTO a specific relationship's chat at
 * all: ChatView holds `selectedThreadId` as pure client state with no URL
 * sync. `relationship` closes that gap (ChatView resolves + selects the c2c
 * thread for it); `deal` re-fires the deals module's existing
 * `hs:open-deal-card` window-event contract (the same one DealPin's chip and
 * the `/connect/deal/[dealCardId]` deep link use) so the card panel opens
 * without another click.
 */
export function dealChatUrl(relationshipId: string, dealCardId: string): string {
  return `/connect/chat?relationship=${relationshipId}&deal=${dealCardId}`;
}
