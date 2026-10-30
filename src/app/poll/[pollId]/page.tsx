import type { Metadata } from "next";
import { PollLanding } from "@/modules/demand";

export const metadata: Metadata = { title: "Demand poll — Hello Sello" };

/**
 * Temporary public poll page reached from a Demand share link. Public in
 * `shared/db/proxy.ts` and bare in `AppShell` (no rail), like `/c/<handle>`.
 */
export default async function PollPage({
  params,
  searchParams,
}: {
  params: Promise<{ pollId: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { pollId } = await params;
  const { d } = await searchParams;
  return <PollLanding pollId={pollId} encoded={d ?? null} />;
}
