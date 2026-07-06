import { supabase } from './supabase-client.js';

// PostgREST caps any single query at 1000 rows by default — a plain .select() silently
// truncates past that. Page through with .range() until a page comes back short, same fix
// as the map planner's fetchAllShopsForDataset(). Any query that can return >1000 rows
// (this one, and the dataset-count tally in shops.html's openDatasetsModal) needs this.
async function fetchAllPages(buildQuery) {
  const PAGE_SIZE = 1000;
  let offset = 0, all = [];
  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

export async function loadShops({ status, search, region, county, salesRep, datasetId, onlyMine, userId } = {}) {
  return fetchAllPages((from, to) => {
    let q = supabase.from('shops').select('*').order('created_at', { ascending: false });
    if (status && status !== 'all') q = q.eq('status', status);
    if (search) q = q.ilike('name', `%${search}%`);
    if (region && region !== 'all') q = q.eq('region', region);
    if (county && county !== 'all') q = q.eq('county', county);
    if (salesRep && salesRep !== 'all') q = q.eq('sales_rep', salesRep);
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
  const { error } = await supabase.from('shops').delete().eq('id', id);
  if (error) throw error;
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
  const { error } = await supabase.from('shop_datasets').delete().eq('id', id);
  if (error) throw error;
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
