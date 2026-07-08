/**
 * Buy — open/terminal deal classification (18-03 Task 1, pure derivation).
 *
 * Mirrors the DB's own `deal_card_status.is_terminal` values exactly
 * (`supabase/migrations/20260607090001_lookups_and_seeds.sql` lines ~354-366 +
 * `20260707140100_lifecycle_status_codes.sql`) so the KPI strip's "Open deals"
 * count can never re-implement, and so silently drift from, the DB's own
 * terminal-state definition. If `deal_card_status.is_terminal` ever changes for
 * any code, update the `TERMINAL_STATUSES` set below to match — this file and
 * the migration are grep-linked by this comment, not by a shared constant.
 */
import type { DealCardStatus } from "@/modules/deals";

const TERMINAL_STATUSES = new Set<DealCardStatus>(["done", "withdrawn", "cancelled"]);

/** True for every DealCardStatus NOT in the DB's terminal set (open deals). */
export function isOpenDeal(status: DealCardStatus): boolean {
  return !TERMINAL_STATUSES.has(status);
}
