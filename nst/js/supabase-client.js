import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase = createClient(
  'https://mdznetxdongeinthqgtp.supabase.co',
  'sb_publishable_EUskeusj4mfPYeJUuDJIcQ_fHbBHPS9',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'nst-auth',
      storage: window.localStorage
    }
  }
);
