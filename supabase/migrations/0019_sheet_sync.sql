-- NST → Google Sheet live mirror of visit plans (see tools/sheet-sync/README.md).
--
-- Whenever a visit plan or one of its stops changes, the database posts a complete snapshot of that
-- plan (date, rep, notes, and every stop with shop name / address / phone / county / priority) to a
-- Google Apps Script web app, which rewrites that plan's rows in the Sheet. A cancelled plan is
-- sent as "deleted" so its rows disappear. Sending
-- the whole plan each time (not a diff) makes it idempotent: reorders, removals and deletes all
-- fall out of "replace this plan's rows". `version` lets the script drop a stale snapshot that
-- arrives after a newer one (pg_net delivery order isn't guaranteed).
--
-- Nothing here can block saving a plan: every failure is caught and only logged as a warning.
-- Safe to run more than once.

create extension if not exists pg_net;

-- Where to post. One row only; RLS is on with NO policies, so the app (anon/authenticated keys)
-- can never read the secret — only the SECURITY DEFINER function below does.
create table if not exists public.sheet_sync_config (
  id int primary key default 1 check (id = 1),
  webhook_url text not null,
  secret text not null
);
alter table public.sheet_sync_config enable row level security;

create or replace function public.sheet_sync_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, net, extensions
as $$
declare
  cfg record;
  snap jsonb;
begin
  select * into cfg from public.sheet_sync_config where id = 1;
  if not found then return; end if;   -- not configured yet → do nothing

  select jsonb_build_object(
    'plan_id', p.id,
    'plan_date', p.plan_date,
    'rep', case u.email
             when 'kamil.wysocki@datalake-tech.com' then 'Kamil'
             when 'rainlee@datalake-tech.com' then 'Rain'
             when 'victor.luo@datalake-tech.com' then 'Victor'
             when 'devin.yao@datalake-tech.com' then 'Devin'
             when 'andrew.hsu@datalake-tech.com' then 'Andrew'
             when 'randy.huang@datalake-tech.com' then 'Randy'
             else coalesce(split_part(u.email, '@', 1), '')
           end,
    'plan_status', p.status,
    'plan_notes', p.notes,
    'version', (extract(epoch from clock_timestamp()) * 1000000)::bigint,
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order', s.stop_order,
               'name', sh.name,
               'county', sh.county,
               'district', sh.district,
               'address', sh.address,
               'phone', sh.contact_phone,
               'priority', sh.priority
             ) order by s.stop_order)
      from public.visit_plan_stops s
      join public.shops sh on sh.id = s.shop_id
      where s.visit_plan_id = p.id
    ), '[]'::jsonb)
  )
  into snap
  from public.visit_plans p
  left join auth.users u on u.id = p.rep_id
  where p.id = p_plan_id;

  if snap is null or (snap ->> 'plan_status') = 'cancelled' then   -- plan deleted or cancelled
    snap := jsonb_build_object(
      'plan_id', p_plan_id,
      'deleted', true,
      'version', (extract(epoch from clock_timestamp()) * 1000000)::bigint
    );
  end if;

  perform net.http_post(
    url := cfg.webhook_url,
    body := snap || jsonb_build_object('secret', cfg.secret),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  raise warning 'sheet_sync_plan failed: %', sqlerrm;
end;
$$;

-- Triggers --------------------------------------------------------------------------------------
create or replace function public.sheet_sync_trg_plans()
returns trigger language plpgsql security definer set search_path = public, auth, net, extensions as $$
begin
  if tg_op = 'DELETE' then
    perform public.sheet_sync_plan(old.id);
    return old;
  end if;
  perform public.sheet_sync_plan(new.id);
  return new;
end;
$$;

create or replace function public.sheet_sync_trg_stops()
returns trigger language plpgsql security definer set search_path = public, auth, net, extensions as $$
begin
  if tg_op = 'DELETE' then
    perform public.sheet_sync_plan(old.visit_plan_id);
    return old;
  end if;
  perform public.sheet_sync_plan(new.visit_plan_id);
  return new;
end;
$$;

drop trigger if exists sheet_sync_plans on public.visit_plans;
create trigger sheet_sync_plans after insert or update or delete on public.visit_plans
  for each row execute function public.sheet_sync_trg_plans();

drop trigger if exists sheet_sync_stops on public.visit_plan_stops;
create trigger sheet_sync_stops after insert or update or delete on public.visit_plan_stops
  for each row execute function public.sheet_sync_trg_stops();

-- (an earlier draft also mirrored visit reports; the sheet doesn't have those columns)
drop trigger if exists sheet_sync_visits on public.visits;
drop function if exists public.sheet_sync_trg_visits();

-- Manual full re-sync (run once after setup, or any time the Sheet gets out of step):
--   select public.sheet_sync_all();
create or replace function public.sheet_sync_all()
returns integer language plpgsql security definer set search_path = public, auth, net, extensions as $$
declare r record; n integer := 0;
begin
  for r in select id from public.visit_plans order by plan_date loop
    perform public.sheet_sync_plan(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Never let the browser keys call these directly.
revoke all on function public.sheet_sync_plan(uuid) from public, anon, authenticated;
revoke all on function public.sheet_sync_all() from public, anon, authenticated;
