"use client";

import { useEffect, useId, useRef } from "react";
import { createClient } from "@/shared/db/client";

interface RealtimeHandlers {
  /** a message was inserted into some thread the viewer can see */
  onMessageInsert: (threadId: string) => void;
  /** a thread the viewer can see was created (e.g. the other side accepted) */
  onThreadInsert: () => void;
}

/**
 * Live chat updates (2d Phase 5) via Supabase "Postgres Changes".
 *
 * Supabase delivers each changed row ONLY to subscribers whose RLS SELECT policy
 * allows it, so privacy holds automatically (a non-member company gets nothing).
 * The realtime socket must carry the user's token (`setAuth`) or it connects as
 * anon and, with our authenticated-only policies, would receive no events.
 *
 * Handlers are kept in a ref so the channel subscribes ONCE (on mount) yet always
 * calls the latest closures - so `onMessageInsert` sees the current open thread.
 */
export function useChatRealtime(handlers: RealtimeHandlers): void {
  const ref = useRef(handlers);
  // A per-instance channel name. Supabase reuses a channel by NAME, so a FIXED
  // name breaks when two instances mount at once (e.g. ChatView under the Deal
  // Room overlay + DealChat inside it): the second `.channel(name).on(...)` hits
  // the first's already-subscribed channel and throws "cannot add postgres_changes
  // callbacks ... after subscribe()". `useId` gives each instance its own channel.
  const instanceId = useId();
  // Keep the ref pointed at the latest handlers WITHOUT writing it during render
  // (react-hooks/refs): update it in an effect that runs after every render, so
  // the mount-only subscription below always calls the current closures.
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      // carry the session token so RLS filtering applies to the stream
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel(`connect-chat-realtime-${instanceId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_message" },
          (payload) => {
            const threadId = (payload.new as { thread_id?: string }).thread_id;
            if (threadId) ref.current.onMessageInsert(threadId);
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_thread" },
          () => ref.current.onThreadInsert(),
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [instanceId]);
}
