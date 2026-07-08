import { supabase } from './supabase-client.js';
import { fetchAllPages } from '../../shared/supabase-paginate.js';

export async function loadShops({ status, search, region, county, salesRep, priority, datasetId, onlyMine, userId } = {}) {
  return fetchAllPages((from, to) => {
    let q = supabase.from('shops').select('*').order('created_at', { ascending: false });
    if (status && status !== 'all') q = q.eq('status', status);
    if (search) q = q.ilike('name', `%${search}%`);
    if (region && region !== 'all') q = q.eq('region', region);
    if (county && county !== 'all') q = q.eq('county', county);
    if (salesRep && salesRep !== 'all') q = q.eq('sales_rep', salesRep);
    if (priority === 'none') q = q.is('priority', null);
    else if (priority && priority !== 'all') q = q.eq('priority', priority);
    if (datasetId === 'unassigned') q = q.is('dataset_id', null);
    else if (datasetId && datasetId !== 'all') q = q.eq('dataset_id', datasetId);
    if (onlyMine && userId) q = q.eq('created_by', userId);
    return q.range(from, to);
  });
}

// Used by CSV import's duplicate check — needs every existing shop's name/address/lat/lng
// to compare against, not just the first 1000.
export async function loadAllShopsForDupCheck() {
  return fetchAllPages((from, to) =>
    supabase.from('shops').select('name,address,lat,lng').range(from, to)
  );
}

export async function countAllShopsByDataset() {
  const rows = await fetchAllPages((from, to) =>
    supabase.from('shops').select('dataset_id').range(from, to)
  );
  const counts = {};
  rows.forEach(s => { if (s.dataset_id) counts[s.dataset_id] = (counts[s.dataset_id] || 0) + 1; });
  return counts;
}

export async function getShop(id) {
  const { data, error } = await supabase.from('shops').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function addShop(fields, userId) {
  const { data, error } = await supabase.from('shops').insert({
    ...fields,
    created_by: userId
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateShop(id, fields) {
  const { data, error } = await supabase.from('shops')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteShop(id) {
  // Supabase doesn't error when RLS silently filters a delete down to 0 matched rows (e.g.
  // deleting a shop you don't own) — it just "succeeds" having deleted nothing, which looks
  // identical to a real delete from the caller's side. Request the deleted row back and treat
  // an empty result as a failure so the UI doesn't wrongly report success.
  const { data, error } = await supabase.from('shops').delete().eq('id', id).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('刪除失敗：找不到符合的店家，可能已被刪除或您沒有權限刪除 · Delete failed: no matching shop found — already deleted, or you don\'t have permission');
}

// Sales reps are drawn from actual registered users (public.user_directory, a view over
// auth.users) rather than freeform text, so the dropdown always reflects who can actually log in.
export async function loadUserDirectory() {
  const { data, error } = await supabase.from('user_directory').select('id, email').order('email');
  if (error) throw error;
  return data;
}

export function repLabel(email) {
  return email ? email.split('@')[0] : '';
}

// Datasets group shops (e.g. one CSV import = one dataset) so imports don't all pile into
// one undifferentiated list, and so the map planner can load a specific subset.
export async function loadDatasets() {
  const { data, error } = await supabase.from('shop_datasets').select('*').order('name');
  if (error) throw error;
  return data;
}

export async function createDataset(name, description, userId) {
  const { data, error } = await supabase.from('shop_datasets')
    .insert({ name, description: description || null, created_by: userId })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateDataset(id, fields) {
  const { data, error } = await supabase.from('shop_datasets')
    .update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDataset(id) {
  const { data, error } = await supabase.from('shop_datasets').delete().eq('id', id).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('刪除失敗：找不到符合的資料集，可能已被刪除或您沒有權限刪除 · Delete failed: no matching dataset found — already deleted, or you don\'t have permission');
}

export const STATUS_LABELS = {
  '尚未開發':    { zh: '尚未開發',    en: 'Not Developed',             color: 'badge-gray' },
  '電訪過':      { zh: '電訪過',      en: 'Phone Contacted',           color: 'badge-blue' },
  '電訪過-拒絕': { zh: '電訪過-拒絕', en: 'Phone Contacted (Declined)', color: 'badge-orange' },
  '拜訪過':      { zh: '拜訪過',      en: 'Visited',                   color: 'badge-teal' },
  '拜訪過-拒絕': { zh: '拜訪過-拒絕', en: 'Visited (Declined)',        color: 'badge-red' },
  '已合作':      { zh: '已合作',      en: 'Partnered',                 color: 'badge-green' },
  '已合作-流失': { zh: '已合作-流失', en: 'Partnered (Churned)',       color: 'badge-purple' },
};

// Priority is independent of pipeline status — flags which shops to talk to first when
// planning. Same hex colors as the map planner's PRIORITY_COLORS (map.html), kept in sync
// manually since map.html is a classic script and can't import this.
export const PRIORITY_LABELS = {
  P1: { zh: 'P1', en: 'High priority', color: 'badge-red',    hex: '#D93025' },
  P2: { zh: 'P2', en: 'Medium priority', color: 'badge-orange', hex: '#E65100' },
  P3: { zh: 'P3', en: 'Low priority',  color: 'badge-blue',   hex: '#137ECE' },
};
