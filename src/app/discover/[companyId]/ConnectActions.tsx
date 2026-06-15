"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, Check, MessagesSquare, Loader2 } from "lucide-react";
import type { ConnectionState } from "../companies";
import { sendConnectRequest } from "../actions";

/**
 * Connect CTA on a company profile (the unified design: one Connect button + a
 * little optional note). No note → a plain `connect` request; with a note →
 * `connect_message`. The send is a real INSERT (server action); the button then
 * reflects the resulting state. Other states (connected / incoming / already
 * requested) short-circuit to the right affordance.
 */
export function ConnectActions({
  companyId,
  companyName,
  state,
}: {
  companyId: string;
  companyName: string;
  state: ConnectionState;
}) {
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">(
    state === "requested" ? "sent" : "idle",
  );
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (state === "connected")
    return (
      <Link
        href="/connect/chat"
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-success/15 px-5 py-3 text-sm font-bold text-success"
      >
        <MessagesSquare size={17} /> Connected — go to chat
      </Link>
    );

  if (state === "incoming")
    return (
      <Link
        href="/connect/inbox"
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-soft/60 px-5 py-3 text-sm font-bold text-brand-deep hover:bg-brand-soft"
      >
        {companyName} wants to connect — open inbox →
      </Link>
    );

  if (phase === "sent")
    return (
      <div className="flex w-full items-center justify-center gap-2 rounded-2xl bg-success/15 px-5 py-3 text-sm font-bold text-success">
        <Check size={17} /> Request sent
      </div>
    );

  async function submit() {
    setErr(null);
    setPhase("sending");
    const res = await sendConnectRequest(companyId, note);
    if ("error" in res) {
      setErr(res.error);
      setPhase("idle");
      return;
    }
    setPhase("sent");
  }

  return (
    <div className="flex flex-col gap-2.5">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={280}
        placeholder={`Add a note for ${companyName} (optional)…`}
        className="w-full resize-none rounded-2xl border border-ink/10 bg-white/70 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <button
        onClick={submit}
        disabled={phase === "sending"}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-deep disabled:opacity-60"
      >
        {phase === "sending" ? (
          <><Loader2 size={17} className="animate-spin" /> Sending…</>
        ) : (
          <><UserPlus size={17} /> Connect</>
        )}
      </button>
      {err && <p className="text-xs font-medium text-danger">{err}</p>}
    </div>
  );
}
