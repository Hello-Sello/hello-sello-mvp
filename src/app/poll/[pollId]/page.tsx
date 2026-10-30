import type { Metadata } from "next";
import { PollLanding } from "@/modules/demand";

export const metadata: Metadata = { title: "Demand poll — Hello Sello" };

/**
 * Temporary public group poll reached from a Demand link (`&me=` marks a
 * pharmacy's personal link). Public in `shared/db/proxy.ts` and bare in
 * `AppShell` (no rail), like `/c/<handle>`.
 */
export default async function PollPage({
  params,
  searchParams,
}: {
  params: Promise<{ pollId: string }>;
  searchParams: Promise<{ d?: string; me?: string }>;
}) {
  const { pollId } = await params;
  const { d, me } = await searchParams;
  return <PollLanding pollId={pollId} encoded={d ?? null} me={me ?? null} />;
}
