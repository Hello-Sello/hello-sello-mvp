/**
 * Read-scoped grep-guard (0021, T03 · ADR-0004 §4): every price READ in
 * `src/**` must go through the single owner `src/modules/catalog/pricelist.ts`
 * (the `current_pricelist_item` view). Two banned forms:
 *
 *   1. the PostgREST embed `pricelist_item(...)` inside a select literal, and
 *   2. a direct `.from("pricelist_item")...select(` table read.
 *
 * WRITES stay legal — `.update(`/`.insert(` without a nearby `.select(` don't
 * match; manage.ts's update/insert are the sanctioned write sites. The guard is
 * deliberately dumb and loud: a comment that trips it gets reworded, the guard
 * doesn't get smarter.
 *
 * RED today: shop.ts, manage.ts, deals/supabase/reads.ts and
 * basket/supabase/reads.ts still hit `pricelist_item` directly — T03's reader
 * migration turns this green.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// vitest runs from the repo root (vitest.config.ts lives there).
const repoRoot = process.cwd();
const srcRoot = join(repoRoot, "src");

const EXCLUDED_FILES = new Set([
  join(srcRoot, "types", "database.types.ts"), // generated
  join(srcRoot, "modules", "catalog", "pricelist.ts"), // the single owner
]);

/** Banned form 1: the PostgREST embed, checked per line. */
const EMBED_PATTERN = /pricelist_item\s*\(/;

/** Banned form 2: a direct table READ — `.from("pricelist_item")` with a
 *  `.select(` within the next 80 chars. The lazy window keeps writes
 *  (`.update(`/`.insert(`) from matching a distant, unrelated select. */
const TABLE_READ_PATTERN =
  /\.from\(\s*["']pricelist_item["']\s*\)[\s\S]{0,80}?\.select\(/;

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (full.includes(".test.")) continue;
    if (EXCLUDED_FILES.has(full)) continue;
    files.push(full);
  }
  return files;
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function findViolations(): string[] {
  const violations: string[] = [];
  for (const file of collectSourceFiles(srcRoot)) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    const rel = relative(repoRoot, file);

    lines.forEach((line, i) => {
      if (EMBED_PATTERN.test(line)) {
        violations.push(`${rel}:${i + 1}  ${line.trim()}`);
      }
    });

    const tableRead = new RegExp(TABLE_READ_PATTERN.source, "g");
    for (const match of content.matchAll(tableRead)) {
      const line = lineOf(content, match.index ?? 0);
      violations.push(`${rel}:${line}  ${lines[line - 1].trim()}`);
    }
  }
  return violations;
}

describe("pricelist_item read guard — single owner (ADR-0004 §4)", () => {
  it("sanity: the walk starts at the real src tree", () => {
    expect(existsSync(join(srcRoot, "modules", "catalog"))).toBe(true);
  });

  it("no file outside catalog/pricelist.ts reads pricelist_item", () => {
    const violations = findViolations();
    expect(
      violations,
      "pricelist_item is read outside its single owner " +
        "(src/modules/catalog/pricelist.ts). Route these through " +
        "readCurrentPrices/lookupStandardPriceRow (or reword the comment):\n" +
        violations.join("\n"),
    ).toEqual([]);
  });
});

describe("guard self-test — the regexes match the banned forms", () => {
  it("embed pattern matches a PostgREST embed", () => {
    expect(EMBED_PATTERN.test("pricelist_item(price_per_gram)")).toBe(true);
  });

  it("table-read pattern matches a direct .from().select() read", () => {
    expect(
      TABLE_READ_PATTERN.test('.from("pricelist_item")\n  .select("id")'),
    ).toBe(true);
  });

  it("table-read pattern does NOT match a write without a select", () => {
    expect(
      TABLE_READ_PATTERN.test('.from("pricelist_item").update({ x: 1 })'),
    ).toBe(false);
  });
});
