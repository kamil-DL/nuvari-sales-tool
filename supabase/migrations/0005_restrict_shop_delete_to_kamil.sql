-- shops_delete was creator-only (auth.uid() = created_by) — fine when one person tested the
-- app alone, but risky now that the whole team is starting to use it for real: any rep can
-- delete rows they happen to have created (including bulk imports run under their account),
-- and a single accidental multi-select delete is hard to walk back. Restrict delete to one
-- trusted gatekeeper instead, regardless of who created the row. Insert/update stay
-- any-authenticated (see 0003) so the team can still add and edit shops freely — only delete
-- is locked down.
drop policy if exists "shops_delete" on public.shops;
create policy "shops_delete" on public.shops
  for delete using ((auth.jwt() ->> 'email') = 'kamil.wysocki@datalake-tech.com');
