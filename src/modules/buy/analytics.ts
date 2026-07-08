/**
 * Buy — Analytics/Sheet aggregation, REAL Supabase read (18-CONTEXT.md's
 * "Money model" + "Data source layering (locked)").
 *
 * `getBuyAnalytics()` is the ONE data-stitching layer both the AnalyticsTable
 * (rows/rollups) and AnalyticsChart (series data) read from. It fetches the
 * caller's buyer-narrowed `deal_line_item` rows (mirrors `getSellerOrders`'s
 * seller-narrowing, inverted — same flat-fetch-then-stitch discipline as
 * `allocate/orders.ts`/`calendarDeals.ts`) PLUS `purchase_history_import` CSV
 * rows, delegates the `(supplierName, productName)` grouping/merge step to
 * `mergeAnalyticsLines()` (18-07 Task 1 — do NOT re-implement that step here),
 * then applies the already-TDD'd money math from `lib/money.ts` (18-02 — do
 * NOT re-derive wap/db1/margin formulas here either) and reuses
 * `getBuyPartners()` (18-06) for each supplier's connected/relationshipId link.
 *
 * v0 "degenerate category-per-product" rule (locked, 18-CONTEXT.md/RESEARCH.md
 * Open Question #1): no real `product.category`/type schema exists, so each
 * product is wrapped in its own single-item "category" — the tree stays a
 * real 3 levels (Supplier -> Category -> Product) without fabricating
 * taxonomy data the system doesn't have.
 */
import { createClient } from "@/shared/db/server";
import { getCurrentCompanyId } from "@/shared/auth";
import { buyerCompanyId, lineTotalOf, type DealType } from "@/modules/deals";
import { lineGrams } from "@/modules/allocate";
import { getBuyPartners } from "./partners";
import { mergeAnalyticsLines, type AnalyticsSourceLine, type MergedAnalyticsLine } from "./lib/analyticsMerge";
import { weightedAveragePrice, db1Total, db1PerUnit, marginPercent } from "./lib/money";

/** One product row inside a (degenerate, single-item) category. */
export interface AnalyticsProductRow {
  /** null for a CSV-only product (no real catalogue row). */
  productId: string | null;
  productName: string;
  /** grams, normalized via lineGrams() */
  qty: number;
  /** weightedAveragePrice() over this product's live+CSV lines */
  wap: number;
  /** from buyer_resale_price, looked up by (buyer, supplier_name, product_name) */
  net: number | null;
  gross: number | null;
  /** net * qty, or null if net is null */
  revenue: number | null;
  db1Total: number | null;
  db1PerUnit: number | null;
  marginPercent: number | null;
  /** revenue / grand total revenue across all suppliers */
  share: number;
  /**
   * `product.pack_size_grams` for this (supplier, product) pair (18-14 fix) —
   * null for a CSV-only product (no real catalogue row, so honestly no pack
   * size) or a real product whose pack size was never set.
   */
  packSizeGrams: number | null;
}

/** v0 degenerate category: always exactly 1 product (no real taxonomy yet). */
export interface AnalyticsCategoryRow {
  /** v0 degenerate: === productId ?? productName */
  categoryId: string;
  /** v0 degenerate: === productName */
  categoryName: string;
  products: AnalyticsProductRow[];
  qty: number;
  wap: number;
  revenue: number | null;
  db1Total: number | null;
  marginPercent: number | null;
  share: number;
}

export interface AnalyticsSupplierRow {
  /** BuyPartner.key */
  supplierKey: string;
  supplierName: string;
  connected: boolean;
  relationshipId: string | null;
  categories: AnalyticsCategoryRow[];
  qty: number;
  wap: number;
  revenue: number | null;
  db1Total: number | null;
  marginPercent: number | null;
  share: number;
}

/**
 * One raw source line (18-14 fix) — same shape as `AnalyticsSourceLine`, plus
 * its own resolved `net`/`gross` (the SAME `resaleByKey` lookup `priced`
 * already computes per merged group, just attached here at the line level
 * instead) so per-period revenue/DB1 can be computed without re-deriving the
 * lookup. `date`/`packSizeGrams` are re-declared non-optional here — this
 * type always comes from `getBuyAnalytics()`, which always populates both —
 * so it's structurally a valid `TimeSeriesSourceLine` (`./lib/analyticsTimeSeries.ts`).
 */
export interface PricedAnalyticsSourceLine extends AnalyticsSourceLine {
  date: string;
  packSizeGrams: number | null;
  net: number | null;
  gross: number | null;
}

