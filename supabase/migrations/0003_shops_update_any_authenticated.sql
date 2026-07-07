-- shops_update was creator-only (auth.uid() = created_by), same as delete. That made sense for
-- shops a rep personally added, but every bulk-imported shop (crawler CSVs, admin imports) is
-- owned by whichever single account ran the import — meaning no other team member could ever
-- edit those rows' status/sales_rep/notes through the app, on the map's new inline-edit popup
-- or the pre-existing NST Shop DB edit form. The whole team needs to update the same shared
-- shop list, not just rows they happen to have created.
--
-- Loosen update to match the existing select policy (any authenticated user); leave delete
-- creator-only as a safety guard against accidental mass deletion.
drop policy if exists "shops_update" on public.shops;
create policy "shops_update" on public.shops
  for update using (auth.role() = 'authenticated');
