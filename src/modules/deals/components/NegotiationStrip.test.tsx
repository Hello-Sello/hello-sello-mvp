/**
 * Render test for <NegotiationStrip> (Wave 3b, Region C, B1).
 *
 * The strip that pins to the top of the deal-card scroll region announces that a
 * change is on the table. The trigger rule is narrow: it renders ONLY when the
 * deal is live (`negotiation`) AND a change is held; every other case renders
 * nothing (a private `unsent` draft, or a live deal with no held change).
 *
 * Render path: `react-dom/server` `renderToStaticMarkup` - keeps this in the
 * repo's pure-`node` vitest env (no jsdom / @testing-library). The RED state:
 * `./NegotiationStrip` does not exist yet, so the import throws module-not-found.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NegotiationStrip } from "./NegotiationStrip";

describe("<NegotiationStrip> (the in-negotiation trigger rule)", () => {
  it("renders the strip only when negotiation AND a change is held", () => {
    const html = renderToStaticMarkup(
      <NegotiationStrip status="negotiation" hasHeldChange={true} />,
    );
    expect(html).toContain("In negotiation");
  });

  it("renders nothing in negotiation when no change is held", () => {
    const html = renderToStaticMarkup(
      <NegotiationStrip status="negotiation" hasHeldChange={false} />,
    );
    expect(html).toBe("");
  });

  it("renders nothing for a held change on a non-negotiation status (unsent draft)", () => {
    const html = renderToStaticMarkup(
      <NegotiationStrip status="unsent" hasHeldChange={true} />,
    );
    expect(html).toBe("");
  });
});
