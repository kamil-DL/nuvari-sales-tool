-- Reconstructed from production (mdznetxdongeinthqgtp.supabase.co) via information_schema /
-- pg_policies introspection on 2026-07-05 — this schema predates any file-tracked migration,
-- so it was never captured as SQL anywhere until now. Represents the schema as it stood
-- immediately before 0001 (sales_rep, user_directory) and 0002 (shop_datasets) were applied.
--
-- One fix applied here vs. production: shops.status's default was still the old 4-value
-- vocabulary's 'lead', left over from before the 7-value Chinese status vocabulary migration.
-- It never caused a visible bug because the app always sets status explicitly on insert, but
-- it's corrected here to '尚未開發' for consistency. If you're replaying this against
-- production to check for drift, expect that one difference.

create extension if not exists pgcrypto;

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_by_email text,
  is_shared boolean not null default false,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  status text not null default '尚未開發',
  contact_name text,
  contact_phone text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  region text,
  county text,
  district text,
  coord_status text,
  google_name text,
  google_address text,
  google_place_id text,
  google_rating numeric,
  google_rating_count integer,
  business_status text,
  category text
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  rep_id uuid not null references auth.users(id),
  scheduled_date date not null,
  status text not null default 'planned',
  review_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.visit_photos (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id),
  storage_path text not null,
  uploaded_at timestamptz default now()
);

alter table public.scenarios enable row level security;
alter table public.shops enable row level security;
alter table public.visits enable row level security;
alter table public.visit_photos enable row level security;

create policy "scenarios_select" on public.scenarios
  for select using (is_shared = true or created_by = auth.uid());
create policy "scenarios_insert" on public.scenarios
  for insert with check (created_by = auth.uid());
create policy "scenarios_update" on public.scenarios
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "scenarios_delete" on public.scenarios
  for delete using (created_by = auth.uid());

create policy "shops_select" on public.shops
  for select using (auth.role() = 'authenticated');
create policy "shops_insert" on public.shops
  for insert with check (auth.uid() = created_by);
create policy "shops_update" on public.shops
  for update using (auth.uid() = created_by);
create policy "shops_delete" on public.shops
  for delete using (auth.uid() = created_by);

create policy "visits_select" on public.visits
  for select using (auth.role() = 'authenticated');
create policy "visits_insert" on public.visits
  for insert with check (auth.uid() = rep_id);
create policy "visits_update" on public.visits
  for update using (auth.uid() = rep_id);
create policy "visits_delete" on public.visits
  for delete using (auth.uid() = rep_id);

create policy "visit_photos_select" on public.visit_photos
  for select using (auth.role() = 'authenticated');
create policy "visit_photos_insert" on public.visit_photos
  for insert with check (auth.uid() = (select visits.rep_id from public.visits where visits.id = visit_photos.visit_id));
create policy "visit_photos_delete" on public.visit_photos
  for delete using (auth.uid() = (select visits.rep_id from public.visits where visits.id = visit_photos.visit_id));
