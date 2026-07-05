# Architecture overview

A snapshot of how Nuvari Sales Tool is put together as of 2026-07-05 — what talks to what, and where things are stored. See [README.md](README.md) for setup/usage; this doc is about the shape of the system.

## The big picture

```
Browser
  ├── index.html ................ root dashboard, links to both tools
  ├── map.html ............ Dealer Coverage Map (single file, classic <script>)
  └── nst/ ....................... Shop DB & Visit Planner (multi-page, ES modules)
        ├── index.html, shops.html, shop-detail.html, visits.html, visit-detail.html
        ├── css/nst-shared.css
        └── js/ (auth.js, shops.js, visits.js, photos.js, logo.js, supabase-client.js)

shared/ .......................... logic used by BOTH map.html and nst/
  ├── csv-parser.js ............... low-level CSV/TSV tokenizer
  ├── region-colors.js ............ canonical region color palette
  ├── geo.js + taiwan-towns.js .... point-in-polygon region/county/district lookup
  └── supabase-env.js ............. picks prod vs. dev/test Supabase project by hostname

supabase/migrations/ ............. numbered SQL files, the schema's source of truth

Backend: Supabase (hosted, no custom server)
  ├── Postgres tables: shops, shop_datasets, visits, visit_photos, scenarios
  ├── Auth: email/password, invite-only (no self-signup in the app)
  └── Storage: visit-photos bucket
```

There is no build step and no custom backend server anywhere — every page is opened directly by a browser, and the only "backend" is Supabase's hosted services.

## Two Supabase projects (production vs. dev/test)

As of 2026-07-05 there are **two separate Supabase projects**, fully isolated from each other (separate databases, separate user accounts, separate everything):

| | Production | Dev/test |
|---|---|---|
| URL | `mdznetxdongeinthqgtp.supabase.co` | `iytzwajjacmuffebuuzd.supabase.co` |
| Used when | app is opened on the real deployed domain | app is opened via `localhost`/`127.0.0.1` (i.e. the local static server) |
| Data | real shops, visits, team accounts | empty/test data, safe to break |

**The switch is automatic, not a setting you toggle.** Both `nst/js/supabase-client.js` and `map.html` check `window.location.hostname` at startup (`shared/supabase-env.js` is the canonical version; the map keeps its own copy since it's a classic script and can't import synchronously). Anyone visiting the real deployed site always hits production — this only affects local development.

**Login sessions are also environment-tagged.** A cached session now records which Supabase project it was issued by (`nst-session-project-v1` in `localStorage`). If you switch between testing prod and dev locally, a mismatched cached session is detected and cleared automatically, forcing a clean re-login instead of silently failing every write with an RLS error (this bit us once already — see `nst/js/auth.js`'s `isCachedSessionStale()`).

## Database schema

Five tables, all with Row-Level Security enabled:

| Table | Holds | Access pattern |
|---|---|---|
| `shops` | Core shop records: name, status, address, region/county/district, lat/lng, contact info, sales rep, Google Places fields, `dataset_id` | Any authenticated user can read; only the creator (`auth.uid() = created_by`) can write/delete |
| `shop_datasets` | Named groupings of shops (one per CSV import, or a research set) | Same creator-owns-it pattern. Deleting a dataset never deletes its shops — `dataset_id` is `on delete set null` |
| `visits` | Scheduled/completed visits, linked to a shop and a rep | Creator (`rep_id`) owns write access |
| `visit_photos` | Metadata for photos in the `visit-photos` storage bucket | Tied to the visit's rep |
| `scenarios` | Saved map planner states (layers/filters/view) | Private by default, or shared to the whole team via `is_shared` |

Plus one **view**, `user_directory` — exposes just `id, email` from `auth.users` to any authenticated user, so the Shop DB's sales-rep dropdown can be populated from real accounts without needing service-role/admin API access.

The full schema (every column, every RLS policy) is reconstructable from `supabase/migrations/*.sql`, run in numeric order. That folder is the only place the schema is written down outside the Supabase dashboard itself.

## How the two tools connect to each other

- **Shared login** — signing into one tool signs you into the other, via a hand-rolled session cache in `localStorage` (`nst-session-v1` / `nst-user-v1` / `nst-session-project-v1`), separate from the Supabase SDK's own storage.
- **Shared CSV standard** — same column set and 7-stage status vocabulary on both sides, so an export from either tool re-imports cleanly into the other. The low-level parsing (`shared/csv-parser.js`) is a single shared function now; each tool still builds its own higher-level row objects on top of it.
- **Map reads Shop DB data directly** — the map planner's "Load from Shop DB" button queries `shops`/`shop_datasets` straight from Supabase, optionally filtered to one named dataset, and turns the result into a map layer. This is one-directional (map reads Shop DB data; it doesn't write back).
- **Region auto-fill** — `shared/geo.js` does point-in-polygon lookup against Taiwan township boundaries (`shared/taiwan-towns.js`) to derive region/county/district from a shop's lat/lng. Used by the Shop DB's CSV import and its "Auto-fill regions" backfill button. The map planner doesn't use this yet (it has its own, longer-standing boundary data for the choropleth).

## What's *not* shared (known duplication)

- `map.html`'s own `REGIONS` object (colors for the choropleth) is a manually-kept-in-sync copy of `shared/region-colors.js` — the map is a classic script and can't import synchronously where that object is defined and immediately used.
- Each tool still has its own higher-level CSV row-to-shop-object mapping, on top of the one shared tokenizer.

Both are called out with a comment at the point of duplication in the code, so future changes know to update both sides.
