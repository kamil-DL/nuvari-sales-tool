-- Sales planning needs a way to flag which shops to talk to first, independent of pipeline
-- status (a shop can be "尚未開發" and still be P1 — high priority just means "call this one
-- before the others"). Nullable so existing/most shops are simply unprioritized rather than
-- forced into a default tier.
alter table public.shops add column if not exists priority text;
alter table public.shops add constraint shops_priority_check check (priority is null or priority in ('P1','P2','P3'));
