# Product Basket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real, persistent, per-person Product Basket ("the cart") that a seller fills from their own shop and a buyer fills from connected companies' shops, grouped by seller company, that on Send hands each seller-group to the existing `createDeal()` to become a Deal Card.

**Architecture:** A new isolated module `src/modules/basket/` owns the cart (a `product_basket_line` table, its reads/writes, pure helpers, and UI). It depends on the deals domain through exactly ONE public seam — importing `createDeal` and its types from `@/modules/deals`. The buyer's cross-company shop view reuses the existing `ShopView` + `ProductCard`, fed by a new SECURITY DEFINER RPC (`get_connected_shop`) because base RLS forbids reading another company's `product` rows directly. ⛔ **This last sentence is DEAD as of 2026-08-19** — the buyer shop view is slug `0022-buyer-shop-view` and widens the *existing* shop read path rather than adding a second RPC. See the banner above Task 9.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Supabase (Postgres + RLS + SECURITY DEFINER RPCs), TypeScript, Vitest (unit), Playwright (E2E), Tailwind v4, lucide-react icons.

## Global Constraints

- **Vocabulary (docs/architecture/CONTEXT.md):** Product Basket = the persistent cart (nickname "the cart"). Deal Basket = the transient package built only at Send. Deal Card = Ayush's object born by `createDeal`. Never conflate these names in code, comments, or UI copy.
- **Module boundary:** `src/modules/basket/` reaches the deals domain ONLY via `@/modules/deals` barrel imports (`createDeal`, `CreateDealInput`, `DraftLineInput`, `DealSource`, `CreateDealResult`). It NEVER selects/inserts `deal_card` / `deal_line_item` / `deal_workspace` directly.
- **Additive migrations only:** no `ALTER`/`DROP` of existing columns, no changes to existing RLS policies, no touch to `deal_type` / `deal_card_status` lookups. New tables/RPCs only. Migration filenames use the next free `YYYYMMDDHHMMSS_` slot after `20260707090000`.
- **Pack rule (CONTEXT.md "Pack (basket quantity)"):** a basket line stores `pack_count` + `pack_size_grams`; grams = `pack_count * pack_size_grams`, computed only at Send. Money math stays per-gram — never store grams in the basket.
- **RLS discipline:** the basket table is owner-scoped (`owner_person_id = auth.uid()`). Cross-company product reads go through a SECURITY DEFINER RPC gated on an accepted relationship — never a widened base policy.
- **Shared-file sync ritual:** before editing anything under `src/modules/deals/` (a file Ayush also owns), run the `docs/team/sync/muskan.md` lock ritual (commit+push the lock alone, edit, commit+push the unlock alone). See CLAUDE.md "Before editing a shared file".
- **Gate before "done":** `npm run test:unit` green, `npx tsc --noEmit` clean, `npm run lint` clean. Verify DB changes with `supabase db reset` + a probe query. Regenerate `src/types/database.types.ts` after any migration.
- **Local env:** `.env.local` points LOCAL; the shared local Supabase DB is `db reset` across worktrees — run `supabase db reset` before manual verification.

---

## Critical-path note (read before starting)

Tasks 1–8 (schema, basket data layer, deals seam, send flow, seller UI, TopBar, drawer) form a **complete, demoable seller-side slice** on their own: a seller fills their cart from their own Present shop and sends offers. Tasks 9–11 add the **buyer side** (the expensive `get_connected_shop` RPC + the connected-shop route). If demo time runs short, stop after Task 8 — it is a coherent shippable unit.

---

## File Structure

**New module `src/modules/basket/`:**
- `types.ts` — `BasketLine`, `BasketGroup`, `BasketView`, `SendGroupInput`.
- `lib/pack.ts` — pure `toGrams(packCount, packSizeGrams)`.
- `lib/pack.test.ts` — unit.
- `lib/group.ts` — pure `groupBySeller(lines)`.
- `lib/group.test.ts` — unit.
- `lib/toDraftLines.ts` — pure `toDraftLines(group)` → `DraftLineInput[]`.
- `lib/toDraftLines.test.ts` — unit.
- `supabase/reads.ts` — `getMyBasket()`.
- `supabase/writes.ts` — `addToBasket`, `updateBasketLinePackCount`, `removeBasketLine`.
- `actions.ts` — `sendBasketGroup` (server action; calls `createDeal`).
- `BasketProvider.tsx` — client context (lines + count + refresh).
- `components/BasketDrawer.tsx` — the grouped drawer + Send + recipient picker.
- `components/RecipientPicker.tsx` — connected-company/person picker (own-company Send only).
- `index.ts` — module barrel.

**New migrations `supabase/migrations/`:**
- `<ts>_product_basket_line.sql` — the table + RLS.
- `<ts>_get_connected_shop.sql` — the buyer read RPC (Task 9).

**Modified:**
- `src/modules/deals/types.ts` — `CreateDealInput` gains `dealType?`, `counterpartyPersonId?` (sync ritual).
- `src/modules/deals/actions.ts` — `createDeal` threads the two new fields (sync ritual).
- `src/modules/catalog/shop.ts` — add `getConnectedShop(companyId)` (Task 10).
- `src/app/present/ShopView.tsx` — add `viewerCanManage?: boolean` + wire `onAddToBasket` (Tasks 7, 11).
- `src/shared/ui/TopBar.tsx` — basket icon + badge (Task 6).
- `src/shared/ui/AppShell.tsx` — mount `BasketProvider` (Task 6).
- `src/app/discover/[companyId]/shop/page.tsx` — new connected-shop route (Task 11).

---

## Task 1: Basket table + RLS migration

**Files:**
- Create: `supabase/migrations/<ts>_product_basket_line.sql`
- Regenerate: `src/types/database.types.ts`

**Interfaces:**
- Produces: table `public.product_basket_line (id, owner_person_id, product_id, pack_count, pack_size_grams, created_at, updated_at)`, unique `(owner_person_id, product_id)`, RLS policy `basket_line_owner_all` (owner = `auth.uid()`).

- [ ] **Step 1: Find the next free migration timestamp**

Run: `ls supabase/migrations/ | tail -3`
Pick a `YYYYMMDDHHMMSS` strictly greater than the latest shown (e.g. `20260707100000`). Use it for `<ts>` below.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/<ts>_product_basket_line.sql`:

```sql
-- ============================================================================
-- Migration — Product Basket (persistent per-person cart, DECISIONS 2026-06-29)
-- ----------------------------------------------------------------------------
-- Additive-only. One new table + its owner-scoped RLS. No touch to deal_card /
-- deal_line_item / any existing policy. The cart is the "Product Basket" layer
-- (CONTEXT.md): products a person has added, grouped-by-seller at read time via
-- product.company_id. It stores pack_count + pack_size_grams (never grams) — the
-- "Pack (basket quantity)" rule — and grams are computed only at Send.
-- ============================================================================

create table public.product_basket_line (
  id              uuid primary key default gen_random_uuid(),
  owner_person_id uuid not null references public.person(id) on delete cascade,
  product_id      uuid not null references public.product(id) on delete cascade,
  pack_count      numeric not null default 1,
  pack_size_grams numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_person_id, product_id)
);

alter table public.product_basket_line enable row level security;

-- Owner-only: a person reads/writes ONLY their own cart lines. auth.uid() is the
-- person id (person.id == auth.users.id on this platform).
create policy basket_line_owner_all on public.product_basket_line
  for all
  to authenticated
  using (owner_person_id = auth.uid())
  with check (owner_person_id = auth.uid());
```

- [ ] **Step 3: Apply and verify the schema**

Run: `supabase db reset`
Expected: completes with no error; the new migration is listed in the applied set.

- [ ] **Step 4: Probe the RLS (deny cross-person, allow own)**

Run:
```bash
supabase db reset >/dev/null 2>&1
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c "\d public.product_basket_line"
```
Expected: the table prints with columns `owner_person_id`, `product_id`, `pack_count`, `pack_size_grams` and a unique constraint on `(owner_person_id, product_id)`. (Full allow/deny RLS behaviour is exercised end-to-end in Task 4's browser check and Task 12's manual pass.)

- [ ] **Step 5: Regenerate types**

Run: `supabase gen types typescript --local > src/types/database.types.ts`
Expected: `product_basket_line` now appears under `Database["public"]["Tables"]`. Confirm with:
`grep -n "product_basket_line" src/types/database.types.ts` → non-empty.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/<ts>_product_basket_line.sql src/types/database.types.ts
git commit -m "feat(basket): product_basket_line table + owner-only RLS"
```

---

## Task 2: Pure pack→grams helper

**Files:**
- Create: `src/modules/basket/lib/pack.ts`
- Test: `src/modules/basket/lib/pack.test.ts`

**Interfaces:**
- Produces: `toGrams(packCount: number, packSizeGrams: number | null): number | null` — `null` when `packSizeGrams` is null (unknown pack size → no gram figure); else `packCount * packSizeGrams`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/basket/lib/pack.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toGrams } from "./pack";

