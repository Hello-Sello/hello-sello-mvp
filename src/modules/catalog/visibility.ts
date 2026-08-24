/**
 * "Why can't buyers see this product?" — the SELLER-FACING answer.
 *
 * ⚠️ ADVISORY ONLY, AND DELIBERATELY SO. The authoritative rule is SQL:
 * `get_discoverable_shop`'s WHERE clause (`20260822100000`) and the
 * `product_visible_to_caller()` definer helper that `20260824090000` made the
 * single owner of it. This module exists so a seller can be TOLD why their
 * product is not reaching buyers. It must never gate a read, and nothing
 * server-side may depend on it. If the two ever disagree, SQL is right and this
 * is the bug.
 *
 * ⚠️ Corrected 2026-08-24, same day it was written: the first draft cited the
 * `product_public_select` RLS policy as the second authority. **That policy no
 * longer exists** — `20260824090000` DROPPED it and re-pointed its borrowers at
 * `product_visible_to_caller()`, in a parallel session, hours after this file
 * was authored. Caught by that session's own cross-session note, not by this
 * one. Being advisory is what kept a stale citation from becoming a stale gate.
 *
 * That split is the whole reason this file is small and has no opinions: a
 * second *enforcing* copy of a visibility rule is the failure this slug spent
 * four security rounds on. A second *explaining* copy is safe, because the worst
 * it can do is show the wrong sentence.
 *
 * Term-for-term against that WHERE clause, minus the arms the owner can't act on
 * from a product card:
 *   · `p.profile_visible = true`                     → "hidden"
 *   · `p.location is not null`                       → "no location"
 *   · `visibility_start <= current_date <= …_end`    → "outside its dates"
 *
 * The location term carries an owner exemption in SQL (`or p.company_id =
 * current_company_id()`), which is precisely why an unfiled product looks fine
 * on `/present` and is invisible on `/discover`. The exemption is correct — and
 * reporting it here is what stops it from being silent.
 *
 * NOT restated: the seller's own company verification and soft-delete. Neither
 * is a per-product fact, and neither is fixable from a card.
 */

/** One reason a buyer cannot see a product the seller can. */
export type BuyerVisibilityGap = "hidden" | "unfiled" | "outside_dates";

/** The seller state this rule reads. A structural subset of `ShopProduct`, so a
 *  buyer-facing mapper — which carries none of these — cannot be passed here by
 *  accident and then silently report "visible". */
export type BuyerVisibilityInput = {
  profile_visible?: boolean;
  location: string | null;
  visibility_start?: string | null;
  visibility_end?: string | null;
};

const GAP_LABEL: Record<BuyerVisibilityGap, string> = {
  hidden: "hidden",
  unfiled: "no location",
  outside_dates: "outside its dates",
};

/** `Date` → `YYYY-MM-DD` in LOCAL time. `toISOString()` is wrong here: it
 *  converts to UTC first, so anywhere east of Greenwich late in the evening it
 *  reports tomorrow and a product flips its window a day early. The DB columns
 *  are `date`, compared against `current_date`, so a plain calendar-day string
 *  comparison is the exact equivalent. */
function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Every reason buyers cannot see this product, in the order a seller would fix
 * them. Empty array = buyers can see it.
 *
 * All applicable reasons are returned rather than the "first" one: a product
 * that is both hidden and unfiled stays invisible after un-hiding, and a badge
 * that then moves the goalposts reads as a bug in the badge.
 *
 * `profile_visible === false`, not `!profile_visible` — it is optional seller
 * state, and ABSENT must not read as hidden (the same guard `ProductCard` has
 * carried since T05).
 */
export function buyerVisibilityGaps(
  p: BuyerVisibilityInput,
  today: Date = new Date(),
): BuyerVisibilityGap[] {
  const gaps: BuyerVisibilityGap[] = [];
  if (p.profile_visible === false) gaps.push("hidden");
  if (p.location === null || p.location.trim() === "") gaps.push("unfiled");

  const now = isoDate(today);
  const notYet = p.visibility_start != null && p.visibility_start > now;
  const expired = p.visibility_end != null && p.visibility_end < now;
  if (notYet || expired) gaps.push("outside_dates");

  return gaps;
}

/** The gaps as one line of subtext: `hidden · no location`. Empty string for no
 *  gaps, so callers can't render a stray separator. */
export function buyerVisibilityLabel(gaps: BuyerVisibilityGap[]): string {
  return gaps.map((g) => GAP_LABEL[g]).join(" · ");
}
