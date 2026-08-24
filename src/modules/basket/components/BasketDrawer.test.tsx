/**
 * Render contract for BasketDrawer's non-connected-buyer arm (0022, T02,
 * HEL-56 — PLAN-T02.md rev 3, B5/B6; "What must be tested that rev 2 left
 * untested" B4).
 *
 * The criterion (TICKETS.md T02): "When a non-connected buyer opens the
 * basket drawer, the system shall state that connecting comes first and
 * offer the Connect action, rather than a Send that cannot fire."
 *
 * B5 — the correct condition is `!group.isOwnCompany && group.relationshipId
 * === null`, NOT `!group.relationshipId` (which is ALSO true for the
 * seller's own-company group, `basket/lib/group.ts:24` — that arm must keep
 * rendering `RecipientPicker` + a live "Create a draft deal" button exactly
 * as it does today). The three fixtures below are own-company /
 * connected-foreign / non-connected-foreign, per the plan's explicit ask.
 *
 * ⚠️ Obstacle noted in the plan: `Group` (BasketDrawer.tsx:187) is
 * module-private and not exported, and it is coupled to `useBasket()`
 * (indirectly, via its parent `BasketDrawer`). Rather than export `Group` or
 * extract a pure predicate — both are `src/` changes, outside this pass's
 * write-fence — these tests render the ALREADY-EXPORTED `BasketDrawer`
 * itself and mock `useBasket()` (from `../BasketProvider`) to supply a
 * single-group `BasketView` fixture per test. This exercises the real
 * integration (BasketDrawer → Group), not just Group in isolation, with no
 * source change at all. See the RETURN notes for the two alternatives
 * considered and why this one was preferred.
 *
 * `renderToStaticMarkup` — this repo's vitest env is pure node, no jsdom
 * (`ProductCard.gate.test.tsx` precedent). Initial paint only: `RecipientPicker`'s
 * `useEffect`-driven `getMyConnections()` fetch never fires, so it renders its
 * `companies.length === 0` fallback ("Connect with a company first…") — that
 * is a DIFFERENT message from this ticket's non-connected-FOREIGN-group
 * message, and it belongs to the own-company arm only (RecipientPicker is
 * never mounted for a foreign group either way).
 *
 * Interaction (click → setOpen(false) → router.push) is NOT testable under
 * this static-render env — no DOM, no event dispatch. That half of B6 needs
 * either jsdom/RTL (not configured in this repo) or a Playwright e2e; flagged
 * as a gap in the RETURN, not silently skipped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BasketDrawer } from "./BasketDrawer";
import { useBasket } from "../BasketProvider";
import type { BasketGroup, BasketLine } from "../types";

vi.mock("../BasketProvider", () => ({ useBasket: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function makeLine(overrides: Partial<BasketLine> = {}): BasketLine {
  return {
    id: "line-1",
    productId: "prod-1",
    productName: "Test Product",
    cultivar: null,
    unit: "g",
    packCount: 1,
    packSizeGrams: 100,
    pricePerGram: 5,
    currency: "EUR",
    pzn: null,
    sellerCompanyId: "seller-x",
    sellerCompanyName: "Seller X",
    tiers: [],
    ...overrides,
  };
}

function renderDrawerWithGroup(group: BasketGroup): string {
  vi.mocked(useBasket).mockReturnValue({
    view: { groups: [group], totalLineCount: group.lines.length },
    refresh: vi.fn(async () => {}),
    open: true,
    setOpen: vi.fn(),
    error: null,
  });
  return renderToStaticMarkup(<BasketDrawer />);
}

beforeEach(() => {
  vi.mocked(useBasket).mockReset();
});

describe("<BasketDrawer> Group — the non-connected-buyer arm (T02, HEL-56)", () => {
  it("own-company group: the shipped path is UNTOUCHED — no 'connect first' message, RecipientPicker still mounts", () => {
    const group: BasketGroup = {
      sellerCompanyId: "own-co",
      sellerCompanyName: "My Shop",
      isOwnCompany: true,
      relationshipId: null,
      lines: [makeLine({ sellerCompanyId: "own-co", sellerCompanyName: "My Shop" })],
    };
    const html = renderDrawerWithGroup(group);

    // B5: `!group.relationshipId` alone is ALSO true here (own-company groups
    // always carry a null relationshipId) — a predicate that keyed off that
    // alone would wrongly route this group into the non-connected message.
    expect(html).not.toContain("connecting comes first");
    expect(html).toContain("Create a draft deal");
    // RecipientPicker's own-company-only fallback (no connections loaded yet
    // under static render) — proves RecipientPicker mounted at all.
    expect(html).toContain("Connect with a company first to send an offer.");
  });

  it("connected-foreign group (relationshipId set): renders the live 'Create a draft deal' path, no connect-first message", () => {
    const group: BasketGroup = {
      sellerCompanyId: "seller-connected",
      sellerCompanyName: "GreenLeaf",
      isOwnCompany: false,
      relationshipId: "rel-1",
      lines: [makeLine({ sellerCompanyId: "seller-connected", sellerCompanyName: "GreenLeaf" })],
    };
    const html = renderDrawerWithGroup(group);

    expect(html).not.toContain("connecting comes first");
    expect(html).toContain("Create a draft deal");
  });

  it("non-connected-foreign group (relationshipId null, NOT own company): states connecting comes first and offers a Connect link, not a dead Send button", () => {
    const group: BasketGroup = {
      sellerCompanyId: "seller-stranger",
      sellerCompanyName: "Stranger Co",
      isOwnCompany: false,
      relationshipId: null,
      lines: [makeLine({ sellerCompanyId: "seller-stranger", sellerCompanyName: "Stranger Co" })],
    };
    const html = renderDrawerWithGroup(group);

    // B6 point 3: hide the disabled Send button in this arm entirely — never
    // render it dead beside the explanation.
    expect(html).not.toContain("Create a draft deal");
    // A Connect action pointing at the shop page that already owns connect
    // state (B6's decision: a Link to /discover/[sellerCompanyId], not a
    // second copy of ConnectActions).
    expect(html).toContain('href="/discover/seller-stranger"');
    expect(html.toLowerCase()).toContain("connect");
  });
});

/**
 * T15 — a failed basket read must not look like an empty basket.
 *
 * `BasketProvider` used to collapse every failure of `getMyBasket()` into the
 * empty view, so a permission error, a schema-cache miss on the brand-new
 * `get_my_basket_lines` RPC, or a dead connection all rendered as "Your basket
 * is empty." The provider now carries an `error`; this is the assertion that
 * the drawer actually shows it.
 *
 * Presence AND absence asserted in the same state (L-021): on a blank panel
 * everything is absent, so "no empty-copy" alone would prove nothing.
 */
describe("<BasketDrawer> — a read failure is shown, not disguised as empty (T15)", () => {
  it("renders the failure and NOT the empty-basket copy", () => {
    vi.mocked(useBasket).mockReturnValue({
      view: { groups: [], totalLineCount: 0 },
      refresh: vi.fn(async () => {}),
      open: true,
      setOpen: vi.fn(),
      error: "We couldn't load your basket.",
    });

    const html = renderToStaticMarkup(<BasketDrawer />);

    expect(html).toContain("We couldn&#x27;t load your basket.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("Your basket is empty.");
  });
});