export interface BuyAnalytics {
  suppliers: AnalyticsSupplierRow[];
  totalRevenue: number;
  /**
   * Raw, per-source, NOT (supplier, product)-collapsed lines — every one
   * carries its own real `date` and resolved `net`/`gross` (18-14 fix). This
   * is what the Analytics chart's real time-bucketing
   * (`./lib/analyticsTimeSeries.ts`) reads; `suppliers` above stays the
   * table's (supplier -> category -> product) rollup tree, unaffected.
   */
  lines: PricedAnalyticsSourceLine[];
}

/** Minimal shape of a `deal_card` row needed for buyer-narrowing. */
interface DealCardRow {
  id: string;
  relationship_id: string;
  version: number;
  deal_type: string;
  initiating_company_id: string;
  /** Real per-card date (18-14 fix) — preferred date for that card's lines. */
  delivery_date_target: string | null;
  created_at: string;
}

/** Minimal shape of a `relationship` row needed for buyer-narrowing. */
interface RelationshipRow {
  id: string;
  company_a_id: string;
  company_b_id: string;
}

/**
 * Local mirror of plan 18-06's `BuyPartner` shape, used ONLY to keep this
 * file's own type-checking self-contained regardless of `getBuyPartners()`'s
 * resolved return type — never re-declared as the canonical type (that stays
 * `./partners`'s own export); this is purely a type-narrowing cast at the one
 * call site below.
 */
interface BuyPartnerLike {
  key: string;
  name: string;
  connected: boolean;
  relationshipId: string | null;
  companyId: string | null;
}

