-- Removes the public/private (is_shared) toggle for map Scenarios — every scenario is now
-- visible only to the account that created it, except kamil.wysocki@datalake-tech.com who can
-- see everyone's (so one person can review/help debug scenarios across the whole team without
-- everyone else's saved map setups being visible to each other). Insert/update/delete stay
-- creator-only (unchanged) — this only changes who can SEE a scenario. The is_shared column is
-- left in place (unused) rather than dropped, to avoid a destructive schema change; the app no
-- longer reads or writes it.
drop policy if exists "scenarios_select" on public.scenarios;
create policy "scenarios_select" on public.scenarios
  for select using (
    (auth.jwt() ->> 'email') = 'kamil.wysocki@datalake-tech.com' or created_by = auth.uid()
  );
