// Which Supabase project to use, switched automatically by hostname so nobody has to
// remember to flip a flag: running locally (npx serve, localhost/127.0.0.1) always talks
// to the dev/test project; anywhere else (the real deployed domain) talks to production.
//
// A deployed (non-local) URL can also be pointed at the dev project with a ?env=dev query
// param — for testing a live/pushed build (e.g. the dashboard's Beta cards) without touching
// production shop/visit data. This "sticks" for the rest of the browser tab's session
// (sessionStorage) so navigating from a Beta landing page into Shop DB/Visits/etc. — separate
// page loads that wouldn't otherwise carry the query param — still uses dev data. ?env=prod
// explicitly clears that stickiness (the dashboard's Stable cards use this, so clicking Stable
// after Beta in the same tab doesn't stay stuck on dev data). IS_STAGING flags the dev-forced
// case so callers can show a "not production data" warning; a fixed on-page banner is injected
// below for the same reason.
//
// map.html is a classic (non-module) script and can't import this synchronously where it
// creates its client, so it keeps its own copy of this same logic — if you rotate a key,
// add another environment, or change this override, update both places.

const PROD = { url: 'https://mdznetxdongeinthqgtp.supabase.co', key: 'sb_publishable_EUskeusj4mfPYeJUuDJIcQ_fHbBHPS9' };
const DEV  = { url: 'https://iytzwajjacmuffebuuzd.supabase.co', key: 'sb_publishable_F6xTfWNcQflW305r0iw37Q_ZBf91uDy' };

const STAGING_KEY = 'nuvari_staging_env';
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const envParam = new URLSearchParams(window.location.search).get('env'); // 'dev' | 'prod' | null
try {
  if (envParam === 'dev') sessionStorage.setItem(STAGING_KEY, '1');
  else if (envParam === 'prod') sessionStorage.removeItem(STAGING_KEY);
} catch {}
let stickyForcedDev = false;
try { stickyForcedDev = sessionStorage.getItem(STAGING_KEY) === '1'; } catch {}
const forcedDev = envParam === 'dev' || stickyForcedDev;

export const SUPABASE_ENV = (isLocal || forcedDev) ? DEV : PROD;
export const IS_STAGING = forcedDev && !isLocal;

if (IS_STAGING) {
  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.textContent = '⚠ DEV DATA MODE (?env=dev) — not production data';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#E0584A;color:#fff;text-align:center;font:700 12px/1.4 sans-serif;padding:6px 8px;';
    document.body.prepend(banner);
  });
}
