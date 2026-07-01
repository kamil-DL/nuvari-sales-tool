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
  const { error } = await supabase.from('visit_photos').delete().eq('id', photoId);
  if (error) throw error;
}
