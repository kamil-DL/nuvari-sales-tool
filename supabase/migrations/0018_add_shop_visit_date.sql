-- Adds shops.visit_date — the planned/actual date a rep visits a shop. Set from the map tool's
-- shop popup (編輯 → 拜訪日期) and included in the "匯出 Excel" output next to the CEO master-list
-- columns. Plain date (no time zone); null = no visit date set.
alter table public.shops add column if not exists visit_date date;
