-- Adds S / A / B / C as 拜訪優先級 (visit priority) values, alongside the existing P1/P2/P3.
-- Source: CEO's "Nuvari_298_Stores_Final_Clean.xlsx" priority logic —
--   S = YOYOBIKE 直攻店 · A = 捷安特/美利達專賣店 · B = DOSUN 店 · C = 其他車店
-- P1/P2/P3 stay valid so existing shops (and the 9月 campaign data) keep working; the column
-- is still a free, editable per-shop field in NST and the map. Same drop-and-recreate pattern as
-- 0011/0014/0015 — this CHECK isn't tracked by migration tooling, so it's re-stated in full.
alter table public.shops drop constraint if exists shops_priority_check;
alter table public.shops add constraint shops_priority_check check (
  priority is null or priority in ('S','A','B','C','P1','P2','P3')
);
