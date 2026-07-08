-- Supabase's security advisor flagged public.user_directory (added in 0001) as
-- "auth_users_exposed": any view in an API-exposed schema that selects from auth.users gets
-- flagged automatically, regardless of which columns it selects — views run with the view
-- owner's privileges by default, which bypasses auth.users' own (service-role-only) lockdown.
--
-- Fix: replace the live view with a real table kept in sync via a trigger on auth.users, so
-- nothing queries auth.users directly through the API anymore. App code doesn't change —
-- `select id, email from user_directory` works identically against a table as a view.

drop view if exists public.user_directory;

create table if not exists public.user_directory (
  id uuid primary key references auth.users(id) on delete cascade,
  email text
);

alter table public.user_directory enable row level security;

create policy "user_directory_select" on public.user_directory
  for select using (auth.role() = 'authenticated');

-- security definer: runs as the function owner, so it can write to user_directory even though
-- the trigger fires from auth.users activity, not an authenticated user's own API request.
create or replace function public.sync_user_directory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_directory (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_upserted on auth.users;
create trigger on_auth_user_upserted
  after insert or update of email on auth.users
  for each row execute function public.sync_user_directory();

-- Backfill everyone who already has an account.
insert into public.user_directory (id, email)
select id, email from auth.users
on conflict (id) do update set email = excluded.email;
