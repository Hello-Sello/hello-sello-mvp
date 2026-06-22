# Build Plan - Storage uploads: body-limit + orphan hardening

**Status:** 🟡 Planned (not started). Decisions locked below; build is "Do Now" phases 1-3.
**Owner:** Muskan · **Created:** 2026-06-10 · **Live project:** Supabase `shop-media` + `avatars` buckets.
**Builds on:** the gallery client-direct pattern (`addProductImageRecords`, session 18) and the profile/avatar work (session 19). **Touches no schema** (phases 1-3 are app code + a storage delete).

> Why this exists: two unrelated weaknesses live in the upload code. (1) **Body-limit** - cover/logo bytes still ride through a Server Action (Next 1 MB / Vercel 4.5 MB cap), so a large image can fail to upload. (2) **Orphans** - every avatar/cover/logo replacement leaves the old file behind in storage, unreferenced, forever. Both are cheap to fix now and grow expensive later.

---

## 0. What this is (and is NOT)

**This IS:** make every single-slot image upload (avatar, cover, logo) (a) upload **client-direct** so bytes never hit the Server-Action body limit, and (b) use a **stable filename** so a replacement overwrites the old file instead of orphaning it. Plus a one-time delete of the 2 orphans already in `shop-media`.

**This is NOT:** a storage redesign, a change to the gallery (it already uploads client-direct and cleans up on delete - leave it), or the broader **parent-delete cleanup** (deleting a product/company/deal row should delete its files too) - that is a schema-level concern, deferred in §4.

**Grounding:** Supabase's own guidance for single-slot assets (avatar/logo) is "stable filename = owner id + `upsert: true` so new uploads overwrite the old, eliminating orphans without cleanup logic." The unique-UUID-per-upload approach is the one that *creates* orphans. Smart CDN auto-invalidates an object's cache on overwrite (≤60s), so a stable URL refreshes on its own; a `?v=<updated_at>` nonce closes the browser-cache + 60s gap.

---

## 1. Current state (audited live, 2026-06-10)

Four buckets exist. Two orphan mechanisms: **replace** (upload new, old not deleted) and **parent-delete** (row gone, file lingers).

| Column → bucket | Slot | Upload path today | Body-limit risk | Orphan on replace? | Orphan on parent-delete? |
|---|---|---|---|---|---|
| `person.avatar_path` → `avatars` | single | **client-direct** ✅ but **UUID filename** (`{id}/{uuid}-{name}`, `AvatarUpload.tsx:33`) - `upsert:true` is dead (UUID never collides) | none | ✅ **yes** | ✅ yes |
| `company.cover_path` / `logo_path` → `shop-media` | single | **server-routed** ❌ (`updateShopProfile`, `manage.ts:97-107`) + UUID filename | **1 MB / 4.5 MB** | ✅ **yes** (2 live orphans) | ✅ yes |
| `product_image.image_path` → `shop-media` | collection | client-direct ✅, deletes on remove (`deleteProductImage`) | none | ❌ no (handled) | ✅ yes |
| license / deal / relationship artifacts → private buckets | doc | n/a here | n/a | n/a | ✅ yes |

**Live orphans right now:** 2 files in `shop-media`, both the seed company `aaaaaaaa-…`, ~110 kB total:
- `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/cover-fc973b07-33ce-4099-94ef-f9ef5728810b.jpg` (42 kB)
- `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/logo-3ca3ccc1-e532-44a0-98df-0e0b93e456aa.jpg` (68 kB)

All other buckets are clean (1=1) or empty (`avatars` = 0 files). So this is about not *accumulating* clutter, not cleaning a mess. Storage total is ~33 MB - space is not the concern; unbounded growth as real users churn is.

---

## 2. Decisions

**D-CLIENT-DIRECT** - the browser uploads the bytes straight to the bucket; the Server Action receives only the **path string** and writes it to the row. This is exactly what the gallery already does (`addProductImageRecords`). Removes the body-limit class of bug entirely - strings are tiny.

**D-OPTION-B** - single-slot assets use a **stable filename** so `upsert:true` actually overwrites the one file. Orphan-proof *by construction* - there is only ever one file per slot, so there is nothing to leave behind. (Collections like the gallery keep unique filenames + explicit delete-on-remove; that is correct for them and stays.)

**D-PATH-SHAPE** - stable path is `${ownerId}/<slot>` with **no extension** (e.g. `${companyId}/cover`, `${companyId}/logo`, `${personId}/avatar`); content-type lives in object metadata. *Why no extension:* if the path carried the extension (`cover.png`), switching format (png → jpg) would change the path and re-orphan - defeating the point. No extension = the path is truly stable across formats. Drops the leaked original filename too.

