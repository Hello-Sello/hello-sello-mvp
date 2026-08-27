import { execFileSync } from "node:child_process";

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function psqlBin(): string {
  const candidates = ["psql", "/Applications/Postgres.app/Contents/Versions/latest/bin/psql"];
  for (const bin of candidates) {
    try { execFileSync(bin, ["--version"], { stdio: "ignore" }); return bin; }
    catch { /* try next */ }
  }
  throw new Error("psql not found on PATH or in Postgres.app");
}

/** Single-value query helper — one row, one column, `-At` (no header/border). */
export function psqlValue(sql: string): string {
  return execFileSync(psqlBin(), [DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

/** Run a statement for its side effect. `ON_ERROR_STOP=1` (B7) makes psql exit non-zero
 * on a SQL error instead of printing it and continuing — execFileSync then throws. */
export function psqlExec(sql: string): void {
  execFileSync(psqlBin(), [DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { encoding: "utf8" });
}

/** Resolve a product's real id by its CURRENT name (unique among non-deleted rows for
 * a company). Throws on zero or ambiguous matches, named by the query that failed. */
export function resolveProductId(companyId: string, currentName: string): string {
  const row = psqlValue(
    `select id from product where company_id = '${companyId}' ` +
      `and name = '${currentName.replace(/'/g, "''")}' and deleted_at is null`,
  );
  if (!row) throw new Error(`resolveProductId: no product named "${currentName}" for company ${companyId}`);
  if (row.includes("\n")) throw new Error(`resolveProductId: ambiguous name "${currentName}" matched >1 row`);
  return row;
}
