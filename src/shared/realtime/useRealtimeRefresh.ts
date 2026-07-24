"use client";

import { useEffect, useId, useRef } from "react";
import { createClient } from "@/shared/db/client";

/** One table to watch, and which change events to react to (default: all). */
export type WatchedTable = {
  table: string;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
};

/**
 * Subscribe to Supabase "Postgres Changes" on one or more tables and invoke
 * `onChange` on any matching change — the reusable core of live-updating a surface.
 * Typically `onChange = () => router.refresh()`, so the route's server components
 * re-fetch and the page reflects the change instantly (the same pattern Chat uses).
 *
 * Realtime applies each table's RLS SELECT policy to the stream, so a subscriber
 * only ever receives rows they are allowed to see — privacy holds by construction.
 * The socket must carry the user's token (`setAuth`) or it connects as anon and,
 * under authenticated-only policies, receives nothing.
 *
 * The handler is kept in a ref so the channel subscribes ONCE per table-set yet
 * always calls the latest closure; the channel name is per-instance (`useId`) so a
 * remount never collides with a still-open channel of the same name.
 */
export function useRealtimeRefresh(tables: WatchedTable[], onChange: () => void): void {
  const ref = useRef(onChange);
  const instanceId = useId();
  // Serialise the config so the subscribe effect re-runs only when the SET of
  // watched tables actually changes, not on every render (callers may pass an
  // inline array). The effect reads the config back from this key.
  const tablesKey = JSON.stringify(tables);

  useEffect(() => {
    ref.current = onChange;
  });

  useEffect(() => {
    const watched: WatchedTable[] = JSON.parse(tablesKey);
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      // Carry the session token so RLS filtering applies to the stream.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      let ch = supabase.channel(`realtime-refresh-${instanceId}`);
      for (const t of watched) {
        ch = ch.on(
          "postgres_changes",
          { event: t.event ?? "*", schema: "public", table: t.table },
          () => ref.current(),
        );
      }
      channel = ch.subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [instanceId, tablesKey]);
}
