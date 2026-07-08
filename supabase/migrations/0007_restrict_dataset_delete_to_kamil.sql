-- shop_datasets_delete was creator-only (auth.uid() = created_by) — same gap as shops_delete
-- had before 0005: anyone who created a dataset (e.g. ran a CSV import) could delete that
-- dataset entry themselves. Restrict to the same single gatekeeper as shop deletes, for the
-- same reason: one account in charge of destructive actions while everyone else keeps full
-- add/edit access. (Deleting a dataset doesn't delete its shops — they just become unassigned,
-- see 0002 — so this is about who can remove the dataset grouping itself.)
drop policy if exists "shop_datasets_delete" on public.shop_datasets;
create policy "shop_datasets_delete" on public.shop_datasets
  for delete using ((auth.jwt() ->> 'email') = 'kamil.wysocki@datalake-tech.com');
