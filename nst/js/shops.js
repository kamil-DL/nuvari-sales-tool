import { supabase } from './supabase-client.js';

export async function loadShops({ status, search } = {}) {
  let q = supabase.from('shops').select('*').order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  if (search) q = q.ilike('name', `%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
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

export const STATUS_LABELS = {
  lead:     { zh: '潛在客戶', en: 'Lead',      color: 'badge-gray' },
  prospect: { zh: '準客戶',   en: 'Prospect',  color: 'badge-blue' },
  active:   { zh: '合作中',   en: 'Active',    color: 'badge-green' },
  churned:  { zh: '已流失',   en: 'Churned',   color: 'badge-red' },
};
