import { supabase } from './supabase-client.js';
import { fetchAllPages } from '../../shared/supabase-paginate.js';

export async function loadVisits({ shopId, repId, dateFrom, dateTo, status } = {}) {
  return fetchAllPages((from, to) => {
    let q = supabase.from('visits')
      .select('*, shops(name, address, status)')
      .order('scheduled_date', { ascending: false });
    if (shopId) q = q.eq('shop_id', shopId);
    if (repId) q = q.eq('rep_id', repId);
    if (dateFrom) q = q.gte('scheduled_date', dateFrom);
    if (dateTo) q = q.lte('scheduled_date', dateTo);
    if (status && status !== 'all') q = q.eq('status', status);
    return q.range(from, to);
  });
}

// One batched query for a shop-list view, rather than one query per shop.
// Returns { [shop_id]: { scheduled_date, status } } — the most recent visit per shop.
export async function loadLatestVisitsByShopIds(shopIds) {
  if (!shopIds.length) return {};
  const data = await fetchAllPages((from, to) =>
    supabase.from('visits')
      .select('shop_id, scheduled_date, status')
      .in('shop_id', shopIds)
      .order('scheduled_date', { ascending: false })
      .range(from, to)
  );
  const latest = {};
  for (const v of data) {
    if (!(v.shop_id in latest)) latest[v.shop_id] = v; // first hit per shop_id is the most recent, since already sorted desc
  }
  return latest;
}

export async function getVisit(id) {
  const { data, error } = await supabase.from('visits')
    .select('*, shops(id, name, address, status, contact_name, contact_phone)')
    .eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function addVisit(fields, userId) {
  const { data, error } = await supabase.from('visits').insert({
    ...fields,
    rep_id: userId
  }).select('*, shops(name, address, status)').single();
  if (error) throw error;
  return data;
}

export async function updateVisit(id, fields) {
  const { data, error } = await supabase.from('visits')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id).select('*, shops(id, name, address, status, contact_name, contact_phone)').single();
  if (error) throw error;
  return data;
}

export async function deleteVisit(id) {
  const { data, error } = await supabase.from('visits').delete().eq('id', id).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('刪除失敗：找不到符合的拜訪記錄，可能已被刪除或您沒有權限刪除 · Delete failed: no matching visit found — already deleted, or you don\'t have permission');
}

export const VISIT_STATUS_LABELS = {
  planned:   { zh: '已排程', en: 'Planned',   color: 'badge-blue' },
  completed: { zh: '已完成', en: 'Completed', color: 'badge-green' },
  no_show:   { zh: '未赴約', en: 'No Show',   color: 'badge-red' },
  cancelled: { zh: '已取消', en: 'Cancelled', color: 'badge-gray' },
};
