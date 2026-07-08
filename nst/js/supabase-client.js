import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_ENV } from '../../shared/supabase-env.js';

// Beta and Stable (or dev vs prod generally) are served from the same origin, so a fixed
// storageKey would let the Supabase SDK's own session storage leak between environments —
// scope it by project so each keeps its own independent session (matching the env-scoped
// nst-session-v1/nst-user-v1 cache in nst/js/auth.js and map.html).
const envTag = SUPABASE_ENV.url.split('//')[1].split('.')[0];

export const supabase = createClient(
  SUPABASE_ENV.url,
  SUPABASE_ENV.key,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: `nst-auth-${envTag}`,
      storage: window.localStorage
    }
  }
);