export async function getBuyAnalytics(): Promise<BuyAnalytics> {
  const callerCompanyId = await getCurrentCompanyId();
  if (!callerCompanyId) return { suppliers: [], totalRevenue: 0, lines: [] };

  const supabase = await createClient();

  // 1. Buyer-narrowed deal_card rows -> relationship -> supplier company name,
  // then this buyer's current-version deal_line_item rows for those cards.
  // Buyer-only narrowing mirrors getSellerOrders' seller-only narrowing,
  // inverted (T-18-11) — no shared buyer-narrowing helper exists yet to reuse
  // (same as partners.ts's own note), so this duplicates the inline filter,
  // consistent in style with orders.ts/calendarDeals.ts/partners.ts.
  // `delivery_date_target`/`created_at` are selected for the 18-14 fix —
  // per-card real date, so the Analytics chart can bucket by real time.
  const { data: cards, error: cardsErr } = await supabase
    .from("deal_card")
    .select("id, relationship_id, version, deal_type, initiating_company_id, delivery_date_target, created_at")
    .is("deleted_at", null);
  if (cardsErr) throw cardsErr;
  const cardRows = (cards ?? []) as DealCardRow[];

  let dealLines: AnalyticsSourceLine[] = [];
  if (cardRows.length > 0) {
    const relationshipIds = Array.from(new Set(cardRows.map((c) => c.relationship_id)));
    const { data: relationships, error: relErr } = await supabase
      .from("relationship")
      .select("id, company_a_id, company_b_id")
      .in("id", relationshipIds);
    if (relErr) throw relErr;
    const relById = new Map((relationships as RelationshipRow[] | null ?? []).map((r) => [r.id, r] as const));

    const buyerCards = cardRows.filter((c) => {
      const rel = relById.get(c.relationship_id);
      if (!rel) return false;
      const buyer = buyerCompanyId(
        { deal_type: c.deal_type as DealType, initiating_company_id: c.initiating_company_id },
        rel.company_a_id,
        rel.company_b_id,
      );
      return buyer === callerCompanyId;
    });

    if (buyerCards.length > 0) {
      const supplierIdByCard = new Map(
        buyerCards.map((c) => {
          const rel = relById.get(c.relationship_id)!;
          const supplierId = rel.company_a_id === callerCompanyId ? rel.company_b_id : rel.company_a_id;
          return [c.id, supplierId] as const;
        }),
      );
      const supplierCompanyIds = Array.from(new Set(supplierIdByCard.values()));
      const { data: companies, error: coErr } = await supabase
        .from("company")
        .select("id, name")
        .in("id", supplierCompanyIds);
      if (coErr) throw coErr;
      const nameById = new Map((companies ?? []).map((c) => [c.id, c.name] as const));
      const versionByCard = new Map(buyerCards.map((c) => [c.id, c.version] as const));
      // dealDate: real per-card date (18-14 fix) — delivery_date_target when
      // set, else the card's created_at (both are honest "when this deal
      // happened" candidates; created_at is NOT NULL so this always resolves).
      const dateByCard = new Map(
        buyerCards.map((c) => [c.id, c.delivery_date_target ?? c.created_at] as const),
      );

      const cardIds = buyerCards.map((c) => c.id);
      const { data: lineRows, error: lineErr } = await supabase
        .from("deal_line_item")
        .select("deal_card_id, version, product_id, product_name, quantity, unit, unit_price, line_total")
        .in("deal_card_id", cardIds);
      if (lineErr) throw lineErr;

      const currentLineRows = (lineRows ?? []).filter((l) => l.version === versionByCard.get(l.deal_card_id));

      // Batch-fetch product.pack_size_grams for every distinct non-null
      // product_id among this buyer's deal lines (18-14 fix) — mirrors this
      // file's existing company/relationship batch-fetch style. CSV-only
      // lines never have a product_id, so they honestly have no pack size.
      const productIds = Array.from(
        new Set(currentLineRows.map((l) => l.product_id).filter((id): id is string => id != null)),
      );
      const packSizeByProductId = new Map<string, number | null>();
      if (productIds.length > 0) {
        const { data: products, error: productErr } = await supabase
          .from("product")
          .select("id, pack_size_grams")
          .in("id", productIds);
        if (productErr) throw productErr;
        for (const p of products ?? []) packSizeByProductId.set(p.id, p.pack_size_grams);
      }

      dealLines = currentLineRows.map((l) => ({
        source: "deal" as const,
        supplierName: nameById.get(supplierIdByCard.get(l.deal_card_id) ?? "") ?? "Unknown company",
        productName: l.product_name,
        productId: l.product_id,
        grams: lineGrams(Number(l.quantity), l.unit as string),
        spend: lineTotalOf(Number(l.quantity), Number(l.unit_price), l.line_total),
        date: dateByCard.get(l.deal_card_id) ?? new Date(0).toISOString(),
        packSizeGrams: l.product_id != null ? (packSizeByProductId.get(l.product_id) ?? null) : null,
      }));
    }
  }

  // 2. CSV-imported purchase_history rows for the caller's company (RLS
  // already scopes it; the .eq below is defense-in-depth, same discipline as
  // partners.ts's T-18-10 note). `purchase_date` is selected for the 18-14
  // fix — CSV lines have no product_id, so they honestly have no pack size.
  const { data: csvRows, error: csvErr } = await supabase
    .from("purchase_history_import")
    .select("supplier_name, product_name, quantity, unit, unit_price, purchase_date")
    .eq("buyer_company_id", callerCompanyId);
  if (csvErr) throw csvErr;

  const csvLines: AnalyticsSourceLine[] = (csvRows ?? []).map((r) => ({
    source: "csv" as const,
    supplierName: r.supplier_name,
    productName: r.product_name,
    productId: null,
    grams: lineGrams(Number(r.quantity), r.unit),
    spend: Number(r.quantity) * Number(r.unit_price),
    date: r.purchase_date,
    // CSV-imported rows never carry a real catalogue product_id, so a
    // pack size is honestly unknown — not fabricated (18-14 fix).
    packSizeGrams: null,
  }));

  const allLines = [...dealLines, ...csvLines];

  // Distinct-product pack size, keyed the same way mergeAnalyticsLines()
  // keys its groups — first non-null packSizeGrams for a (supplier, product)
  // pair wins, mirroring that module's productId-identity rule (18-14 fix).
  // Kept OUTSIDE mergeAnalyticsLines() itself so that module's tested
  // contract stays untouched.
  const packSizeByKey = new Map<string, number | null>();
  for (const line of allLines) {
    const key = `${line.supplierName}\0${line.productName}`;
    const existing = packSizeByKey.get(key);
    if (existing == null && line.packSizeGrams != null) {
      packSizeByKey.set(key, line.packSizeGrams);
    } else if (!packSizeByKey.has(key)) {
      packSizeByKey.set(key, null);
    }
  }

  // 3. Layer both sources into one (supplierName, productName)-keyed list —
  // delegated to mergeAnalyticsLines(), never re-implemented inline here.
  const merged: MergedAnalyticsLine[] = mergeAnalyticsLines(allLines);
  if (merged.length === 0) return { suppliers: [], totalRevenue: 0, lines: [] };

  // 4a. buyer_resale_price lookup — exact (buyer_company_id, supplier_name,
  // product_name) match, the schema's own dedup key (plan 18-05).
  const { data: resaleRows, error: resaleErr } = await supabase
    .from("buyer_resale_price")
    .select("supplier_name, product_name, net, gross")
    .eq("buyer_company_id", callerCompanyId);
  if (resaleErr) throw resaleErr;
  const resaleByKey = new Map(
    (resaleRows ?? []).map((r) => [`${r.supplier_name}\0${r.product_name}`, r] as const),
  );

  // Raw per-line array for the chart's time-bucketing (18-14 fix) — each line
  // resolves its own (supplier, product) net/gross via the SAME resaleByKey
  // lookup `priced` below uses, never a second re-derivation.
  const pricedLines: PricedAnalyticsSourceLine[] = allLines.map((line) => {
    const resale = resaleByKey.get(`${line.supplierName}\0${line.productName}`);
    return {
      ...line,
      // Both always set by the dealLines/csvLines construction above — the
      // `?? ` fallbacks here only satisfy AnalyticsSourceLine's optional
      // typing (kept optional for analyticsMerge.test.ts's pre-existing
      // fixtures), never a real runtime gap.
      date: line.date ?? new Date(0).toISOString(),
      packSizeGrams: line.packSizeGrams ?? null,
      net: resale?.net ?? null,
      gross: resale?.gross ?? null,
    };
  });

  // 4b. wap/db1/margin per merged (supplier, product) line — all math
  // delegated to lib/money.ts, never re-derived inline here.
  const priced = merged.map((m) => {
    const wap = weightedAveragePrice(m.totalSpend, m.totalGrams);
    const resale = resaleByKey.get(`${m.supplierName}\0${m.productName}`);
    const net = resale?.net ?? null;
    const gross = resale?.gross ?? null;
    const revenue = net != null ? net * m.totalGrams : null;
    const productDb1Total = db1Total(net, wap, m.totalGrams);
    const productDb1PerUnit = db1PerUnit(net, wap);
    const productMargin = revenue != null ? marginPercent(productDb1Total, revenue) : null;
    return { m, wap, net, gross, revenue, db1Total: productDb1Total, db1PerUnit: productDb1PerUnit, margin: productMargin };
  });

  // Grand total revenue across ALL suppliers (unpriced products contribute 0,
  // never null/NaN — this is the share denominator, always a plain number).
  const totalRevenue = priced.reduce((sum, p) => sum + (p.revenue ?? 0), 0);
  const shareOf = (revenue: number | null): number =>
    totalRevenue === 0 || revenue == null ? 0 : revenue / totalRevenue;

  // 5+6. Wrap each merged line in its degenerate single-item category, group
  // by supplier, attach connected/relationshipId via getBuyPartners() (18-06)
  // — never re-derived here.
  const partners = (await getBuyPartners()) as BuyPartnerLike[];
  const partnerByName = new Map(partners.map((p) => [p.name, p] as const));

  const bySupplier = new Map<string, typeof priced>();
  for (const p of priced) {
    const bucket = bySupplier.get(p.m.supplierName) ?? [];
    bucket.push(p);
    bySupplier.set(p.m.supplierName, bucket);
  }

  const suppliers: AnalyticsSupplierRow[] = Array.from(bySupplier.entries()).map(([supplierName, rows]) => {
    const categories: AnalyticsCategoryRow[] = rows.map((p) => {
      const product: AnalyticsProductRow = {
        productId: p.m.productId,
        productName: p.m.productName,
        qty: p.m.totalGrams,
        wap: p.wap,
        net: p.net,
        gross: p.gross,
        revenue: p.revenue,
        db1Total: p.db1Total,
        db1PerUnit: p.db1PerUnit,
        marginPercent: p.margin,
        share: shareOf(p.revenue),
        packSizeGrams: packSizeByKey.get(`${p.m.supplierName}\0${p.m.productName}`) ?? null,
      };
      return {
        categoryId: p.m.productId ?? p.m.productName,
        categoryName: p.m.productName,
        products: [product],
        qty: product.qty,
        wap: product.wap,
        revenue: product.revenue,
        db1Total: product.db1Total,
        marginPercent: product.marginPercent,
        share: product.share,
      };
    });

    const supplierQty = categories.reduce((sum, c) => sum + c.qty, 0);
    const supplierSpend = rows.reduce((sum, p) => sum + p.m.totalSpend, 0);
    const anyPriced = categories.some((c) => c.revenue != null);
    const supplierRevenue = anyPriced ? categories.reduce((sum, c) => sum + (c.revenue ?? 0), 0) : null;
    const supplierDb1Total = anyPriced ? categories.reduce((sum, c) => sum + (c.db1Total ?? 0), 0) : null;
    const supplierWap = weightedAveragePrice(supplierSpend, supplierQty);
    const supplierMargin = marginPercent(supplierDb1Total, supplierRevenue ?? 0);

    const partner = partnerByName.get(supplierName);

    return {
      supplierKey: partner?.key ?? supplierName,
      supplierName,
      connected: partner?.connected ?? false,
      relationshipId: partner?.relationshipId ?? null,
      categories,
      qty: supplierQty,
      wap: supplierWap,
      revenue: supplierRevenue,
      db1Total: supplierDb1Total,
      marginPercent: supplierMargin,
      share: shareOf(supplierRevenue),
    };
  });

  return { suppliers, totalRevenue, lines: pricedLines };
}
