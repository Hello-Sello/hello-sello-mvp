import { RelationshipPage } from "@/modules/relationship";

/**
 * Relationship route - the company↔company record (screen ③), reached from a
 * chat header's "My Relationship with …" button. The deep-link key is the
 * relationship id; RLS scopes every read to the viewer's side.
 *
 * Next 16: `params` is async - await it before reading the segment.
 */
export default async function ConnectRelationshipPage({
  params,
}: {
  params: Promise<{ relationshipId: string }>;
}) {
  const { relationshipId } = await params;
  return <RelationshipPage relationshipId={relationshipId} />;
}
