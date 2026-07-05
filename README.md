# Nuvari Sales Tool

Internal sales tooling for Nuvari's bike shop dealer network: a coverage-planning map and a shop database with visit tracking. Static HTML/JS front end backed by Supabase (Postgres + Auth + Storage), no build step.

**Live entry point:** `index.html` — links to the map planner and the Shop DB, and keeps the 2-3 most recent versions of the map on the dashboard for quick rollback/comparison.

## Contents

- [Tools](#tools)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Database schema](#database-schema)
- [CSV standard](#csv-standard)
- [Auth model](#auth-model)
- [Versioning](#versioning)
- [Known gaps / next steps](#known-gaps--next-steps)

## Tools

### Dealer Coverage Map (`map-v0.4.1.html`)

A single-file Leaflet.js application for planning dealer/retail coverage across Taiwan.

- County/district population-density choropleth with adjustable detail level (county → district)
- Candidate-shop **location datasets**: upload a CSV, or pull directly from the Shop DB (optionally filtered to one Shop DB dataset — see below)
- Per-pin coverage-area modes: fixed-radius circle or real drive-time isochrone (via [OpenRouteService](https://openrouteservice.org/))
- Filtering by status, rating tier, Google rating, region, and sales rep, with live shop counts per filter
- Scenarios: save the current map state (active layers, filters, view) as a private or team-shared scenario
- CSV export for both pins and location datasets, respecting active filters
- Supabase Auth login shared with the Shop DB (same `localStorage` session cache), so signing into one signs you into the other

Older versions (`map-v0.1.html` … `map-v0.4.0.html`) are kept in the repo root as a lightweight changelog/rollback mechanism — see [Versioning](#versioning).

### Shop DB & Visit Planner (`nst/`)

A small multi-page app for managing the shop database and sales visit records.

- **Shop DB** (`shops.html`) — list, filter (status / region / sales rep / dataset / "only mine"), bulk-select and delete, add/edit, CSV import/export
- **Datasets** — group shops into named datasets (e.g. one per CSV import, or a research set like "全國電子 2026"); manage via the "🗂 Datasets" button. Deleting a dataset never deletes its shops, they just become unassigned
- **CSV import duplicate detection** — incoming rows are checked against existing shops by exact name, exact address, or near-identical coordinates (~11m); matches are listed with a checkbox (unchecked = skipped) so you decide row by row whether to import anyway
- **Shop detail** (`shop-detail.html`) — full record view/edit, plus visit history
- **Visit planner** (`visits.html`, `visit-detail.html`) — schedule visits, record outcomes, attach photos (Supabase Storage)
- Sales rep is a dropdown sourced from real registered accounts (`public.user_directory`), not freeform text

## Architecture

- **No build step.** Everything is plain HTML/CSS/JS loaded via `<script type="module">` and ES module imports from `esm.sh`/`jsdelivr` CDN builds of `@supabase/supabase-js`. Open the files directly through any static file server.
- **Backend is entirely Supabase**: Postgres tables + Row-Level Security, Supabase Auth (email/password), and Supabase Storage for visit photos.
- **Shared standard**: the map planner's candidate-shop CSV import and the Shop DB's CSV import parse the same column set and status vocabulary (see [CSV standard](#csv-standard)), so one export from either tool re-imports cleanly into the other.
- **`/shared/`** holds logic genuinely reused by both tools: the low-level CSV/TSV tokenizer (`csv-parser.js`), the region color palette (`region-colors.js`), and the Taiwan township boundary data + point-in-polygon lookup (`taiwan-towns.js`, `geo.js`) used to auto-assign region/county/district from coordinates. `nst/` imports these as normal ES modules; `map-v0.4.1.html`'s main script is a classic (non-module) script, so it pulls them in via dynamic `import()` instead. Each tool still builds its own higher-level row/shop objects on top of the shared tokenizer — those aren't unified, only the parsing primitive is.

## Project structure

```
index.html                 Landing dashboard (links to map + Shop DB, shows recent versions)
map-v0.4.1.html             Current dealer coverage map (single-file app)
map-v0.4.0.html, ...        Older map versions, kept for rollback/reference
assets/                     Shared images (logo, background)

shared/                     Logic reused by both the map planner and nst/ (see Architecture)
  csv-parser.js               Low-level CSV/TSV tokenizer
  region-colors.js             Canonical region color palette
  geo.js                       Point-in-polygon region/county/district lookup
  taiwan-towns.js               Township boundary GeoJSON backing geo.js

supabase/migrations/         Numbered record of SQL run in the Supabase SQL editor (see below)

nst/                        Shop DB & Visit Planner
  index.html                 NST landing page
  shops.html                  Shop list, filters, CSV import/export, dataset management
  shop-detail.html             Single shop view/edit + visit history
  visits.html                  Visit list/scheduling
  visit-detail.html             Single visit view/edit + photo upload
  css/nst-shared.css          Shared styles across all nst/ pages
  js/
    supabase-client.js         Supabase client init (URL + publishable key)
    auth.js                    Auth gate, sign-in modal, session cache sync
    shops.js                   Shop + dataset + sales-rep-directory data access
    visits.js                  Visit data access
    photos.js                  Visit photo upload/list/delete (Supabase Storage)
    logo.js                    Inline logo asset
```

## Getting started

This is a static site — any static file server works. A `.claude/launch.json` config is included for convenience:

```bash
npx serve -l 5566 .
```

Then open `http://localhost:5566/` for the dashboard, or `http://localhost:5566/nst/shops.html` directly.

There is no environment-variable setup: the Supabase project URL and **publishable** (anon) key are hardcoded in `nst/js/supabase-client.js` and inline in `map-v0.4.1.html`. This is safe by design — the anon key only grants access allowed by Row-Level Security policies. If you point this at a different Supabase project, update the key/URL in both places.

## Database schema

Core tables (Postgres, via Supabase):

| Table | Purpose |
|---|---|
| `shops` | Core shop records — name, status, address, region/county/district, lat/lng, contact info, sales rep, Google Places reference fields, `dataset_id` (FK, nullable) |
| `shop_datasets` | Named groupings of shops (`id`, `name`, `description`, `created_by`, `created_at`) |
| `visits` | Scheduled/completed visits, linked to a shop and a sales rep |
| `visit_photos` | Metadata for photos in the `visit-photos` storage bucket, linked to a visit |
| `scenarios` | Saved map planner states (layers/filters/view), private or team-shared |
| `user_directory` | A `view` over `auth.users` exposing only `id, email` to authenticated users — powers the sales-rep dropdown without needing service-role/admin API access |

All tables use Row-Level Security. General pattern: shops/visits are writable by their creator (`auth.uid() = created_by`), readable by any authenticated user; `shop_datasets` follows the same creator-owns-it pattern. `shops.dataset_id` is `on delete set null`, so deleting a dataset never deletes the shops in it.

Schema changes are applied by hand in the Supabase SQL editor, then checked in as a numbered file under `supabase/migrations/` — see that folder's README for the convention. This isn't wired up to any CLI/tooling; it's a plain historical record so the schema is reconstructable from the repo.

## CSV standard

Shared by both the map planner's candidate-shop import and the Shop DB's import/export:

**Columns:** `name, status, category, address, 縣市 (county), 鄉鎮市區 (district), 地區 (region), GISX (lng), GISY (lat), 座標狀態 (coord_status), google_name, google_address, google_place_id, google_rating, google_rating_count, business_status, contact_name, contact_phone, notes`

Only `name` + lat + lng are required; everything else is optional. Delimiter (comma or tab) is auto-detected. `dataset` is chosen in the import UI, not a CSV column.

**Status vocabulary** (7 stages, same hex colors in both tools):

```
尚未開發 (Not Developed, gray)
  → 電訪過 (Phone Contacted, blue)
    → 電訪過-拒絕 (Phone Contacted – Declined, orange)
    → 拜訪過 (Visited, teal)
      → 拜訪過-拒絕 (Visited – Declined, red)
      → 已合作 (Partnered, green)
        → 已合作-流失 (Partnered – Churned, purple)
```

If you add a status or column, update it in three places: `nst/js/shops.js` (`STATUS_LABELS`), `map-v0.4.1.html` (`STATUS_STYLE`, matching hex colors), and both tools' CSV parsers/dropdowns.

## Auth model

- Supabase Auth (email/password) with real user accounts (`Vic.Chen`, `Kamil.Wysocki`, `Cathy.Kuo`, etc.)
- The map planner and NST share a login session via a hand-rolled cache in `localStorage` (`nst-session-v1` / `nst-user-v1`), separate from the Supabase SDK's own storage, so signing into one signs you into the other without a shared domain/cookie
- Supabase silently rotates the refresh token on every use (including its own background auto-refresh). Both `nst/js/auth.js` and `map-v0.4.1.html` register `supabase.auth.onAuthStateChange` listeners that re-sync the shared cache on every change — **do not remove these**, it's the only thing keeping the cached session from going stale and silently breaking every RLS-gated write
- `requireAuth()`'s fallback path **awaits** re-establishing the Supabase client session (`setSession`) before resolving, so callers never query the DB as `anon` right after sign-in

## Versioning

The map planner keeps its last few released versions as separate files (`map-v0.4.0.html`, `map-v0.4.1.html`, …) rather than relying purely on git history, so the dashboard (`index.html`) can link directly to a specific past version for comparison or rollback. When cutting a new version:

1. Copy the current file to a new `map-vX.Y.Z.html`
2. Bump `APP_VERSION` / `BUILD_DATE` constants near the top of the script
3. Add a new card to `index.html`'s version list (and trim the oldest if there are more than ~3)

## Known gaps / next steps

- No automated tests — verification has been manual, via a local static server and live Supabase calls. The most valuable next step here is probably a separate dev/test Supabase project, since that's what would make automated smoke tests (and just general experimentation) safe to run without risking production data.
- "Only mine" is the only creator-based filter on the Shop DB; filtering to a *specific other* teammate's created shops isn't built (would need a small UI addition on top of the existing `user_directory` view)
- The two tools still build their own higher-level CSV row/shop objects on top of the shared tokenizer in `/shared/csv-parser.js` — only the low-level parsing is unified, not the full column-mapping logic. `map-v0.4.1.html` also still keeps its own copy of the region color palette (see the comment above its `REGIONS` object) since it's a classic script and the tradeoff of converting it to an ES module hasn't been worth it yet.
