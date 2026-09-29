import { supabase } from './supabase-client.js';
import { fetchAllPages } from '../../shared/supabase-paginate.js';

// List view: one row per plan, with just stop ids (not the full shop join) — cheap enough to
// load a rep's whole month at once; callers use .length for the stop count. Deliberately not
// using PostgREST's embedded-resource `count` aggregate here (unverified against this project's
// PostgREST version) — plain embedded rows are the same pattern countAllShopsByDataset/
// countAllShopsByCampaign already rely on elsewhere in shops.js.
export async function loadPlans({ repId, dateFrom, dateTo, campaignId } = {}) {
  return fetchAllPages((from, to) => {
    let q = supabase.from('visit_plans')
      .select('*, visit_plan_stops(id)')
      .order('plan_date', { ascending: true });
    if (repId) q = q.eq('rep_id', repId);
    if (dateFrom) q = q.gte('plan_date', dateFrom);
    if (dateTo) q = q.lte('plan_date', dateTo);
    if (campaignId && campaignId !== 'all') q = q.eq('campaign_id', campaignId);
    return q.range(from, to);
  });
}

// Detail view: the plan plus its stops in order, each stop carrying enough shop fields to render
// a card, build a route, and open a Google Maps link — mirrors SHOP_FETCH_COLUMNS's spirit in
// map.html (only what's actually rendered, not select('*') on every shop).
export async function getPlan(id) {
  const { data, error } = await supabase.from('visit_plans')
    .select(`*, visit_plan_stops(
      id, stop_order, visit_id,
      shops (id, name, address, lat, lng, county, region, status, priority, outcome, google_place_id, contact_phone)
    )`)
    .eq('id', id).single();
  if (error) throw error;
  data.visit_plan_stops.sort((a, b) => a.stop_order - b.stop_order);
  return data;
}

// Overview page (campaign-overview.html): every plan in a campaign (or matching the given
// filters) WITH its full stop/shop details in one round trip — unlike loadPlans() above, which
// only carries stop ids/counts for the cheap flat list. Used to render every rep's whole
// campaign at a glance without an N+1 getPlan() per card.
export async function loadPlansWithStops({ repId, dateFrom, dateTo, campaignId } = {}) {
  const plans = await fetchAllPages((from, to) => {
    let q = supabase.from('visit_plans')
      .select(`*, visit_plan_stops(
        id, stop_order, visit_id,
        shops (id, name, address, lat, lng, county, region, status, priority, outcome, google_place_id, contact_phone)
      )`)
      .order('plan_date', { ascending: true });
    if (repId) q = q.eq('rep_id', repId);
    if (dateFrom) q = q.gte('plan_date', dateFrom);
    if (dateTo) q = q.lte('plan_date', dateTo);
    if (campaignId && campaignId !== 'all') q = q.eq('campaign_id', campaignId);
    return q.range(from, to);
  });
  plans.forEach(p => p.visit_plan_stops.sort((a, b) => a.stop_order - b.stop_order));
  return plans;
}

export async function createPlan(fields, userId) {
  const { data, error } = await supabase.from('visit_plans').insert({
    ...fields,
    created_by: userId,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updatePlan(id, fields) {
  const { data, error } = await supabase.from('visit_plans')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePlan(id) {
  // Same "RLS silently filters to 0 rows rather than erroring" trap as shops.js/visits.js —
  // request the deleted row back and treat an empty result as a failed delete.
  const { data, error } = await supabase.from('visit_plans').delete().eq('id', id).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('刪除失敗：找不到符合的計劃，可能已被刪除或您沒有權限刪除 · Delete failed: no matching plan found — already deleted, or you don\'t have permission');
}

export async function addStop(planId, shopId, stopOrder) {
  const { data, error } = await supabase.from('visit_plan_stops')
    .insert({ visit_plan_id: planId, shop_id: shopId, stop_order: stopOrder })
    .select('id, stop_order, visit_id, shops(id, name, address, lat, lng, county, region, status, priority, google_place_id, contact_phone)')
    .single();
  if (error) throw error;
  return data;
}

export async function removeStop(stopId) {
  const { error } = await supabase.from('visit_plan_stops').delete().eq('id', stopId);
  if (error) throw error;
}

// Persists a full reorder in one round trip's worth of parallel updates. Called with the stop
// ids in their new order; each stop's stop_order is set to its index. Small day-plan sizes
// (3-5 stops) make per-row updates fine — no need for a bulk-upsert RPC.
export async function reorderStops(stopIdsInOrder) {
  await Promise.all(stopIdsInOrder.map((id, i) =>
    supabase.from('visit_plan_stops').update({ stop_order: i }).eq('id', id)
  ));
}

export async function linkStopToVisit(stopId, visitId) {
  const { error } = await supabase.from('visit_plan_stops').update({ visit_id: visitId }).eq('id', stopId);
  if (error) throw error;
}

export const PLAN_STATUS_LABELS = {
  planned:   { zh: '規劃中', en: 'Planned',   color: 'badge-blue' },
  completed: { zh: '已完成', en: 'Completed', color: 'badge-green' },
  cancelled: { zh: '已取消', en: 'Cancelled', color: 'badge-gray' },
};
