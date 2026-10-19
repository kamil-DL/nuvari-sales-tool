-- Sheet sync, step 4: when a shop's date / priority / sales rep is synced, also send the shop's CURRENT
-- priority, sales rep, phone and county, so the script can fill in cells that are still empty in the
-- master tab (shops that weren't in the original sheet have no priority / rep / phone there).
-- The script only fills EMPTY cells — it never overwrites what the team typed.
-- Also adds a one-off backfill: select public.sheet_sync_shop_dates();   (re-sends every shop that has a 拜訪日期)
-- Needs 0018–0021 first. Safe to run more than once.

create or replace function public.sheet_sync_shop_payload(s public.shops, old_s public.shops)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'type', 'shop_date',
    'plan_id', 'shop:' || s.id::text,
    'shop_id', s.id,
    'name', s.name,
    'address', s.address,
    'old_date', old_s.visit_date,
    'new_date', s.visit_date,
    'old_priority', old_s.priority,
    'new_priority', s.priority,
    'old_rep', old_s.sales_rep,
    'new_rep', s.sales_rep,
    'priority', s.priority,
    'sales_rep', s.sales_rep,
    'phone', s.contact_phone,
    'county', s.county,
    'version', (extract(epoch from clock_timestamp()) * 1000000)::bigint
  );
$$;

create or replace function public.sheet_sync_trg_shop_date()
returns trigger
language plpgsql
security definer
set search_path = public, auth, net, extensions
as $$
declare
  cfg record;
begin
  if new.visit_date is not distinct from old.visit_date
     and new.priority is not distinct from old.priority
     and new.sales_rep is not distinct from old.sales_rep then
    return new;
  end if;
  select * into cfg from public.sheet_sync_config where id = 1;
  if not found then
    return new;
  end if;
  perform net.http_post(
    url := cfg.webhook_url,
    body := public.sheet_sync_shop_payload(new, old) || jsonb_build_object('secret', cfg.secret),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  raise warning 'sheet_sync_trg_shop_date failed: %', sqlerrm;
  return new;
end;
$$;

-- One-off: re-send every shop that has a visit date so its blanks get filled (date stays as it is).
create or replace function public.sheet_sync_shop_dates()
returns integer
language plpgsql
security definer
set search_path = public, auth, net, extensions
as $$
declare
  cfg record;
  r public.shops;
  n integer := 0;
begin
  select * into cfg from public.sheet_sync_config where id = 1;
  if not found then
    return 0;
  end if;
  for r in select * from public.shops where visit_date is not null loop
    perform net.http_post(
      url := cfg.webhook_url,
      body := public.sheet_sync_shop_payload(r, r) || jsonb_build_object('secret', cfg.secret),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.sheet_sync_shop_dates() from public, anon, authenticated;
