-- Adds shop_datasets: named groupings of shops (e.g. one per CSV import, or a research
-- set), with shops.dataset_id as a nullable FK. Deleting a dataset never deletes the
-- shops in it (on delete set null) — they just become unassigned.

create table if not exists public.shop_datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.shop_datasets enable row level security;

create policy "shop_datasets_select" on public.shop_datasets
  for select using (auth.role() = 'authenticated');

create policy "shop_datasets_insert" on public.shop_datasets
  for insert with check (auth.uid() = created_by);

create policy "shop_datasets_update" on public.shop_datasets
  for update using (auth.uid() = created_by);

create policy "shop_datasets_delete" on public.shop_datasets
  for delete using (auth.uid() = created_by);

alter table public.shops
  add column if not exists dataset_id uuid references public.shop_datasets(id) on delete set null;
