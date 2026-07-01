import { supabase } from './supabase-client.js';

export async function loadVisits({ shopId, repId, dateFrom, dateTo, status } = {}) {
  let q = supabase.from('visits')
    .select('*, shops(name, address, status)')
    .order('scheduled_date', { ascending: false });
  if (shopId) q = q.eq('shop_id', shopId);
  if (repId) q = q.eq('rep_id', repId);
  if (dateFrom) q = q.gte('scheduled_date', dateFrom);
  if (dateTo) q = q.lte('scheduled_date', dateTo);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
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
  const { error } = await supabase.from('visits').delete().eq('id', id);
  if (error) throw error;
}

export const VISIT_STATUS_LABELS = {
  planned:   { zh: '已排程', en: 'Planned',   color: 'badge-blue' },
  completed: { zh: '已完成', en: 'Completed', color: 'badge-green' },
  no_show:   { zh: '未赴約', en: 'No Show',   color: 'badge-red' },
  cancelled: { zh: '已取消', en: 'Cancelled', color: 'badge-gray' },
};
