// Edge Function: resolve-maps-link
// Follows the redirect of a Google Maps share link (https://maps.app.goo.gl/…) and returns the final
// google.com/maps/place/… URL, which contains the shop's name, exact coordinates and CID.
// Browsers can't do this themselves (the short-link redirect has no CORS headers).
//
// Deploy: Supabase dashboard → Edge Functions → "Deploy a new function" → open the editor, name it
// `resolve-maps-link`, paste this file, Deploy. Keep "Verify JWT" ON — only signed-in NST/map users can call it.
//
// Safety: only Google hosts are ever fetched (no open proxy / SSRF), max 6 hops.

const ALLOWED = new Set([
  "maps.app.goo.gl", "goo.gl", "www.google.com", "google.com", "maps.google.com", "consent.google.com",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { url } = await req.json();
    let cur = new URL(url);
    if (!ALLOWED.has(cur.hostname)) return json({ error: "host not allowed" }, 400);
    for (let i = 0; i < 6; i++) {
      const res = await fetch(cur.toString(), { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, cur);
        if (!ALLOWED.has(next.hostname)) break; // never leave Google
        cur = next;
        continue;
      }
      break;
    }
    return json({ finalUrl: cur.toString() });
  } catch (e) {
    return json({ error: String(e) }, 400);
  }
});
