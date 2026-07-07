import { supabase } from './supabase-client.js';

const BUCKET = 'visit-photos';

export async function uploadPhoto(visitId, file) {
  const ext = file.name.split('.').pop();
  const path = `${visitId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  const { error: dbErr } = await supabase.from('visit_photos').insert({
    visit_id: visitId,
    storage_path: path
  });
  if (dbErr) throw dbErr;
  return path;
}

export async function listPhotos(visitId) {
  const { data, error } = await supabase.from('visit_photos')
    .select('*').eq('visit_id', visitId).order('uploaded_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getSignedUrl(path, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function deletePhoto(photoId, storagePath) {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { data, error } = await supabase.from('visit_photos').delete().eq('id', photoId).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('刪除失敗：找不到符合的照片，可能已被刪除或您沒有權限刪除 · Delete failed: no matching photo found — already deleted, or you don\'t have permission');
}
