// Supabase/RLS errors surface as cryptic raw Postgres text (e.g. "new row violates row-level
// security policy for table ...") that doesn't explain why. In practice this has almost always
// meant the user's auth session went stale (token expired without any visible sign-out) — the
// UI still looks logged in, so a normal-looking action just fails with a confusing message.
// Detect that class of error and append an actionable hint pointing at the real fix.
export function friendlyError(e) {
  const msg = e?.message || String(e);
  if (/row-level security policy/i.test(msg) || e?.code === '42501') {
    return `${msg} — 這通常代表登入已過期，請登出後重新登入再試一次 · This usually means your session expired — sign out and back in, then retry.`;
  }
  return msg;
}
