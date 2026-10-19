-- Sheet sync, step 3: also keep the master tab's 拜訪優先級 and 負責業務(298) in step with NST.
--  * a shop's priority / sales rep changed (NST shop page, map popup, bulk change) → the same shop's row
--    in the sheet gets the new value (together with its 拜訪日期, see 0020)
--  * a visit plan snapshot now also carries each shop's current sales rep (priority was already included)
-- Needs 0018, 0019 and 0020 first. Safe to run more than once; never blocks a save (failures only log a warning).

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
               'priority', sh.priority,
               'sales_rep', sh.sales_rep
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
    body := jsonb_build_object(
      'type', 'shop_date',
      'plan_id', 'shop:' || new.id::text,
      'shop_id', new.id,
      'name', new.name,
      'address', new.address,
      'old_date', old.visit_date,
      'new_date', new.visit_date,
      'old_priority', old.priority,
      'new_priority', new.priority,
      'old_rep', old.sales_rep,
      'new_rep', new.sales_rep,
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
create trigger sheet_sync_shop_date after update of visit_date, priority, sales_rep on public.shops
  for each row execute function public.sheet_sync_trg_shop_date();

revoke all on function public.sheet_sync_plan(uuid) from public, anon, authenticated;
