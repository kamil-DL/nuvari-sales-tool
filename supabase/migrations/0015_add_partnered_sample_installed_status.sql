-- Adds 已合作-有樣品 (Partnered - Sample Installed) as an 11th status: a shop that's an active
-- partner AND currently has a physical Nuvari GO/Ultra demo sample installed for customer
-- test rides (confirmed via Nuvari's own website Store Finder widget) — distinct from plain
-- 已合作 so the sample-installed subset stays queryable on its own. Same drop-and-recreate
-- pattern as 0011_expand_status_check_constraint.sql / 0014_add_inbound_interested_status.sql —
-- this CHECK constraint isn't tracked by Postgres migrations tooling, it's just re-stated here
-- in full each time the vocabulary grows.
alter table public.shops drop constraint if exists shops_status_check;
alter table public.shops add constraint shops_status_check check (status in (
  '尚未開發','電訪過','電訪過-拒絕','拜訪過','拜訪過-有意願','拜訪過-評估中','拜訪過-拒絕','已合作','已合作-有樣品','已合作-流失',
  '主動要合作-有意願'
));
