# Connect · Inbox - prototype notes

**Throwaway prototype.** Built 2026-06-06. Light theme, slate + pink-600, reuses the Connect shell.
Run: Claude Preview config `inbox-prototype` (port 8768), or `python3 -m http.server 8768 --directory _workshop/inbox-prototype`.
Flip variants: `?variant=A|B|C`, the bottom switcher, or `←` / `→`.

## Question this answers

How should Connect → Inbox look, and what's the right triage interaction for accepting / declining
inbound connection-requests between companies (the front door before any chat or deal)?

## Use case (Ayush)

Before any chat or deal, two companies must connect. Inbound requests land in a shared Inbox.
- **4 request types** (low → high intent): plain `connect` · `+ message` · `price-list` ask (buyer→supplier only) · `deal-card` attached.
- **Team triage**: a request is claimed (pull) by whoever picks it up, or assigned (push) by a super-admin.
- **Collision visibility**: everyone sees who's working which ticket.
- **Personal history**: each person sees the history of tickets they handled.

## Research (5 sources, fast scan)

Industry has already solved this - it's the "shared team inbox" pattern.
- **Shared inbox + personal lenses** (Front, Intercom, Help Scout, MS "My Queue"): one shared pile, saved
  filters on top (Mine / Unassigned / All / Done). → resolves the "shared vs single-user" fork; not either/or.
- **Claim (pull) or admin-assign (push)** coexist everywhere. Each ticket has an assignee slot.
- **Collision cues** (Front, Hiver, Zendesk, HelpDesk): assignee avatar on the row, an "eye" when someone's
  viewing, "X is replying" typing indicator. Live presence = real-time infra → v2.
- **Type tags** (LinkedIn note-vs-no-note is itself a visual type). The 4 types form an **intent ladder**.
- **Alibaba RFQ**: buyer posts request → supplier quotes back, ~3 days to deal. Precedent for the price-list type.

Sources: Front collision (help.front.com/en/articles/2403), Hiver collision-alerts, Zendesk agent-collision,
HelpDesk collision, Intercom assign, MS Dynamics "My Queue", LinkedIn with/without note, Alibaba RFQ.

## Refined v1 model

One shared Connect Inbox · four typed request cards · an assignee on each · four lenses:
**Unassigned** (claimable) / **Mine** / **All** (team) / **My history**.
Refinements over the raw idea: (1) sort by intent ladder so hot leads surface; (2) ship the cheap collision
cue (assignee avatar + "being handled by X") for v1, defer live viewing/typing presence to v2.

## The 3 variants (same shell + mock-DB drawer; different primary action)

- **A - Shared inbox (master/detail + lenses)** - industry default. Typed list + assignee avatars left,
  full request detail + Accept / Decline / Claim right. Read-then-act.
- **B - Screening (one at a time)** - blitz the Unassigned pile, big card, keyboard A/D/N. Solo velocity.
- **C - Ops queue (table + bulk)** - dense table, inline accept/decline + select-all bulk, type-filter chips.
  Super-admin distributing work.

All three mutate one shared `REQUESTS` + `DERIVED` store. Accept writes `relationship` + C2C `chat_thread` +
a "connected" `chat_message`; Decline only logs to `audit_log` (sender not notified, LinkedIn-style).

## Verdict

**LOCKED: Variant A** (shared inbox - master/detail + lenses), design and flow, 2026-06-06 (Ayush).
A's read-then-act primary action fits a team that handles each connect-request with care, and it drops into
the existing Connect 5-panel shell so later screens inherit the pattern. The accept → connect → relationship
+ C2C chat flow was approved too.

Prototype collapsed to A-only (B and C + the variant switcher removed). B (blitz-screening) and C (bulk
ops-table) are parked for **v2** - revisit when triage volume grows or a super-admin distribution role appears.
They remain in git history + described above.

Next: extend A (wire the "Start a deal" CTA into the Connect Deal Chat), then promote `_workshop/inbox-prototype`
into the shared `docs/` / `prototypes/` at the next batch/wrap step (sync ritual applies).
