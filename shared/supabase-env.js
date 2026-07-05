// Which Supabase project to use, switched automatically by hostname so nobody has to
// remember to flip a flag: running locally (npx serve, localhost/127.0.0.1) always talks
// to the dev/test project; anywhere else (the real deployed domain) talks to production.
//
// map-v0.4.1.html is a classic (non-module) script and can't import this synchronously
// where it creates its client, so it keeps its own copy of this same hostname check —
// if you rotate a key or add another environment, update both places.

const PROD = { url: 'https://mdznetxdongeinthqgtp.supabase.co', key: 'sb_publishable_EUskeusj4mfPYeJUuDJIcQ_fHbBHPS9' };
const DEV  = { url: 'https://iytzwajjacmuffebuuzd.supabase.co', key: 'sb_publishable_F6xTfWNcQflW305r0iw37Q_ZBf91uDy' };

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const SUPABASE_ENV = isLocal ? DEV : PROD;
