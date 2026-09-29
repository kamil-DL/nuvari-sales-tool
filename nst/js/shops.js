import { supabase } from './supabase-client.js';
import { fetchAllPages } from '../../shared/supabase-paginate.js';

export async function loadShops({ status, search, region, county, salesRep, priority, datasetId, onlyMine, meridaOemOnly, campaignId, userId } = {}) {
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
    // Only ever applied alongside the Merida dataset filter (see isMeridaDataset in
    // shops.html) — sells_merida_oem isn't meaningful outside Merida's dealer network.
    if (meridaOemOnly) q = q.eq('sells_merida_oem', true);
    if (campaignId === 'unassigned') q = q.is('campaign_id', null);
    else if (campaignId && campaignId !== 'all') q = q.eq('campaign_id', campaignId);
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
// marketing@datalake-tech.com is a real login but not a sales rep — excluded from rep dropdowns
// everywhere (kept in sync with map.html's own copy of this same exclusion/mapping).
const NON_REP_EMAILS = new Set(['marketing@datalake-tech.com']);

export async function loadUserDirectory() {
  const { data, error } = await supabase.from('user_directory').select('id, email').order('email');
  if (error) throw error;
  return (data || []).filter(u => !NON_REP_EMAILS.has(u.email));
}

// Simple first-name labels for the reps who actually run visits/day-plans, so dropdowns and
// badges read "Kamil" rather than "kamil.wysocki". Falls back to the pre-@ handle for anyone
// not in this map (a newly-added account before this list is updated, or historical data from
// an old rep no longer in user_directory).
const REP_DISPLAY_NAMES = {
  'kamil.wysocki@datalake-tech.com': 'Kamil',
  'rainlee@datalake-tech.com': 'Rain',
  'victor.luo@datalake-tech.com': 'Victor',
  'devin.yao@datalake-tech.com': 'Devin',
};

export function repLabel(email) {
  if (!email) return '';
  return REP_DISPLAY_NAMES[email] || email.split('@')[0];
}

// Per-rep accent colors for anything that needs to visually group by rep at a glance (campaign
// overview's day cards, calendar chips) — same 4 hex values the September campaign Artifact used
// (project_sept_campaign_artifact.md's REP_COLOR), carried over so returning users see the same
// rep=color association. Falls back to a neutral gray for any rep not in this map (an account
// added after this list, or the "未指派/unassigned" bucket).
export const REP_COLORS = {
  'rainlee@datalake-tech.com': '#137ECE',
  'devin.yao@datalake-tech.com': '#0B8E6A',
  'victor.luo@datalake-tech.com': '#B45309',
  'kamil.wysocki@datalake-tech.com': '#7C3AED',
};
export function repColor(email) {
  return REP_COLORS[email] || '#AEB4BD';
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

// Campaigns are time-boxed outreach drives (e.g. "2026年8月夥伴拓展計畫") — deliberately
// separate from both priority (a rep's standing "call first" ranking) and status (actual
// pipeline stage), so a drive can be tracked, filtered, and retired without touching either.
// Same shape as shop_datasets/dataset_id above.
export async function loadCampaigns() {
  const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCampaign(name, userId, fields = {}) {
  const { data, error } = await supabase.from('campaigns')
    .insert({ name, created_by: userId, ...fields })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateCampaign(id, fields) {
  const { data, error } = await supabase.from('campaigns')
    .update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCampaign(id) {
  const { data, error } = await supabase.from('campaigns').delete().eq('id', id).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('刪除失敗：找不到符合的計畫，可能已被刪除或您沒有權限刪除 · Delete failed: no matching campaign found — already deleted, or you don\'t have permission');
}

export async function countAllShopsByCampaign() {
  const rows = await fetchAllPages((from, to) =>
    supabase.from('shops').select('campaign_id').range(from, to)
  );
  const counts = {};
  rows.forEach(s => { if (s.campaign_id) counts[s.campaign_id] = (counts[s.campaign_id] || 0) + 1; });
  return counts;
}

export const STATUS_LABELS = {
  '尚未開發':    { zh: '尚未開發',    en: 'Not Developed',             color: 'badge-gray' },
  '電訪過':      { zh: '電訪過',      en: 'Phone Contacted',           color: 'badge-blue' },
  '電訪過-拒絕': { zh: '電訪過-拒絕', en: 'Phone Contacted (Declined)', color: 'badge-orange' },
  '拜訪過':      { zh: '拜訪過',      en: 'Visited',                   color: 'badge-teal' },
  '拜訪過-有意願': { zh: '拜訪過-有意願', en: 'Visited (Interested)',   color: 'badge-lime' },
  '拜訪過-評估中': { zh: '拜訪過-評估中', en: 'Visited (Undecided)',    color: 'badge-yellow' },
  '拜訪過-拒絕': { zh: '拜訪過-拒絕', en: 'Visited (Declined)',        color: 'badge-red' },
  '已合作':      { zh: '已合作',      en: 'Partnered',                 color: 'badge-green' },
  '已合作-有樣品': { zh: '已合作-有樣品', en: 'Partnered (Sample Installed)', color: 'badge-cyan' },
  '已合作-流失': { zh: '已合作-流失', en: 'Partnered (Churned)',       color: 'badge-purple' },
  // Inbound lead — the shop reached out wanting to partner, rather than us visiting/cold-calling
  // them. Sits outside the main 尚未開發→…→已合作 pipeline shape (no phone/visit step implied),
  // so it isn't nested under 拜訪過 like the other "-有意願" status.
  '主動要合作-有意願': { zh: '主動要合作-有意願', en: 'Inbound (Interested)', color: 'badge-pink' },
};

// Priority is independent of pipeline status — flags which shops to talk to first when
// planning. Same hex colors as the map planner's PRIORITY_COLORS (map.html), kept in sync
// manually since map.html is a classic script and can't import this.
export const PRIORITY_LABELS = {
  P1: { zh: 'P1', en: 'High priority', color: 'badge-red',    hex: '#D93025' },
  P2: { zh: 'P2', en: 'Medium priority', color: 'badge-orange', hex: '#E65100' },
  P3: { zh: 'P3', en: 'Low priority',  color: 'badge-yellow', hex: '#CA8A04' },
};

// 洽談結果 (negotiation outcome) — see 0016_add_shop_outcome.sql for why this is separate from
// STATUS_LABELS above. Null/undefined means "no outcome tagged yet", rendered as 待拜訪 in the UI
// but deliberately NOT stored as that value by default — so "never touched" stays distinguishable
// from "someone explicitly set it back to 待拜訪" if that ever matters later.
export const OUTCOME_LABELS = {
  '待拜訪':          { zh: '待拜訪',          en: 'Awaiting Visit',        color: 'badge-gray' },
  '拒絕':            { zh: '拒絕',            en: 'Declined',              color: 'badge-red' },
  '要考慮':          { zh: '要考慮',          en: 'Considering',           color: 'badge-yellow' },
  '要合作-等樣品':    { zh: '要合作-等樣品',    en: 'Partnering - Awaiting Sample', color: 'badge-blue' },
  '要合作-樣品待組裝': { zh: '要合作-樣品待組裝', en: 'Partnering - Sample Being Assembled', color: 'badge-lime' },
  '要合作-樣品裝好了': { zh: '要合作-樣品裝好了', en: 'Partnering - Sample Installed', color: 'badge-green' },
};
export const OUTCOME_OPTIONS = Object.keys(OUTCOME_LABELS);
