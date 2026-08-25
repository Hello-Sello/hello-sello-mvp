/**
 * Render + selector contract for `CounterpartyPersonSelect` (T02/HEL-64,
 * slug 0023-deal-draft-lands-in-chat — PLAN-T02.md rev 2 §5, cases C1/C2/C7).
 *
 * The component does not exist yet (builder's job, PLAN §2) — every test
 * below is EXPECTED to fail on module-not-found until it lands. That IS the
 * correct RED: the contract is pinned before the implementation, not
 * reverse-engineered from it.
 *
 * Runner: `npm run test:unit` (vitest, `environment: "node"` —
 * `vitest.config.ts:34`). **No jsdom, no @testing-library.** Rendering is
 * `renderToStaticMarkup` (`react-dom/server`); `useEffect` NEVER fires, so
 * every render assertion below is an INITIAL-PAINT assertion — `people`
 * starts `[]` and stays `[]` for the lifetime of these tests, which is
 * exactly the "zero people" case PLAN clause 1 (M7) requires to be provable
 * without a DOM.
 *
 * C1 — the exact substring asserted is
 * `<option value="" selected="">Whole company</option>`. This is deliberate,
 * not incidental: `renderToStaticMarkup` only emits `selected=""` on the
 * matching option when the `<select>` is CONTROLLED (`value={...}`) — an
 * UNCONTROLLED select emits no `selected` attribute at all (measured in a
 * scratchpad probe this session, PLAN clause 5 / `plan-checker` N4). An
 * implementation that otherwise matches the plan but leaves the select
 * uncontrolled passes every other assertion in this file and fails ONLY
 * this string — which is the point: it is what makes J6's "defaults to the
 * whole company" criterion provable rather than assumed.
 *
 * C2 — the trap case. `RecipientPicker`'s own-company fallback string
 * ("Connect with a company first to send an offer.") must NOT be inherited:
 * in a connected buyer's group that sentence is false, and under this
 * jsdom-less env it is the ONLY statically renderable output of the OLD
 * component — so a wrong inherit would render markup that is otherwise
 * indistinguishable from a correct implementation everywhere else in this
 * file. Asserted on the SAME render as C1 (L-021 — presence and absence
 * proved on one state, not two).
 *
 * C7 — pure, no render. `peopleForRelationship` must key on
 * `relationshipId`, never `companyId` — both are `string` on
 * `ConnectedCompany` (`messaging/types.ts:201-220`), both compile, and a
 * `companyId`-keyed implementation renders IDENTICALLY to a correct one in
 * C1/C2 (both start from an empty `people` array under static render) while
 * shipping a control whose people list never fills — the exact "dead
 * control" state PLAN clause 4 forbids, surfacing only live at G4. The
 * fixture below is a DECOY built to catch exactly that swap.
 *
 * NOT covered here (PLAN §5 "declared uncovered" — a green run here is
 * never cover for these): AC 2 / M7 live (a real seller with zero connected
 * people — needs `getMyConnections()` to resolve, which `useEffect` never
 * does under this env) and the interaction case (choosing a person changes
 * `createBasketDraft`'s payload — needs DOM event dispatch). Both are
 * T03 (e2e) + G4 territory, not this file's.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CounterpartyPersonSelect,
  peopleForRelationship,
} from "./CounterpartyPersonSelect";
import type {
  ConnectedCompany,
  ConnectedPerson,
  MyConnectionsView,
} from "@/modules/messaging";

describe("<CounterpartyPersonSelect> — initial paint (C1, C2)", () => {
  it("C1: renders a select aria-labelled 'Address this deal to', with 'Whole company' as the first, SELECTED option (J6 default)", () => {
    const html = renderToStaticMarkup(
      <CounterpartyPersonSelect relationshipId="rel-1" onPick={() => {}} />,
    );

    expect(html).toContain("<select");
    expect(html).toContain('aria-label="Address this deal to"');
    // The exact, measured substring — see the file header on why
    // `selected=""` only appears for a CONTROLLED select, and why an
    // uncontrolled implementation would pass every other assertion in this
    // file but fail this one.
    expect(html).toContain(
      '<option value="" selected="">Whole company</option>',
    );
  });

  it("C2: does NOT inherit RecipientPicker's own-company fallback string (the trap case)", () => {
    const html = renderToStaticMarkup(
      <CounterpartyPersonSelect relationshipId="rel-1" onPick={() => {}} />,
    );

    // Same render as C1 (L-021: presence and absence proved on one state).
    expect(html).not.toContain(
      "Connect with a company first to send an offer.",
    );
  });
});

describe("peopleForRelationship — pure selector, no render (C7)", () => {
  const personA: ConnectedPerson = {
    personId: "person-a1",
    name: "Alice A",
    initials: "AA",
    role: null,
  };
  const personB: ConnectedPerson = {
    personId: "person-b1",
    name: "Bob B",
    initials: "BB",
    role: null,
  };

  // The decoy: company A's `companyId` is the literal string "rel-1" — the
  // id under test — while its OWN `relationshipId` is "r-A". Company B
  // carries the real "rel-1" as its `relationshipId`. A `companyId`-keyed
  // implementation returns A's people for "rel-1"; the correct,
  // `relationshipId`-keyed one returns B's. No other case in this file is
  // sensitive to this swap.
  function makeView(): MyConnectionsView {
    const companyA: ConnectedCompany = {
      companyId: "rel-1",
      relationshipId: "r-A",
      name: "Company A",
      city: null,
      initials: "CA",
      contactsCount: 1,
      connectedAt: "2026-01-01T00:00:00.000Z",
      openDealCount: 0,
      people: [personA],
    };
    const companyB: ConnectedCompany = {
      companyId: "co-B",
      relationshipId: "rel-1",
      name: "Company B",
      city: null,
      initials: "CB",
      contactsCount: 1,
      connectedAt: "2026-01-01T00:00:00.000Z",
      openDealCount: 0,
      people: [personB],
    };
    return {
      companies: [companyA, companyB],
      viewerCompanyId: "own-co",
      viewerPersonId: "viewer-1",
      myCompany: null,
    };
  }

  it("C7: keys on relationshipId, not companyId — returns company B's people for 'rel-1', not decoy company A's", () => {
    const view = makeView();
    expect(peopleForRelationship(view, "rel-1")).toEqual([personB]);
  });

  it("C7: an unknown relationshipId returns [] rather than throwing", () => {
    const view = makeView();
    expect(() =>
      peopleForRelationship(view, "no-such-relationship"),
    ).not.toThrow();
    expect(peopleForRelationship(view, "no-such-relationship")).toEqual([]);
  });
});
