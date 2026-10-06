// Turns a pasted Google Maps link into the fields NST needs for a new shop: name, exact
// coordinates, Google's CID (for a ?cid= listing link) and a road-level address.
//
// Long links (google.com/maps/place/名稱/@…!3d…!4d…) carry everything and are parsed locally.
// Short share links (maps.app.goo.gl/…) are just a redirect — a browser can't follow that
// cross-origin (no CORS), so they're resolved by the `resolve-maps-link` Supabase Edge Function
// (supabase/functions/resolve-maps-link/index.ts). If that function isn't deployed yet the caller
// gets a clear "paste the long link instead" error rather than a silent failure.
import { supabase } from './supabase-client.js';

const SHORT_HOSTS = ['maps.app.goo.gl', 'goo.gl'];

export function isShortMapsLink(url) {
  try { return SHORT_HOSTS.includes(new URL(url).hostname); } catch { return false; }
}

// Pure parsing of a full (already-resolved) Google Maps URL. Returns null if it has no usable place.
export function parseGoogleMapsUrl(raw) {
  let url;
  try { url = new URL(raw.trim()); } catch { return null; }
  // Google sometimes bounces through consent.google.com?continue=<real url>
  if (url.hostname === 'consent.google.com' && url.searchParams.get('continue')) {
    return parseGoogleMapsUrl(url.searchParams.get('continue'));
  }
  const href = url.href;
  let name = null;
  const pm = /\/maps\/place\/([^/@?]+)/.exec(url.pathname);
  if (pm) {
    try { name = decodeURIComponent(pm[1].replace(/\+/g, ' ')).trim(); } catch { name = pm[1]; }
  }
  // !3d<lat>!4d<lng> is the pin itself; @lat,lng is only the map viewport centre.
  let lat = null, lng = null;
  const pin = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(href);
  if (pin) { lat = parseFloat(pin[1]); lng = parseFloat(pin[2]); }
  if (lat == null) {
    const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(href);
    if (at) { lat = parseFloat(at[1]); lng = parseFloat(at[2]); }
  }
  if (lat == null) {
    const q = /[?&](?:q|query|ll)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i.exec(href);
    if (q) { lat = parseFloat(q[1]); lng = parseFloat(q[2]); }
  }
  if (lat == null || lng == null || lat < 20 || lat > 27 || lng < 117 || lng > 123) return null; // not in/near Taiwan
  // The place's CID = second half of the "0x<hex>:0x<hex>" feature id.
  let cid = null;
  const fm = /!1s0x[0-9a-f]+:0x([0-9a-f]+)/i.exec(href);
  if (fm) cid = BigInt('0x' + fm[1]).toString();
  return { name, lat, lng, cid, cidUrl: cid ? `https://www.google.com/maps?cid=${cid}` : null };
}

// Resolves any pasted link (short or long) to the parsed place.
export async function resolveMapsLink(input) {
  const text = (input || '').trim();
  if (!/^https?:\/\//i.test(text)) throw new Error('請貼上 Google 地圖分享連結（https://…）');
  let finalUrl = text;
  if (isShortMapsLink(text)) {
    const { data, error } = await supabase.functions.invoke('resolve-maps-link', { body: { url: text } });
    if (error || !data || !data.finalUrl) {
      throw new Error('短網址解析服務尚未啟用或失敗。請改用長網址：在瀏覽器開啟該短連結，複製網址列的完整網址（含 /maps/place/…）貼上即可。');
    }
    finalUrl = data.finalUrl;
  }
  const parsed = parseGoogleMapsUrl(finalUrl);
  if (!parsed) throw new Error('無法從此連結取得店家位置。請確認是「店家頁面」的分享連結（不是路線或搜尋結果）。');
  return parsed;
}

// Road-level address from OpenStreetMap (free, CORS-enabled). Google's own address needs a paid
// API key, so this deliberately returns only what OSM actually has — the caller composes it with
// the county/district from the township polygons and the user confirms the house number.
export async function reverseGeocodeRoad(lat, lng) {
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=zh-TW&zoom=18&lat=${lat}&lon=${lng}`;
    const r = await fetch(u);
    if (!r.ok) return null;
    const a = (await r.json()).address || {};
    return { road: a.road || a.pedestrian || null, houseNumber: a.house_number || null, postcode: a.postcode || null };
  } catch { return null; }
}
