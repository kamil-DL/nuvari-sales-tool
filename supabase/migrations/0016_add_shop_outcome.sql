-- 洽談結果 (negotiation outcome) — a per-shop follow-up field distinct from both shops.status
-- (the pipeline stage: 尚未開發→電訪過/拜訪過→…→已合作) and priority (a rep's standing
-- "call this one first" ranking). This tracks what happened on/after a visit, at a finer grain
-- than status captures — in particular the physical-sample-logistics steps ("waiting on a
-- sample" vs "sample being assembled" vs "sample installed") that only 已合作-有樣品 gestures at
-- on the status side. Ported from the September campaign Artifact's OUTCOME concept
-- (project_sept_campaign_artifact.md), where it lived as a separate shopId->outcome map;
-- here it's just a nullable column on shops since NST already keys everything off real shop rows.
--
-- Same drop-and-recreate-in-full pattern as shops_status_check
-- (0011/0014/0015_*_status.sql) — Postgres CHECK constraints aren't tracked by any migration
-- tooling here, so the full vocabulary is re-stated each time it changes.
alter table public.shops add column if not exists outcome text;

alter table public.shops drop constraint if exists shops_outcome_check;
alter table public.shops add constraint shops_outcome_check check (outcome is null or outcome in (
  '待拜訪','拒絕','要考慮','要合作-等樣品','要合作-樣品待組裝','要合作-樣品裝好了'
));

-- No RLS change needed — shops_update (0003_shops_update_any_authenticated.sql) already allows
-- any authenticated user to update any shop row, which is exactly the access this field needs
-- (any rep can tag any shop's outcome, same as they can change its status today).
