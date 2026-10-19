-- NST/map → Google Sheet: a shop's own 拜訪日期 (set in the map popup's edit form, shops.visit_date)
-- is mirrored to the sheet's 預計拜訪日(298) column, the same way planner visit plans are (0019).
-- Needs 0018 (shops.visit_date) and 0019 (sheet_sync_config) to be applied first. Safe to run more than once.
-- Never blocks the save: any failure is only logged as a warning.

create or replace function public.sheet_sync_trg_shop_date()
returns trigger
language plpgsql
security definer
set search_path = public, auth, net, extensions
as $$
declare
  cfg record;
begin
  if new.visit_date is not distinct from old.visit_date then
    return new;
  end if;
  select * into cfg from public.sheet_sync_config where id = 1;
  if not found then
    return new;   -- not configured → do nothing
  end if;

  perform net.http_post(
    url := cfg.webhook_url,
    body := jsonb_build_object(
      'type', 'shop_date',
      'plan_id', 'shop:' || new.id::text,   -- the script keys its stale-delivery check on this
      'shop_id', new.id,
      'name', new.name,
      'address', new.address,
      'old_date', old.visit_date,
      'new_date', new.visit_date,
      'version', (extract(epoch from clock_timestamp()) * 1000000)::bigint,
      'secret', cfg.secret
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  raise warning 'sheet_sync_trg_shop_date failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists sheet_sync_shop_date on public.shops;
create trigger sheet_sync_shop_date after update of visit_date on public.shops
  for each row execute function public.sheet_sync_trg_shop_date();