**D-CACHE** - because the URL is now stable, append `?v=<row.updated_at>` to the public URL so a replaced image busts the browser cache immediately. Supabase Smart CDN already auto-invalidates the object on overwrite (≤60s), so the nonce only covers the browser + that window. (We deliberately do NOT use filename-versioning - the "strongest" cache-buster - because a new filename per version is the opposite of D-OPTION-B and would re-create orphans.)

---

## 3. Phases (Do Now) - each: build → preview/verify → tsc + eslint clean → commit

- **Phase 1 - Avatar: stable path (smallest, highest leverage, 0 orphans today).**
  In `AvatarUpload.tsx`, change `const path = \`${personId}/${crypto.randomUUID()}-${file.name}\`` →
  `const path = \`${personId}/avatar\`` (keep `upsert:true` - now it does real work). The avatar URL helper
  (`profile/index.ts`, `getPublicUrl`) appends `?v=<updated_at>` per D-CACHE.
  *Verify:* upload twice in /account → bucket holds exactly **one** file under `${personId}/`; image updates on screen.

- **Phase 2 - Cover/logo: client-direct + stable path.**
  **(a)** `ShopView.tsx` `save()`: instead of `fd.set('cover', cover)` / `fd.set('logo', logo)`, upload each picked
  File client-direct to `shop-media` at `${companyId}/cover` / `${companyId}/logo` (`upsert:true`), then put only the
  **path strings** in the form (mirror the gallery's client upload + the existing client-side size/type guards).
  **(b)** `updateShopProfile` (`manage.ts:97-107`): delete the server upload loop; accept `cover_path`/`logo_path`
  **strings** and write them to the `company` row. Server never touches bytes.
  **(c)** `mediaUrl` (`ShopView.tsx:29`) appends `?v=<company.updated_at>` per D-CACHE.
  *Verify:* edit cover+logo with a >4.5 MB image (would have failed before) → succeeds; bucket holds one `cover` +
  one `logo` per company; public `/c/<handle>` + storefront still render; no console errors.

- **Phase 3 - delete the 2 existing orphans.**
  One-time storage delete of the two `aaaaaaaa-…` files listed in §1. **Preview the exact paths to Muskan first**
  (storage delete is a write). No DB rows touched - nothing references them.
  *Verify:* `shop-media` count 27 → 25; storefront/public page unchanged.

---

## 4. Deferred (the note, so we remember)

**D-CASCADE - parent-delete file cleanup, ALL buckets.** When a `product` / `company` / `deal` / artifact **row** is
deleted, its storage **files are not** (DB and storage are separate tables; a DB cascade removes rows, not objects).
Robust fix per research: an **FK to `storage.objects` with `ON DELETE CASCADE`** *or* a delete trigger / app-layer
cleanup. Note the FK cascades the *wrong* direction (delete file → delete row); row → file needs a trigger or app
code. **Why deferred:** it is schema/trigger work deserving its own migration + isolation test, and there is **no
live clutter from it yet** (every bucket is clean except the 2 known orphans). Do not bundle into phases 1-3.
Affects: `product_image`, `company` cover/logo, `company_license_file`, `deal_artifact`, `relationship_artifact`,
`person.avatar_path`. → own task, post-hardening.

Other open follow-ups already tracked in CLAUDE.md (per-field public toggles, `public_handle` rename, avatar-in-vCard) are unrelated to storage and stay there.

---

## 5. Verify (whole unit)

- Upload each of avatar / cover / logo twice; confirm exactly one file per slot remains in its bucket.
- Upload a cover/logo larger than 4.5 MB (the old failure case); confirm it succeeds.
- Storefront, `/account`, and public `/c/<handle>` all render the latest image (cache nonce works).
- `tsc` + eslint clean; no console errors; the 2 orphans gone.

## 6. Process

1. This plan locked with Muskan (done). 2. Build phases 1-3 in order; preview the Phase-3 delete before running it.
3. Sync-lock any shared file before editing (`manage.ts` / `ShopView.tsx` are Muskan-owned catalog files; Ayush's
3b work is isolated to deal tables - low risk, but follow the ritual). 4. Wrap: update this log, sync file,
CLAUDE.md what's-next; architecture-notes check (D-OPTION-B / D-PATH-SHAPE may warrant a one-line entry).
