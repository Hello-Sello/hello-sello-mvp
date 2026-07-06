/**
 * Pure helpers for the shop's warehouse/location list (Phase 7 Round 2, F-07 /
 * Cluster H). A LIGHTWEIGHT, explicitly partial pull-forward of locked decision
 * D-05 — NOT the full Phase-16 shop≡location model (no address validation, no new
 * schema table, no Ayush order-doc wiring).
 *
 * Turns the single-line `company.warehouse_location` column into a small named
 * list — Headquarter (unchanged elsewhere, read-only) + Warehouse 1/2/3 (add/
 * remove) — stored as free text in `company.metadata.locations`, mirroring the
 * EXACT `metadata.links` pattern (parseLinks in manage.ts / shop.ts): validate on
 * both read and write, drop anything malformed rather than trusting the payload.
 *
 * Kept separate from shop.ts / manage.ts so the seed rule is unit-testable with no
 * DB (mirrors shopMap.ts / shopMap.test.ts).
 */

export type WarehouseLocation = { label: string; value: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Validate a client/DB-supplied locations array into a clean list. Drops any
 *  entry that isn't a `{label, value}` pair of non-empty (post-trim) strings —
 *  mirrors parseLinks's "drop malformed entries" contract exactly. */
export function validateLocations(raw: unknown): WarehouseLocation[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((l) => {
    if (!isRecord(l)) return [];
    const { label, value } = l;
    if (typeof label !== "string" || typeof value !== "string") return [];
    const trimmedLabel = label.trim();
    const trimmedValue = value.trim();
    if (!trimmedLabel || !trimmedValue) return [];
    return [{ label: trimmedLabel, value: trimmedValue }];
  });
}

/** The initial warehouse list a shop reads: `metadata.locations` wins whenever it
 *  carries any (already-validated) rows. Otherwise, if the legacy single-line
 *  `company.warehouse_location` column has a value, seed ONE row ("Warehouse 1")
 *  from it — so no seller's existing text is silently dropped the first time this
 *  ships. Both empty/absent → no rows (Headquarter is a separate, always-on
 *  display and is never affected by this list being empty). */
export function deriveInitialLocations(
  metadata: unknown,
  legacyWarehouseLocation: string | null,
): WarehouseLocation[] {
  const raw = isRecord(metadata) ? metadata.locations : undefined;
  const stored = validateLocations(raw);
  if (stored.length > 0) return stored;
  const legacy = legacyWarehouseLocation?.trim();
  return legacy ? [{ label: "Warehouse 1", value: legacy }] : [];
}

/** Re-sequence labels to "Warehouse 1..N" by position. The editor calls this on
 *  every add/remove so a stored label never drifts out of sync with its row
 *  index (e.g. removing row 1 turns the old "Warehouse 2" into "Warehouse 1"). */
export function renumberLocations(locations: WarehouseLocation[]): WarehouseLocation[] {
  return locations.map((l, i) => ({ label: `Warehouse ${i + 1}`, value: l.value }));
}