describe("toGrams (Pack rule — grams computed only at Send)", () => {
  it("multiplies pack count by pack size", () => {
    expect(toGrams(3, 50)).toBe(150);
  });

  it("returns null when the pack size is unknown", () => {
    expect(toGrams(3, null)).toBeNull();
  });

  it("handles a single pack", () => {
    expect(toGrams(1, 1000)).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/modules/basket/lib/pack.test.ts`
Expected: FAIL — `Cannot find module './pack'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/modules/basket/lib/pack.ts`:

```ts
/**
 * The Pack rule (CONTEXT.md "Pack (basket quantity)"): a basket line stores a
 * pack COUNT and a snapshot of the chosen pack SIZE; grams are derived only when
 * a Deal Basket is built at Send. Null pack size → no gram figure (the caller
 * sends the line without a resolved quantity-in-grams).
 */
export function toGrams(packCount: number, packSizeGrams: number | null): number | null {
  if (packSizeGrams == null) return null;
  return packCount * packSizeGrams;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/modules/basket/lib/pack.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/modules/basket/lib/pack.ts src/modules/basket/lib/pack.test.ts
git commit -m "feat(basket): pure toGrams pack→grams helper"
```

---

## Task 3: Pure group-by-seller helper

**Files:**
- Create: `src/modules/basket/types.ts`
- Create: `src/modules/basket/lib/group.ts`
- Test: `src/modules/basket/lib/group.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `types.ts`:
    ```ts
    export interface BasketLine {
      id: string;
      productId: string;
      productName: string;
      cultivar: string | null;
      unit: string;              // 'g' etc. — from product.unit_code, default 'g'
      packCount: number;
      packSizeGrams: number | null;
      pricePerGram: number | null;
      currency: string;
      pzn: string | null;
      sellerCompanyId: string;
      sellerCompanyName: string;
    }
    export interface BasketGroup {
      sellerCompanyId: string;
      sellerCompanyName: string;
      isOwnCompany: boolean;     // true → seller offering own products; needs a recipient picker
      relationshipId: string | null; // resolved for other-company groups; null for own-company
      lines: BasketLine[];
    }
    export interface BasketView {
      groups: BasketGroup[];
      totalLineCount: number;
    }
    ```
  - `group.ts`: `groupBySeller(lines: BasketLine[], viewerCompanyId: string, relationshipIdByCompany: Map<string, string>): BasketGroup[]` — groups by `sellerCompanyId`, sets `isOwnCompany = sellerCompanyId === viewerCompanyId`, `relationshipId` from the map (null for the own-company group), stable order by first-seen.

- [ ] **Step 1: Write the types file**

Create `src/modules/basket/types.ts` with the `BasketLine` / `BasketGroup` / `BasketView` interfaces exactly as in the Interfaces block above, plus:

```ts
/** Input to sendBasketGroup — the recipient chosen for ONE seller-group. */
export interface SendGroupInput {
  sellerCompanyId: string;
  relationshipId: string;
  /** the chosen person on the other side (own-company offer path); null → company-addressed */
  counterpartyPersonId: string | null;
  note: string | null;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/modules/basket/lib/group.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupBySeller } from "./group";
import type { BasketLine } from "../types";

function line(id: string, sellerId: string, sellerName: string): BasketLine {
  return {
    id, productId: `p-${id}`, productName: `Product ${id}`, cultivar: null,
    unit: "g", packCount: 1, packSizeGrams: 50, pricePerGram: 4.5, currency: "EUR",
    pzn: null, sellerCompanyId: sellerId, sellerCompanyName: sellerName,
  };
}

describe("groupBySeller", () => {
  it("groups lines by seller company, first-seen order", () => {
    const lines = [line("1", "co-a", "Alpha"), line("2", "co-b", "Beta"), line("3", "co-a", "Alpha")];
    const groups = groupBySeller(lines, "me", new Map([["co-a", "rel-a"], ["co-b", "rel-b"]]));
    expect(groups.map((g) => g.sellerCompanyId)).toEqual(["co-a", "co-b"]);
    expect(groups[0].lines).toHaveLength(2);
    expect(groups[1].lines).toHaveLength(1);
  });

  it("flags the viewer's own company group and gives it no relationship", () => {
    const lines = [line("1", "me", "My Co")];
    const groups = groupBySeller(lines, "me", new Map());
    expect(groups[0].isOwnCompany).toBe(true);
    expect(groups[0].relationshipId).toBeNull();
  });

  it("attaches the relationship id for another company's group", () => {
    const lines = [line("1", "co-a", "Alpha")];
    const groups = groupBySeller(lines, "me", new Map([["co-a", "rel-a"]]));
    expect(groups[0].isOwnCompany).toBe(false);
    expect(groups[0].relationshipId).toBe("rel-a");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:unit -- src/modules/basket/lib/group.test.ts`
Expected: FAIL — `Cannot find module './group'`.

- [ ] **Step 4: Write minimal implementation**

Create `src/modules/basket/lib/group.ts`:

```ts
import type { BasketLine, BasketGroup } from "../types";

/**
 * Group cart lines by their seller company (the product's owner). The viewer's
 * OWN company group is flagged `isOwnCompany` and carries no relationship (a
 * seller offering their own products picks a recipient at Send); every other
 * group carries the relationship that lets its offer become a Deal Card. Order
 * is first-seen so the drawer is stable across refetches.
 */
export function groupBySeller(
  lines: BasketLine[],
  viewerCompanyId: string,
  relationshipIdByCompany: Map<string, string>,
): BasketGroup[] {
  const byCompany = new Map<string, BasketGroup>();
  for (const l of lines) {
    let g = byCompany.get(l.sellerCompanyId);
    if (!g) {
      const isOwnCompany = l.sellerCompanyId === viewerCompanyId;
      g = {
        sellerCompanyId: l.sellerCompanyId,
        sellerCompanyName: l.sellerCompanyName,
        isOwnCompany,
        relationshipId: isOwnCompany ? null : (relationshipIdByCompany.get(l.sellerCompanyId) ?? null),
        lines: [],
      };
      byCompany.set(l.sellerCompanyId, g);
    }
    g.lines.push(l);
  }
  return [...byCompany.values()];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit -- src/modules/basket/lib/group.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 6: Commit**

```bash
git add src/modules/basket/types.ts src/modules/basket/lib/group.ts src/modules/basket/lib/group.test.ts
git commit -m "feat(basket): BasketView types + pure groupBySeller"
```

---

## Task 4: Basket reads + writes (Supabase)

**Files:**
- Create: `src/modules/basket/supabase/writes.ts`
- Create: `src/modules/basket/supabase/reads.ts`

**Interfaces:**
- Consumes: `BasketLine`, `BasketView` from `../types`; `groupBySeller` from `../lib/group`.
- Produces:
  - `writes.ts`: `addToBasket(productId, packCount, packSizeGrams: number|null): Promise<void>` (upsert on `owner_person_id,product_id`), `updateBasketLinePackCount(lineId, packCount): Promise<void>`, `removeBasketLine(lineId): Promise<void>`.
  - `reads.ts`: `getMyBasket(): Promise<BasketView>`.

- [ ] **Step 1: Write the writes module**

Create `src/modules/basket/supabase/writes.ts`:

```ts
"use client";

/**
 * Product Basket writes — owner-scoped by RLS (basket_line_owner_all). The
 * browser client is enough: every row carries owner_person_id = auth.uid(), and
 * the policy rejects any other owner. Re-adding a product bumps its pack_count
 * (unique owner+product), never a duplicate row.
 */
import { createClient } from "@/shared/db/client";

async function ownerId(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("basket: no authenticated user");
  return user.id;
}

export async function addToBasket(
  productId: string,
  packCount: number,
  packSizeGrams: number | null,
): Promise<void> {
  const supabase = createClient();
  const owner = await ownerId();
  const { error } = await supabase
    .from("product_basket_line")
    .upsert(
      {
        owner_person_id: owner,
        product_id: productId,
        pack_count: packCount,
        pack_size_grams: packSizeGrams,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_person_id,product_id" },
    );
  if (error) throw error;
}

export async function updateBasketLinePackCount(lineId: string, packCount: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("product_basket_line")
    .update({ pack_count: packCount, updated_at: new Date().toISOString() })
    .eq("id", lineId);
  if (error) throw error;
}

export async function removeBasketLine(lineId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("product_basket_line").delete().eq("id", lineId);
  if (error) throw error;
}
```

- [ ] **Step 2: Write the reads module**

Create `src/modules/basket/supabase/reads.ts`:

```ts
"use client";

/**
 * Product Basket read — the whole cart, grouped by seller company. RLS returns
 * only the viewer's own lines; we join product (name, cultivar, unit, price) and
 * company (name) to build each group. The seller company is product.company_id.
 * The viewer's own company (from person) flags the own-company group; the
 * relationship map lets the drawer resolve where an other-company offer goes.
 */
import { createClient } from "@/shared/db/client";
import { groupBySeller } from "../lib/group";
import type { BasketLine, BasketView } from "../types";

export async function getMyBasket(): Promise<BasketView> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { groups: [], totalLineCount: 0 };

  const { data: viewerPerson } = await supabase
    .from("person").select("company_id").eq("id", user.id).single();
  const viewerCompanyId = viewerPerson?.company_id ?? "";

  // RLS-scoped: only my lines. Join the product + its owning company + list price.
  const { data: rows, error } = await supabase
    .from("product_basket_line")
    .select(
      "id, pack_count, pack_size_grams, " +
      "product:product_id(id, name, cultivar, unit_code, local_code_pzn, company_id, " +
      "company:company_id(id, name), pricelist_item(price_per_gram))",
    )
    .order("created_at", { ascending: true });
  if (error) throw error;

  const lines: BasketLine[] = (rows ?? []).map((r) => {
    // Supabase nests joined rows; the FK joins here are to-one.
    const p = r.product as unknown as {
      id: string; name: string; cultivar: string | null; unit_code: string | null;
      local_code_pzn: string | null; company_id: string;
      company: { id: string; name: string } | null;
      pricelist_item: { price_per_gram: number | null }[] | { price_per_gram: number | null } | null;
    };
    const price = Array.isArray(p.pricelist_item) ? p.pricelist_item[0] : p.pricelist_item;
    return {
      id: r.id,
      productId: p.id,
      productName: p.name,
      cultivar: p.cultivar,
      unit: p.unit_code ?? "g",
      packCount: Number(r.pack_count),
      packSizeGrams: r.pack_size_grams == null ? null : Number(r.pack_size_grams),
      pricePerGram: price?.price_per_gram ?? null,
      currency: "EUR",
      pzn: p.local_code_pzn,
      sellerCompanyId: p.company_id,
      sellerCompanyName: p.company?.name ?? "Unknown company",
    };
  });

  // relationship map: for every OTHER seller company in the cart, the relationship id.
  const otherCompanyIds = [...new Set(lines.map((l) => l.sellerCompanyId))]
    .filter((id) => id !== viewerCompanyId);
  const relByCompany = new Map<string, string>();
  if (otherCompanyIds.length) {
    const { data: rels } = await supabase
      .from("relationship")
      .select("id, company_a_id, company_b_id")
      .is("deleted_at", null);
    for (const rel of rels ?? []) {
      const other = rel.company_a_id === viewerCompanyId ? rel.company_b_id : rel.company_a_id;
      if (otherCompanyIds.includes(other)) relByCompany.set(other, rel.id);
    }
  }

  const groups = groupBySeller(lines, viewerCompanyId, relByCompany);
  return { groups, totalLineCount: lines.length };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `src/modules/basket/`.

- [ ] **Step 4: Manual verification (RLS + round-trip)**

Run: `supabase db reset` then `npm run dev`. In the browser devtools console on any authenticated page, seed a line and read it back:
```js
// with a real product id from your own shop:
await window.__basketTest?.(); // (skip — instead verify via Task 7's Add-to-basket once wired)
```
For now, verify the RLS deny path with a direct probe:
```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c \
"insert into product_basket_line (owner_person_id, product_id) values (gen_random_uuid(), (select id from product limit 1)); select count(*) from product_basket_line;"
```
Expected: the raw psql insert (superuser, RLS-bypassing) succeeds — confirming the table accepts rows; RLS owner-scoping is proven end-to-end in Task 12 (two-account manual pass).

- [ ] **Step 5: Commit**

```bash
git add src/modules/basket/supabase/
git commit -m "feat(basket): getMyBasket read + add/update/remove writes"
```

---

## Task 5: Extend `createDeal` for buyer orders + a chosen person (SHARED FILE — sync ritual first)

**Files:**
- Modify: `src/modules/deals/types.ts` (`CreateDealInput`)
- Modify: `src/modules/deals/actions.ts` (`createDeal`)
- Test: `src/modules/deals/lib/createDealArgs.test.ts` (new pure helper + its test)
- Create: `src/modules/deals/lib/createDealArgs.ts`

**Interfaces:**
- Consumes: existing `CreateDealInput`, `DraftLineInput`.
- Produces: `CreateDealInput` gains `dealType?: DealType` (default `"offer"`) and `counterpartyPersonId?: string | null`. New pure `createDealRpcArgs(input)` returns the `p_deal_type` + `p_counterparty_person_id` fields so the passthrough is unit-tested.

- [ ] **Step 1: Run the sync-lock ritual (SHARED FILE)**

```bash
git fetch origin && git pull origin claude/muskan/work --rebase
git show origin/claude/ayush/work:docs/team/sync/ayush.md   # confirm deals/ files NOT in his locked list
```
Then add `src/modules/deals/types.ts` + `src/modules/deals/actions.ts` to the `Shared files locked` list in `docs/team/sync/muskan.md`, bump `Last updated`, and:
```bash
git add docs/team/sync/muskan.md
git commit -m "chore(sync): lock deals/types+actions for basket dealType passthrough"
git push origin claude/muskan/work
```
Expected: Ayush's sync shows no lock on these files; your lock is pushed alone.

- [ ] **Step 2: Write the failing test for the pure args helper**

Create `src/modules/deals/lib/createDealArgs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createDealRpcArgs } from "./createDealArgs";

describe("createDealRpcArgs (dealType + counterparty passthrough)", () => {
  it("defaults dealType to offer and person to null", () => {
    const a = createDealRpcArgs({ relationshipId: "r", lines: [] });
    expect(a.p_deal_type).toBe("offer");
    expect(a.p_counterparty_person_id).toBeNull();
  });

  it("passes an explicit order dealType and a chosen person", () => {
    const a = createDealRpcArgs({
      relationshipId: "r", lines: [], dealType: "order", counterpartyPersonId: "person-1",
    });
    expect(a.p_deal_type).toBe("order");
    expect(a.p_counterparty_person_id).toBe("person-1");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:unit -- src/modules/deals/lib/createDealArgs.test.ts`
Expected: FAIL — `Cannot find module './createDealArgs'`.

- [ ] **Step 4: Add the two optional fields to `CreateDealInput`**

In `src/modules/deals/types.ts`, inside `interface CreateDealInput` (after the `note` field), add:

```ts
  /**
   * Who initiated the deal: 'offer' = seller-initiated (default, every existing
   * call site), 'order' = buyer-initiated (the Product Basket buyer path). Maps
   * to create_deal_draft's p_deal_type; sellerCompanyId()/viewerSide() already
   * resolve buyer-vs-seller correctly for 'order'.
   */
  dealType?: DealType;
  /**
   * The chosen counterparty person on the other side (Product Basket own-company
   * offer path). Threaded into create_deal_draft's existing p_counterparty_person_id
   * so the picked person becomes a day-one deal owner. Null → company-addressed.
   */
  counterpartyPersonId?: string | null;
```

Confirm `DealType` is already imported/defined in this file (it is — it's declared near the top).

- [ ] **Step 5: Write the pure args helper**

Create `src/modules/deals/lib/createDealArgs.ts`:

```ts
import type { CreateDealInput, DealType } from "../types";

/**
 * The two create_deal_draft args that the Product Basket paths vary: the deal
 * TYPE (offer default / order for a buyer) and the chosen counterparty PERSON.
 * Pure + unit-tested so the passthrough can't silently regress; the rest of the
 * RPC arg shape stays inline in createDeal.
 */
export function createDealRpcArgs(input: CreateDealInput): {
  p_deal_type: DealType;
  p_counterparty_person_id: string | null;
} {
  return {
    p_deal_type: input.dealType ?? "offer",
    p_counterparty_person_id: input.counterpartyPersonId ?? null,
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test:unit -- src/modules/deals/lib/createDealArgs.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 7: Thread the args into `createDeal`**

In `src/modules/deals/actions.ts`: add the import near the other lib imports:
```ts
import { createDealRpcArgs } from "./lib/createDealArgs";
```
Then in `createDeal`, replace the two hardcoded lines inside the `supabase.rpc("create_deal_draft" ...)` args object:
```ts
    p_deal_type: "offer",
```
and (the arg is currently absent) — set both from the helper. The args object becomes:
```ts
  const { p_deal_type, p_counterparty_person_id } = createDealRpcArgs(input);
  const { data: cardId, error } = await supabase.rpc("create_deal_draft" as never, {
    p_relationship_id: input.relationshipId,
    p_deal_type,
    p_value_net: sumValueNet(input.lines),
    p_currency: currency,
    p_due_date: input.dueDate ?? null,
    p_payment_terms_code: input.paymentTermsCode ?? null,
    p_free_delivery: input.freeDelivery ?? false,
    p_lines: rpcLines(input.lines),
    p_private_value: null,
    p_note: input.note ?? null,
    p_counterparty_person_id,
  } as never);
```
(Note: `create_deal_draft` already accepts `p_counterparty_person_id` as its trailing nullable arg — see `supabase/migrations/20260612011145_two_owner_create_deal_draft.sql`. Passing it does not change any existing caller because they omit `dealType`/`counterpartyPersonId`, so it resolves to `'offer'` + `null`.)

Also remove the now-dead comment lines that reference the old hardcoded `p_deal_type: "offer"` if present.

- [ ] **Step 8: Full gate on the shared change**

Run: `npm run test:unit && npx tsc --noEmit && npm run lint`
Expected: all green. Existing deals tests still pass (the change is additive + default-preserving).

- [ ] **Step 9: Commit and RELEASE the sync lock**

```bash
git add src/modules/deals/types.ts src/modules/deals/actions.ts src/modules/deals/lib/createDealArgs.ts src/modules/deals/lib/createDealArgs.test.ts
git commit -m "feat(deals): createDeal accepts dealType + counterpartyPersonId (default offer/null)"
git push origin claude/muskan/work
```
Then remove those two files from `Shared files locked` in `docs/team/sync/muskan.md`, bump the timestamp, and:
```bash
git add docs/team/sync/muskan.md
git commit -m "chore(sync): unlock deals/types+actions"
git push origin claude/muskan/work
```

---

## Task 6: BasketProvider + TopBar basket icon

**Files:**
- Create: `src/modules/basket/BasketProvider.tsx`
- Create: `src/modules/basket/index.ts`
- Modify: `src/shared/ui/AppShell.tsx`
- Modify: `src/shared/ui/TopBar.tsx`

**Interfaces:**
- Consumes: `getMyBasket` (`./supabase/reads`), `BasketView` (`./types`).
- Produces:
  - `useBasket(): { view: BasketView; refresh: () => Promise<void>; open: boolean; setOpen: (b: boolean) => void }` from `BasketProvider`.
  - barrel `index.ts` re-exports `BasketProvider`, `useBasket`, `BasketDrawer`, `addToBasket`, and all types.

- [ ] **Step 1: Write the provider**

Create `src/modules/basket/BasketProvider.tsx`:

```tsx
"use client";

import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { getMyBasket } from "./supabase/reads";
import type { BasketView } from "./types";

interface BasketCtx {
  view: BasketView;
  refresh: () => Promise<void>;
  open: boolean;
  setOpen: (b: boolean) => void;
}

const Ctx = createContext<BasketCtx | null>(null);

const EMPTY: BasketView = { groups: [], totalLineCount: 0 };

export function BasketProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<BasketView>(EMPTY);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setView(await getMyBasket());
    } catch {
      setView(EMPTY); // signed-out / no company → empty cart, never throws into the shell
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ view, refresh, open, setOpen }}>{children}</Ctx.Provider>;
}

export function useBasket(): BasketCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBasket must be used within BasketProvider");
  return c;
}
```

- [ ] **Step 2: Write the barrel**

Create `src/modules/basket/index.ts`:

```ts
export { BasketProvider, useBasket } from "./BasketProvider";
export { BasketDrawer } from "./components/BasketDrawer";
export { addToBasket, updateBasketLinePackCount, removeBasketLine } from "./supabase/writes";
export { getMyBasket } from "./supabase/reads";
export type { BasketLine, BasketGroup, BasketView, SendGroupInput } from "./types";
```

(Note: `BasketDrawer` is created in Task 8; this barrel line will fail to typecheck until then. Create a temporary stub now so the app builds: create `src/modules/basket/components/BasketDrawer.tsx` with `export function BasketDrawer() { return null; }` — Task 8 replaces it.)

- [ ] **Step 3: Mount the provider in AppShell**

In `src/shared/ui/AppShell.tsx`, wrap the non-bare shell return. Add the import:
```ts
import { BasketProvider } from "@/modules/basket";
import { BasketDrawer } from "@/modules/basket";
```
Change the non-bare return to:
```tsx
  return (
    <BasketProvider>
      <div className="flex h-full">
        <IconRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="min-h-0 flex-1 overflow-auto p-3">{children}</main>
        </div>
      </div>
      <BasketDrawer />
    </BasketProvider>
  );
```

- [ ] **Step 4: Add the basket icon to TopBar**

In `src/shared/ui/TopBar.tsx`: add imports:
```ts
import { ShoppingBag } from "lucide-react";
import { useBasket } from "@/modules/basket";
```
Inside `TopBar`, read the context:
```ts
  const { view, setOpen } = useBasket();
```
Then in the right cluster, immediately AFTER the notification `<button>` and before the company chip `<div>`, add:
```tsx
        <button
          type="button"
          aria-label="Basket"
          onClick={() => setOpen(true)}
          className="relative flex h-10 w-10 items-center justify-center rounded-xl text-ink/45 ring-1 ring-black/5 transition hover:bg-white/70 hover:text-brand motion-reduce:transition-none"
        >
          <ShoppingBag size={18} strokeWidth={1.75} />
          {view.totalLineCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {view.totalLineCount}
            </span>
          )}
        </button>
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean (with the BasketDrawer stub from Step 2).

- [ ] **Step 6: Verify the icon renders**

Run: `npm run dev`, open any authenticated page. Expected: a basket icon sits beside the bell; no badge when the cart is empty; clicking it does nothing visible yet (drawer is a stub).

- [ ] **Step 7: Commit**

```bash
git add src/modules/basket/BasketProvider.tsx src/modules/basket/index.ts src/modules/basket/components/BasketDrawer.tsx src/shared/ui/AppShell.tsx src/shared/ui/TopBar.tsx
git commit -m "feat(basket): BasketProvider + global TopBar basket icon with count"
```

---

## Task 7: Wire Add-to-basket on the seller's own Present shop

**Files:**
- Modify: `src/app/present/ShopView.tsx`

**Interfaces:**
- Consumes: `addToBasket`, `useBasket` (`@/modules/basket`); `packLabels`/pack-size mapping already inside `ProductCard`.
- Produces: `ProductCard`'s `onAddToBasket(productId, packCount, packIndex)` now persists a line + refreshes the cart. `ShopView` gains `viewerCanManage?: boolean` (default `true`) — Task 11 uses `false`.

- [ ] **Step 1: Add the prop + basket hook to ShopView**

In `src/app/present/ShopView.tsx`, change the signature:
```tsx
export function ShopView({ shop, canEditBranding = false, viewerCanManage = true }:
  { shop: Shop; canEditBranding?: boolean; viewerCanManage?: boolean }) {
```
Add near the other hooks:
```ts
  const { refresh: refreshBasket } = useBasket();
```
Add the imports:
```ts
import { addToBasket, useBasket } from "@/modules/basket";
```

- [ ] **Step 2: Compute the chosen pack size from the pack index**

`ProductCard`'s `onAddToBasket(p.id, qty, pack)` passes `pack` = the selected index into that product's pack labels. Resolve it to grams using the SAME `packLabels`-style set the card renders. In `ShopView`, add a handler:
```ts
  async function handleAddToBasket(productId: string, packCount: number, packIndex: number) {
    const product = shop.products.find((p) => p.id === productId);
    // The pack-size options are the product's own size plus its extra v0 sizes,
    // deduped + sorted ascending (mirrors ProductCard.packLabels ordering).
    const sizes = [...new Set([
      ...(product?.packSizes ?? []),
      ...(product?.pack_size_grams != null ? [product.pack_size_grams] : []),
    ])].sort((a, b) => a - b);
    const packSizeGrams = sizes[packIndex] ?? product?.pack_size_grams ?? null;
    await addToBasket(productId, packCount, packSizeGrams);
    await refreshBasket();
  }
```

- [ ] **Step 3: Pass the handler to ProductCard**

Find the `<ProductCard` render (~line 569) and add the prop (keep existing props):
```tsx
                onAddToBasket={handleAddToBasket}
```

- [ ] **Step 4: Gate owner chrome behind `viewerCanManage`**

Wherever ShopView renders the "Manage shop" entry, the SaveBar, the AddProductsDrawer trigger, the AssignProductsDialog trigger, and banner/logo edit affordances, guard each with `viewerCanManage &&`. (These are the controls that call `saveCompanyProfile` / product writers — a buyer must never see them.) Leave the product grid + info boxes rendering unconditionally. The `canEditBranding` gate stays nested inside `viewerCanManage`.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 6: Verify Add-to-basket persists (seller path)**

Run: `supabase db reset && npm run dev`. On `/present`, pick a product, set a pack size + quantity, click **Add to basket**. Expected: the TopBar badge increments; refresh the page → badge still shows the count (persisted). Confirm the row:
```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c "select product_id, pack_count, pack_size_grams from product_basket_line;"
```
Expected: one row with your product id + the pack size you chose.

- [ ] **Step 7: Commit**

```bash
git add src/app/present/ShopView.tsx
git commit -m "feat(basket): seller adds own products to the cart from Present; viewerCanManage gate"
```

---

## Task 8: BasketDrawer — grouped cart, steppers, note, Send (+ own-company recipient picker)

**Files:**
- Replace stub: `src/modules/basket/components/BasketDrawer.tsx`
- Create: `src/modules/basket/components/RecipientPicker.tsx`
- Create: `src/modules/basket/lib/toDraftLines.ts`
- Test: `src/modules/basket/lib/toDraftLines.test.ts`
- Create: `src/modules/basket/actions.ts`

**Interfaces:**
- Consumes: `useBasket`, `updateBasketLinePackCount`, `removeBasketLine` (`../` module); `getMyConnections` (`@/modules/messaging`); `createDeal` (`@/modules/deals`); `toGrams` (`../lib/pack`).
- Produces:
  - `toDraftLines(group: BasketGroup): DraftLineInput[]` — pure mapping (grams via `toGrams`, price passthrough).
  - `sendBasketGroup(group, input: SendGroupInput): Promise<CreateDealResult>` (server action).
  - `BasketDrawer()` component (reads context, renders groups, Send).
  - `RecipientPicker({ onPick })`.

- [ ] **Step 1: Write the failing test for `toDraftLines`**

Create `src/modules/basket/lib/toDraftLines.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toDraftLines } from "./toDraftLines";
import type { BasketGroup } from "../types";

const group: BasketGroup = {
  sellerCompanyId: "co-a", sellerCompanyName: "Alpha", isOwnCompany: false, relationshipId: "rel-a",
  lines: [
    { id: "1", productId: "p1", productName: "Amnesia", cultivar: "Sativa", unit: "g",
      packCount: 3, packSizeGrams: 50, pricePerGram: 4.5, currency: "EUR", pzn: "PZN1",
      sellerCompanyId: "co-a", sellerCompanyName: "Alpha" },
    { id: "2", productId: "p2", productName: "Custom", cultivar: null, unit: "g",
      packCount: 2, packSizeGrams: null, pricePerGram: null, currency: "EUR", pzn: null,
      sellerCompanyId: "co-a", sellerCompanyName: "Alpha" },
  ],
};

describe("toDraftLines", () => {
  it("converts pack count × pack size to grams", () => {
    expect(toDraftLines(group)[0].quantity).toBe(150);
  });

  it("passes price + product identity through", () => {
    const l = toDraftLines(group)[0];
    expect(l.productId).toBe("p1");
    expect(l.unitPrice).toBe(4.5);
    expect(l.pzn).toBe("PZN1");
  });

  it("falls back to the pack count as quantity when pack size is unknown", () => {
    expect(toDraftLines(group)[1].quantity).toBe(2);
    expect(toDraftLines(group)[1].unitPrice).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/modules/basket/lib/toDraftLines.test.ts`
Expected: FAIL — `Cannot find module './toDraftLines'`.

- [ ] **Step 3: Write `toDraftLines`**

Create `src/modules/basket/lib/toDraftLines.ts`:

```ts
import type { DraftLineInput } from "@/modules/deals";
import { toGrams } from "./pack";
import type { BasketGroup } from "../types";

/**
 * Map ONE seller-group's cart lines into the Deal Basket line shape createDeal
 * consumes. Grams = pack_count × pack_size_grams (toGrams); when the pack size
 * is unknown the quantity falls back to the raw pack count (a line still sends,
 * batch-optional — Phase 17 rule). Price rides through untouched (null → the
 * deal is sent price-less, which createDeal's sumValueNet already handles).
 */
export function toDraftLines(group: BasketGroup): DraftLineInput[] {
  return group.lines.map((l) => {
    const grams = toGrams(l.packCount, l.packSizeGrams);
    return {
      productId: l.productId,
      productName: l.productName,
      quantity: grams ?? l.packCount,
      unit: l.unit,
      unitPrice: l.pricePerGram,
      currency: l.currency,
      cultivar: l.cultivar,
      pzn: l.pzn,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/modules/basket/lib/toDraftLines.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Write the send server action**

Create `src/modules/basket/actions.ts`:

```ts
"use server";

/**
 * Send ONE seller-group of the Product Basket → a Deal Card, then clear those
 * lines. This is the ONLY seam onto the deals domain: it builds a Deal Basket
 * (toDraftLines) and calls the existing createDeal. Buyer groups send an 'order'
 * (recipient implicit = the seller company via the relationship); own-company
 * groups send an 'offer' to the chosen recipient. Line deletion is owner-scoped
 * by RLS. createDeal is Ayush's; nothing here touches deal tables directly.
 */
import { createClient } from "@/shared/db/server";
import { createDeal, type CreateDealResult } from "@/modules/deals";
import { toDraftLines } from "./lib/toDraftLines";
import type { BasketGroup, SendGroupInput } from "./types";

export async function sendBasketGroup(
  group: BasketGroup,
  input: SendGroupInput,
): Promise<CreateDealResult> {
  const lines = toDraftLines(group);
  const result = await createDeal({
    relationshipId: input.relationshipId,
    lines,
    note: input.note,
    dealType: group.isOwnCompany ? "offer" : "order",
    counterpartyPersonId: input.counterpartyPersonId,
  });

  // Clear the sent group's lines from the cart (RLS: only my own rows).
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_basket_line")
    .delete()
    .in("product_id", group.lines.map((l) => l.productId));
  if (error) throw error;

  return result;
}
```

- [ ] **Step 6: Write the RecipientPicker**

Create `src/modules/basket/components/RecipientPicker.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { getMyConnections, type ConnectedCompany } from "@/modules/messaging";

/**
 * Pick who an OWN-company offer is sent to: a connected company (mandatory) and
 * optionally a person on that side. Reuses getMyConnections — the same connected
 * directory the "+ New chat" picker uses. Buyer (other-company) groups never
 * render this; their recipient is the seller company, implicit.
 */
export function RecipientPicker({
  onPick,
}: {
  onPick: (r: { relationshipId: string; counterpartyPersonId: string | null }) => void;
}) {
  const [companies, setCompanies] = useState<ConnectedCompany[]>([]);
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    void getMyConnections().then((c) => setCompanies(c.companies));
  }, []);

  const chosen = companies.find((c) => c.companyId === companyId);

  if (companies.length === 0) {
    return <p className="text-[11px] text-ink/50">Connect with a company first to send an offer.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        aria-label="Recipient company"
        className="rounded-lg bg-white/80 px-2 py-1.5 text-xs ring-1 ring-black/10"
        value={companyId}
        onChange={(e) => {
          setCompanyId(e.target.value);
          const c = companies.find((x) => x.companyId === e.target.value);
          if (c) onPick({ relationshipId: c.relationshipId, counterpartyPersonId: null });
        }}
      >
        <option value="">Select a customer…</option>
        {companies.map((c) => (
          <option key={c.companyId} value={c.companyId}>{c.name}</option>
        ))}
      </select>

      {chosen && chosen.people.length > 0 && (
        <select
          aria-label="Recipient person (optional)"
          className="rounded-lg bg-white/80 px-2 py-1.5 text-xs ring-1 ring-black/10"
          onChange={(e) =>
            onPick({ relationshipId: chosen.relationshipId, counterpartyPersonId: e.target.value || null })
          }
        >
          <option value="">Whole company (optional person)</option>
          {chosen.people.map((p) => (
            <option key={p.personId} value={p.personId}>{p.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Write the BasketDrawer (replace the stub)**

Replace `src/modules/basket/components/BasketDrawer.tsx`:

```tsx
"use client";

import { useState } from "react";
import { X, Minus, Plus, Trash2, Send } from "lucide-react";
import { useBasket } from "../BasketProvider";
import { updateBasketLinePackCount, removeBasketLine } from "../supabase/writes";
import { sendBasketGroup } from "../actions";
import { RecipientPicker } from "./RecipientPicker";
import type { BasketGroup } from "../types";

export function BasketDrawer() {
  const { view, open, setOpen, refresh } = useBasket();

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px] transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`glass-strong fixed right-0 top-0 z-50 flex h-full w-[392px] max-w-[92vw] flex-col rounded-l-3xl shadow-2xl transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
          <h2 className="text-sm font-bold text-ink">Your basket</h2>
          <span className="text-xs text-ink/50">· {view.groups.length} {view.groups.length === 1 ? "shop" : "shops"}</span>
          <button aria-label="Close basket" onClick={() => setOpen(false)} className="ml-auto rounded-full p-1 text-ink/50 hover:bg-ink/5">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-4">
          {view.groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink/45">Your basket is empty.</p>
          ) : (
            view.groups.map((g) => <Group key={g.sellerCompanyId} group={g} onChanged={refresh} />)
          )}
        </div>
      </aside>
    </>
  );
}

function Group({ group, onChanged }: { group: BasketGroup; onChanged: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState<{ relationshipId: string; counterpartyPersonId: string | null } | null>(
    group.isOwnCompany ? null : (group.relationshipId ? { relationshipId: group.relationshipId, counterpartyPersonId: null } : null),
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!recipient) return;
    setSending(true);
    try {
      await sendBasketGroup(group, {
        sellerCompanyId: group.sellerCompanyId,
        relationshipId: recipient.relationshipId,
        counterpartyPersonId: recipient.counterpartyPersonId,
        note: note.trim() || null,
      });
      setSent(true);
      await onChanged();
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="border-b border-ink/10 py-4 text-sm font-semibold text-success">
        ✓ {group.isOwnCompany ? "Offer" : "Order"} sent to {group.sellerCompanyName === group.sellerCompanyName ? group.sellerCompanyName : ""}
      </div>
    );
  }

  return (
    <div className="border-b border-ink/10 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-bold text-ink">{group.sellerCompanyName}</span>
        {group.isOwnCompany && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand-deep">Your shop</span>}
        <span className="ml-auto text-xs text-ink/50">{group.lines.length}</span>
      </div>

      {group.lines.map((l) => (
        <div key={l.id} className="flex items-center gap-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink">{l.productName}</p>
            <p className="text-[10px] text-ink/50">
              {[l.cultivar, l.packSizeGrams ? `${l.packSizeGrams}g pack` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex items-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(20,10,16,0.15)]">
            <button aria-label="Decrease" className="grid h-6 w-6 place-items-center text-brand-deep"
              onClick={async () => { await updateBasketLinePackCount(l.id, Math.max(1, l.packCount - 1)); await onChanged(); }}>
              <Minus size={12} />
            </button>
            <span className="min-w-8 text-center text-[11px] font-bold tabular-nums">{l.packCount}</span>
            <button aria-label="Increase" className="grid h-6 w-6 place-items-center text-brand-deep"
              onClick={async () => { await updateBasketLinePackCount(l.id, l.packCount + 1); await onChanged(); }}>
              <Plus size={12} />
            </button>
          </div>
          <button aria-label="Remove" className="text-ink/40 hover:text-rose-600"
            onClick={async () => { await removeBasketLine(l.id); await onChanged(); }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)…"
        className="mt-2 w-full rounded-lg bg-white/80 px-2.5 py-1.5 text-xs ring-1 ring-black/10"
      />

      {group.isOwnCompany && (
        <div className="mt-2">
          <RecipientPicker onPick={setRecipient} />
        </div>
      )}

      <button
        disabled={!recipient || sending}
        onClick={send}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-xs font-bold text-white hover:bg-brand-deep disabled:opacity-40"
      >
        <Send size={13} /> {group.isOwnCompany ? "Send offer" : "Send order"}
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Typecheck + lint + unit**

Run: `npm run test:unit && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 9: Verify the seller send end-to-end**

Run: `supabase db reset && npm run dev`. As a seller on `/present`: add 2 products to the cart → open the drawer → confirm one "Your shop" group with 2 lines → pick a connected customer in the RecipientPicker → **Send offer**. Expected: "Offer sent", the group clears, the badge drops to 0. Confirm a real deal card was born:
```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c "select deal_type, status from deal_card order by created_at desc limit 1;"
```
Expected: one row `offer | draft`.

- [ ] **Step 10: Commit**

```bash
git add src/modules/basket/components/ src/modules/basket/actions.ts src/modules/basket/lib/toDraftLines.ts src/modules/basket/lib/toDraftLines.test.ts
git commit -m "feat(basket): grouped drawer + recipient picker + sendBasketGroup → createDeal"
```

> **Checkpoint:** Tasks 1–8 are a complete, demoable SELLER slice. If demo time is tight, stop here.

---

## Round 2 — Draft-deal redesign (2026-07-08, post-checkpoint, supersedes Task 8's UI)

**Why:** live feedback on Task 8's `BasketDrawer` (a full-height side panel) + a live-tested design pass with Muskan produced three decisions, prototyped and confirmed in `prototypes/basket-popover-prototype/`:

1. Replace the full drawer with a **compact dropdown anchored to the TopBar basket icon**, grouped by seller company, button relabeled **"Draft deal"**.
2. "Draft deal" does NOT send anything — it calls the *existing, unchanged* `createDeal()` to birth a real `deal_card` in **`draft`** status (already the first-class initial status — no schema change), then the result is opened **inside that customer's chat** (the same place every deal already lives), not a basket-specific panel.
3. Chat's own "Create Deal" button gets the same treatment: it currently requires the other person to Accept before any `deal_card` exists (`CreateDealForm` → `proposeDeal` → `confirmDetectedDeal`). Since the chat's relationship is already known, this becomes a direct `createDeal()` call with an empty line list (verified: `create_deal_draft` already accepts `p_lines: []` via `coalesce(p_lines, '[]'::jsonb)` — no RPC change needed), opening the real, empty, editable card immediately. **This removes the existing accept-before-birth gate for chat-initiated deals** — confirmed with Muskan as the intended trade-off.

**Explicitly NOT doing (over-engineering guardrails):**
- No schema/RLS change (`deal_card.relationship_id` stays `NOT NULL`, unchanged — the "no customer yet" idea from round 1 of this discussion was rejected in favor of this simpler design).
- No new mocked/fake "pre-draft" UI — the REAL `DealCard` component opens directly; nothing is faked.
- No removal pass on the old `deal_detected`/`confirmDetectedDeal` propose-to-birth RPCs/message type — they become unused by this UI, not deleted. Cleanup is a separate future task if confirmed dead.
- No note field in the new dropdown (dropped per round 1 feedback).
- Reuse `RecipientPicker`, `sendBasketGroup`, `groupBySeller`, `createDeal` exactly as already built in Tasks 3–8 — only the drawer's shape, the button's destination, and chat's trigger change.

## Task 8a: Replace `BasketDrawer.tsx` with the compact dropdown popover

**Files:** Modify `src/modules/basket/components/BasketDrawer.tsx`; modify `src/shared/ui/TopBar.tsx` only if the anchor markup needs a wrapping `position:relative` element (check first — it may already have one from the icon button's own styling).

- [ ] **Step 1: Rebuild the popover shape**

Fold in the locked design from `prototypes/basket-popover-prototype/index.html` + its `NOTES.md`: anchored directly under the TopBar basket icon (`top: 100% + gap`, not offset further down the page), grouped by `BasketGroup` (own-company gets a "Your shop" pill, matching today), steppers + remove per line, no note field. Keep `RecipientPicker` for own-company groups exactly as built (still needed — SOMEONE has to say which connected company this is for; that hasn't changed). Button label changes from "Send offer"/"Send order" to **"Draft deal"** for both group types.

- [ ] **Step 2: Wire success to open the chat, not a static checkmark**

On success, instead of a static "✓ sent" row, call the Task 8b helper to navigate into the resulting chat (don't just clear the line and show a checkmark).

- [ ] **Step 3: Gate + verify**

Typecheck + lint + unit: `npm run test:unit && npx tsc --noEmit && npm run lint`. Manually verify the popover opens/closes/groups correctly (real browser pass).

- [ ] **Step 4: Commit**

```bash
git add src/modules/basket/components/BasketDrawer.tsx src/shared/ui/TopBar.tsx
git commit -m "feat(basket): compact dropdown popover replaces the full-height drawer"
```

---

## Task 8b: Verify + wire "open a just-created deal inside its chat"

**Files:** likely a small addition to `src/modules/basket/actions.ts` or a new tiny helper; possibly nothing new at all.

- [ ] **Step 1: Investigate FIRST, don't guess**

`DealPin.tsx:279` already does `setSelectedId(def?.id ?? null)` on mount/refetch — read what `def` resolves to (probably "the newest non-terminal deal for this relationship"). If navigating to a relationship's chat after `createDeal()` already causes `DealPin` to auto-select the fresh `draft` card via this existing default logic, **no new plumbing is needed** — just navigate (`router.push` to whatever route already opens that relationship's chat) and stop.

- [ ] **Step 2: Add the minimal glue only if verification shows it's needed**

Only add glue (a query param, or whatever event `DealPin`/`DealCardPanelHost` already listens for) if verification shows the default-selection logic does NOT pick up a same-second-old draft reliably (e.g. a realtime-lag race). Prefer the zero-new-code outcome; don't add a mechanism "to be safe" without first proving it's needed.

- [ ] **Step 3: Gate + verify + commit (if any code changed)**

If Step 1 found zero new code is needed, report that finding and skip to Task 8c — no commit required. Otherwise gate (`npm run test:unit && npx tsc --noEmit && npm run lint`), verify manually, and commit.

---

## Task 8c: Chat's "Create Deal" calls `createDeal()` directly, skips propose/accept-to-birth

**Files:** `src/modules/messaging/components/Composer.tsx` (the `createDeal()` handler, currently just dispatches `hs:create-deal`), `src/modules/deals/components/DealPin.tsx` (the `creating`/`hs:create-deal` listener + the "Start a deal" dashed button, currently opens `CreateDealForm`).

- [ ] **Step 1: Change both triggers**

Instead of setting `creating = true` (which renders `CreateDealForm`), they call `createDeal({ relationshipId: <this chat's relationship>, lines: [] })` directly, then use the Task 8b mechanism to open the resulting card immediately — real, empty, in `draft` status, editable per the existing role-based field permissions already in `CardFront.tsx` (seller-only price/batch/conditions, joint quantity/product, per-party notes — already built, just being reused, not rebuilt).

- [ ] **Step 2: Leave the old propose/accept path alone**

Do NOT delete `CreateDealForm.tsx`/`proposeDeal`/`confirmDetectedDeal` — they become unused by this trigger, left in place per the over-engineering guardrail above.

- [ ] **Step 4: Gate + verify + commit**

Typecheck + lint + unit: `npm run test:unit && npx tsc --noEmit && npm run lint`. Manually verify: click "Create Deal" in a real chat, confirm an empty draft card opens immediately (no popup, no waiting for the other side), confirm role-based editing still works. Commit.

> **Checkpoint after Round 2:** re-verify the full seller+chat flow end-to-end (Present → Draft deal → picks customer → card opens in their chat; Chat → Create Deal → empty card opens immediately; both editable per role) before touching the original Task 9 (buyer RPC) below, which is unrelated, independent work.

---

> # ⛔ TASKS 9–11 ARE DEAD — SUPERSEDED 2026-08-19
>
> **Do not build anything below this line.** The buyer-reads-a-connected-shop capability is
> now owned by **slug `0022-buyer-shop-view`** → `docs/PRD/0022-buyer-shop-view.md`
> (approved at G1, 2026-08-19). Tasks 1–8 above SHIPPED and stay as the record; Tasks 9–11
> were never built and must not be.
>
> **Why they are wrong, not merely superseded:**
> 1. **Wrong gate.** Task 9 requires an active `relationship`. The shipped model gates on
>    caller verification + per-product `price_public` / `profile_visible`, and 0022's G1
>    added *connection overrides visibility, never price* (`DECISIONS.md` 2026-08-19).
>    Building this would create a **second, inconsistent door** onto the same data.
> 2. **Wrong door, full stop.** A new `get_connected_shop` RPC violates the one-read-door
>    rule — *"any new feature that needs a price must read through that same door"*
>    (`ARCHITECTURE-NOTES.md:423`). 0022 widens the existing shop read path instead.
> 3. **Stale columns.** The returns list `bundle_threshold_grams` / `bundle_price_per_gram`.
>    Migration C **dropped both** from `pricelist_item` on 2026-08-16 (tier ladder, ADR-0004).
>    This code cannot compile against the live schema.
> 4. **Wrong route.** A child route `/discover/[companyId]/shop`. 0022 rebuilds
>    `/discover/[companyId]` in place — no second page, no split CTAs.
>
> **Task 12 below:** its seller/chat half stands; its buyer half is replaced by 0022's
> acceptance criteria (PRD §8).

---

## Task 9: `get_connected_shop` RPC (buyer read path)

**Files:**
- Create: `supabase/migrations/<ts2>_get_connected_shop.sql`
- Regenerate: `src/types/database.types.ts`

**Interfaces:**
- Produces: `get_connected_shop(p_company_id uuid)` SECURITY DEFINER, returns the full per-product shape `getMyShop` builds (all spec columns + `product_batch` + `product_media` + `product_image` + `pricelist_item` + `terpene_percent`), gated on an ACCEPTED relationship between the caller and `p_company_id`, and `profile_visible = true`.

- [ ] **Step 1: Copy the discover RPC as the starting template**

Read `supabase/migrations/*_get_discoverable_shop*.sql` (the RPC body). The new RPC widens its returned columns to the full set and swaps the gate from "verified only" to "verified AND an accepted relationship with the caller".

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/<ts2>_get_connected_shop.sql`:

```sql
-- ============================================================================
-- Migration — get_connected_shop RPC (Product Basket buyer read path)
-- ----------------------------------------------------------------------------
-- Additive-only. A SECURITY DEFINER projection returning ANOTHER company's shop
-- at FULL fidelity (all spec columns + batches + media + images + list price),
-- so a buyer sees the same ShopView/ProductCard the seller's own Present shows.
-- Gate: caller must share an ACCEPTED relationship with p_company_id, and the
-- product must be profile_visible. Base product RLS (company_id = own) forbids a
-- direct cross-company read, so this RPC is the only door. Cost/COGS never
-- surfaces (no private columns selected).
-- ============================================================================

create or replace function public.get_connected_shop(p_company_id uuid)
returns table (
  id uuid, name text, cultivar text,
  thc_percent numeric, cbd_percent numeric, cbg_percent numeric, cbn_percent numeric,
  terpene_percent numeric,
  cultivator text, lineage_parent_a text, lineage_parent_b text,
  irradiation_code text, supplier_product_code text,
  packaging_material text, resealable boolean, location text,
  pack_size_grams numeric, unit_code text, local_code_pzn text,
  dominance_code text, country_of_origin text, region text,
  price_public boolean, price_per_gram numeric,
  bundle_threshold_grams numeric, bundle_price_per_gram numeric,
  images jsonb, media jsonb, batches jsonb, metadata jsonb
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    p.id, p.name::text, p.cultivar::text,
    p.thc_percent, p.cbd_percent, p.cbg_percent, p.cbn_percent,
    p.terpene_percent,
    p.cultivator::text, p.lineage_parent_a::text, p.lineage_parent_b::text,
    p.irradiation_code::text, p.supplier_product_code::text,
    p.packaging_material::text, p.resealable, p.location::text,
    p.pack_size_grams, p.unit_code::text, p.local_code_pzn::text,
    p.dominance_code::text, p.country_of_origin::text, p.region::text,
    p.price_public,
    case when p.price_public then price.price_per_gram         end,
    case when p.price_public then price.bundle_threshold_grams end,
    case when p.price_public then price.bundle_price_per_gram  end,
    coalesce(imgs.images, '[]'::jsonb),
    coalesce(med.media, '[]'::jsonb),
    coalesce(bat.batches, '[]'::jsonb),
    coalesce(p.metadata, '{}'::jsonb)
  from public.product p
  join public.company c
    on c.id = p.company_id
   and c.id = p_company_id
   and c.deleted_at is null
   and c.verification_status = 'verified'
  -- GATE: an accepted relationship between the caller's company and p_company_id.
  join public.relationship r
    on p_company_id in (r.company_a_id, r.company_b_id)
   and public.current_company_id() in (r.company_a_id, r.company_b_id)
   and r.status = 'active'
   and r.deleted_at is null
  left join lateral (
    select jsonb_agg(jsonb_build_object('id', pi.id, 'path', pi.image_path) order by pi.position) as images
    from public.product_image pi where pi.product_id = p.id
  ) imgs on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('id', pm.id, 'kind', pm.kind, 'path', pm.path,
                                        'url', pm.url, 'label', pm.label) order by pm.position) as media
    from public.product_media pm where pm.product_id = p.id
  ) med on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('id', pb.id, 'batch_number', pb.batch_number,
                                        'thc_percent', pb.thc_percent, 'cbd_percent', pb.cbd_percent,
                                        'expiry_date', pb.expiry_date) order by pb.created_at) as batches
    from public.product_batch pb where pb.product_id = p.id and pb.deleted_at is null
  ) bat on true
  left join lateral (
    select pli.price_per_gram, pli.bundle_threshold_grams, pli.bundle_price_per_gram
    from public.pricelist_item pli where pli.product_id = p.id limit 1
  ) price on true
  where p.deleted_at is null
    and p.profile_visible = true;
$$;

grant execute on function public.get_connected_shop(uuid) to authenticated;
```

(Confirm the exact `product_media` / `product_image` / `product_batch` column names against `getMyShop`'s select before finalising — this migration mirrors that read's columns.)

- [ ] **Step 3: Apply + verify**

Run: `supabase db reset`
Expected: no error. Then regenerate types:
`supabase gen types typescript --local > src/types/database.types.ts`
Confirm: `grep -n "get_connected_shop" src/types/database.types.ts` → non-empty.

- [ ] **Step 4: Probe the gate (connected sees, unconnected empty)**

Run:
```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c \
"select count(*) from get_connected_shop((select company_id from person limit 1));"
```
Expected: runs without error (count depends on seed relationships). Full allow/deny is proven in Task 11's two-account browser pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<ts2>_get_connected_shop.sql src/types/database.types.ts
git commit -m "feat(basket): get_connected_shop RPC — full-fidelity buyer shop read, relationship-gated"
```

---

## Task 10: `getConnectedShop` read (maps RPC → Shop)

**Files:**
- Modify: `src/modules/catalog/shop.ts`

**Interfaces:**
- Consumes: the `get_connected_shop` RPC; existing `Shop` / `ShopProduct` mappers in `shop.ts`.
- Produces: `getConnectedShop(companyId: string): Promise<Shop | null>` — same `Shop` shape as `getMyShop`, with owner-only fields forced read-only-safe (`profile_visible: true`, no edit metadata).

- [ ] **Step 1: Add the read**

In `src/modules/catalog/shop.ts`, add after `getMyShop`:

```ts
/**
 * Another connected company's shop at full fidelity, for the buyer's read-only
 * view. Base product RLS forbids a direct cross-company select, so this goes
 * through the get_connected_shop SECURITY DEFINER RPC (relationship-gated). The
 * per-product mapping mirrors getMyShop; company chrome (name/logo/links) comes
 * from the get_discoverable_company read the profile page already loads, so this
 * returns products + a minimal company header.
 */
export async function getConnectedShop(companyId: string): Promise<Shop | null> {
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("company")
    .select("id, name, tagline, description, cover_path, logo_path, updated_at, warehouse_location, country, address, website, metadata")
    .eq("id", companyId)
    .single();
  if (!company) return null;

  const res = (await supabase.rpc("get_connected_shop" as never, { p_company_id: companyId } as never)) as unknown as {
    data: RpcShopRow[] | null; error: { message: string } | null;
  };
  if (res.error) throw new Error(res.error.message);

  const products: ShopProduct[] = (res.data ?? []).map(mapRpcRowToShopProduct);

  return {
    company: {
      id: company.id, name: company.name, tagline: company.tagline, description: company.description,
      cover_path: company.cover_path, logo_path: company.logo_path, updated_at: company.updated_at,
      warehouse_location: company.warehouse_location, country: company.country, address: company.address,
      website: company.website, links: parseLinks(company.metadata),
      locations: deriveInitialLocations(company.warehouse_location, company.metadata), tags: [],
    },
    products,
  };
}
```

Add a `RpcShopRow` type + `mapRpcRowToShopProduct` mapper that mirrors `getMyShop`'s per-row mapping (images/media/batches come pre-aggregated as jsonb from the RPC, so parse them directly; `terpPercent` = `terpene_percent`; `packSizes` = `parsePackSizes(metadata)`). Reuse the existing `ProductImage`/`ProductMedia`/`ProductBatchLite` shapes. Model the mapper on the existing `products.map((r) => …)` block in `getMyShop`, substituting the jsonb arrays for the nested selects.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/modules/catalog/shop.ts
git commit -m "feat(basket): getConnectedShop read maps get_connected_shop RPC → Shop"
```

---

## Task 11: Connected-shop route (buyer adds from another company's shop)

**Files:**
- Create: `src/app/discover/[companyId]/shop/page.tsx`
- Modify: `src/app/discover/[companyId]/page.tsx` (add an entry link)

**Interfaces:**
- Consumes: `getConnectedShop` (`@/modules/catalog/shop`); `ShopView` with `viewerCanManage={false}`.

- [ ] **Step 1: Write the route**

Create `src/app/discover/[companyId]/shop/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getConnectedShop } from "@/modules/catalog/shop";
import { ShopView } from "@/app/present/ShopView";

/**
 * A connected company's shop, buyer's read-only view. Same ShopView + ProductCard
 * the seller's own Present uses, with viewerCanManage=false so no edit/manage
 * chrome shows and each card's Add-to-basket adds a line tagged to THIS company
 * as the seller. Reachable only for a company you share an accepted relationship
 * with (get_connected_shop returns [] otherwise → notFound).
 */
export default async function ConnectedShopPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const shop = await getConnectedShop(companyId);
  if (!shop || shop.products.length === 0) notFound();
  return <ShopView shop={shop} viewerCanManage={false} />;
}
```

- [ ] **Step 2: Add the entry link on the company profile**

In `src/app/discover/[companyId]/page.tsx`, inside the `<ConnectActions>` area (only meaningful once connected), add a link to the full shop:
```tsx
      <Link
        href={`/discover/${company.id}/shop`}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-deep"
      >
        View shop & add to basket
      </Link>
```
(Only render it when `company.connectionState` is the connected state — mirror the existing conditional the page already uses for connected-only affordances.)

- [ ] **Step 3: Verify Add-to-basket persists a line tagged to the SELLER (buyer path)**

Wire check: `ShopView`'s `handleAddToBasket` (Task 7) resolves the pack size from `shop.products` — which for this route are the OTHER company's products, so the persisted `product_id` belongs to that company. The seller grouping is derived at read time from `product.company_id`, so no seller id needs threading here.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/discover/[companyId]/shop/page.tsx src/app/discover/[companyId]/page.tsx
git commit -m "feat(basket): connected-shop route — buyer adds another company's products to the cart"
```

---

## Task 12: Full cross-role manual verification

**Files:** none (verification only).

- [ ] **Step 1: Reset + seed**

Run: `supabase db reset && npm run dev`
Ensure the seed has two connected companies with products (the existing seed's Aurora/CNG relationship).

- [ ] **Step 2: Seller offer path**

As company A on `/present`: add 2 own products → drawer shows one "Your shop" group → pick company B as recipient → **Send offer**. Expected: badge clears; `deal_card` newest row = `offer | draft`.

- [ ] **Step 3: Buyer order path**

As company A, go to `/discover/<companyB>/shop` → add 2 of company B's products → drawer shows a "Company B" group with a one-click **Send order** (no recipient picker) → send. Expected: `deal_card` newest row = `order | draft`.

- [ ] **Step 4: Cross-company basket**

Add products from BOTH your own shop AND company B's shop before sending. Expected: the drawer shows TWO groups (Your shop + Company B), each with its own Send control.

- [ ] **Step 5: RLS owner isolation**

Sign in as a person at company C (a different account). Expected: their basket is empty — they never see company A's cart lines. (Proves `basket_line_owner_all`.)

- [ ] **Step 6: Persistence**

With items in the cart, refresh the page and re-open the drawer. Expected: the cart is intact (persisted, not in-memory).

- [ ] **Step 7: Final gate**

Run: `npm run test:unit && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 8: Commit any verification-driven fixes, then update planning docs**

Commit fixes atomically. Then update `docs/deploy/cloud-migrations-pending.md` to add the two new migrations (`product_basket_line`, `get_connected_shop`) as cloud-PENDING.

```bash
git add docs/deploy/cloud-migrations-pending.md
git commit -m "docs(deploy): record product-basket migrations as cloud-pending"
```

---

## Self-Review

**Spec coverage:**
- Schema (`product_basket_line`, RLS, pack_count/pack_size) → Task 1 ✓
- Module boundary (`src/modules/basket/` → deals via barrel only) → Tasks 4/8 (`actions.ts` imports `createDeal` from `@/modules/deals`) ✓
- Reads/writes (`getMyBasket`, add/update/remove, `sendBasketGroup`) → Tasks 4, 8 ✓
- Send behavior (buyer=order implicit recipient; seller=offer + picker) → Task 8 (`Group` component branches on `isOwnCompany`) ✓
- `createDeal` `dealType` + `counterpartyPersonId` (shared-file, sync ritual) → Task 5 ✓
- Global TopBar icon + badge → Task 6 ✓
- Grouped drawer, prototype visual language → Task 8 ✓
- `ShopView` read-only mode (`viewerCanManage`) → Task 7 (gate) + Task 11 (buyer route) ✓
- Full-fidelity buyer read (`get_connected_shop` RPC + `getConnectedShop`) → Tasks 9, 10 ✓
- Edge cases (no batch, price-less, cascade delete, not-connected) → Tasks 8 (`toDraftLines` fallbacks), 11 (`notFound`), 1 (cascade) ✓
- Testing (unit for pure helpers, RLS probe, manual cross-role) → Tasks 2/3/5/8 unit, 12 manual ✓
- Vocabulary discipline → enforced in every file header comment ✓

**Placeholder scan:** no TBD/TODO; every code step carries full code; every command carries expected output. The one "model on the existing mapper" instruction (Task 10 `mapRpcRowToShopProduct`) points at a concrete existing block (`getMyShop`'s `.map`) rather than hand-waving — acceptable since it's a faithful copy with jsonb-vs-nested substitution.

**Type consistency:** `BasketLine`/`BasketGroup`/`BasketView`/`SendGroupInput` defined in Task 3's `types.ts`, consumed unchanged in Tasks 4/8. `toGrams` (Task 2) consumed in Task 8's `toDraftLines`. `groupBySeller` (Task 3) consumed in Task 4. `createDealRpcArgs` (Task 5) consumed in Task 5's `createDeal`. `getConnectedShop` (Task 10) consumed in Task 11. `useBasket`/`addToBasket` barrel names consistent across Tasks 6/7/8.
