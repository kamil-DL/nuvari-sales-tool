import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_ENV } from '../../shared/supabase-env.js';

export const supabase = createClient(
  SUPABASE_ENV.url,
  SUPABASE_ENV.key,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'nst-auth',
      storage: window.localStorage
    }
  }
);
