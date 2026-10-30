"use client";

import { Wordmark } from "@/shared/ui/Wordmark";
import { contactById } from "../data";
import { decodeShared, usePolls } from "../store";
import type { SharedPoll } from "../types";
import { PollGrid } from "./PollGrid";

/**
 * The temporary public group poll (`/poll/<id>?d=…[&me=…]`). Every invited
 * pharmacy has a named row; everyone sees everyone's numbers. A personal link
 * (`&me=`) pre-selects the viewer's row so they see at once where to fill in.
 * Rendered bare (no app rail) like `/c/<handle>`.
 */
export function PollLanding({
  pollId,
  encoded,
  me,
}: {
  pollId: string;
  encoded: string | null;
  me: string | null;
}) {
  const polls = usePolls();
  const local = polls.find((p) => p.id === pollId);
  const poll: SharedPoll | null = decodeShared(pollId, encoded) ?? local ?? null;

  if (!poll) {
    return (
      <Frame>
        <h1 className="text-xl font-extrabold text-ink">Poll not found</h1>
        <p className="mt-2 text-sm text-ink-muted">This link is incomplete or the poll was removed.</p>
      </Frame>
    );
  }

  // eslint-disable-next-line react-hooks/purity -- demo: status is read at render time
  const closed = Date.now() > poll.expiresAt;
  const meId = me ? `c-${me}` : null;
  const meContact = meId && poll.recipientIds.includes(meId) ? contactById(meId) : undefined;
  const closes = new Date(poll.expiresAt).toLocaleDateString("en-GB");

  return (
    <div className="min-h-full px-4 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <Wordmark />
          <span className="rounded-full bg-brand-soft/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-deep">
            Group demand poll
          </span>
        </div>

        <div className="glass rounded-3xl p-5">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{poll.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {closed
              ? "This poll has closed — the numbers below are final."
              : `Enter how many grams of each product you would order. Open until ${closes}.`}
          </p>
          {meContact && !closed && (
            <p className="mt-3 rounded-xl bg-brand/[0.08] px-3 py-2 text-sm text-brand-deep">
              Hi {meContact.name.split(" ")[0]} — your row <strong>{meContact.company}</strong> is highlighted
              below. Click <strong>Fill in your order</strong>, enter your grams, then Save.
            </p>
          )}
          {!meContact && !closed && (
            <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-sm text-ink-muted">
              Find your pharmacy in the list and click <strong>This is me</strong>.
            </p>
          )}
        </div>

        <PollGrid
          shared={poll}
          responses={local?.responses ?? []}
          mode={closed ? "view" : "fill"}
          initialMe={meContact ? meId : null}
        />

        <p className="text-center text-[11px] text-ink-muted">Powered by Hello Sello · no account needed</p>
      </div>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-md rounded-3xl p-8 text-center">
        <div className="mb-5 flex justify-center">
          <Wordmark />
        </div>
        {children}
      </div>
    </div>
  );
}
