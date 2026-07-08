// Single trusted gatekeeper for shop deletes. The whole team can add/edit shops (and bulk-edit
// status/sales rep/priority), but only one account can delete them — after an incident where a
// stale session made it look like every shop had been wiped, and with the whole team about to
// start using the tool for real, a single accidental multi-select delete is the one mistake
// that's hard to walk back. Enforced server-side too, not just here — see
// supabase/migrations/0005_restrict_shop_delete_to_kamil.sql. This is only so the UI doesn't
// show a delete control that would silently fail (via RLS) for everyone else.
//
// map.html is a classic (non-module) script and keeps its own copy of this constant — if this
// email ever changes, update both places.
export const SHOP_DELETE_ALLOWED_EMAIL = 'kamil.wysocki@datalake-tech.com';

export function canDeleteShops(email) {
  return email === SHOP_DELETE_ALLOWED_EMAIL;
}
