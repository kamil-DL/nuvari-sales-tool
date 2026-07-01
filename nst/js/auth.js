import { supabase } from './supabase-client.js';
import { LOGO } from './logo.js';

const SESSION_KEY = 'nst-session-v1';
const USER_KEY    = 'nst-user-v1';

function saveSession(session, user) {
  if (session?.access_token) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token:  session.access_token,
      refresh_token: session.refresh_token
    }));
  }
  if (user?.id) {
    localStorage.setItem(USER_KEY, JSON.stringify({ id: user.id, email: user.email }));
  }
}

function loadUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}
function loadTokens() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

function clearAll() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('nst-auth');
  // Clear any Supabase default storage keys
  const sbKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('sb-')) sbKeys.push(k);
  }
  sbKeys.forEach(k => localStorage.removeItem(k));
}

// Restore Supabase client auth state in background so DB queries work
async function restoreClientSession() {
  const tokens = loadTokens();
  if (!tokens) return;
  const { error } = await supabase.auth.setSession(tokens);
  if (error) {
    // Try refresh
    const { data, error: re } = await supabase.auth.refreshSession({ refresh_token: tokens.refresh_token });
    if (!re && data.session) saveSession(data.session, data.session.user);
  }
}

let _resolveAuth = null;

function injectModal() {
  if (document.getElementById('nst-auth-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'nst-auth-modal';
  modal.innerHTML = `
<div class="nst-auth-backdrop">
  <div class="nst-auth-box">
    <img id="nst-auth-logo" class="nst-auth-logo" alt="Nuvari"/>
    <div id="nst-auth-signin">
      <div class="nst-auth-title">歡迎來到Nuvari業務工具套件</div>
      <div class="nst-auth-sub">Welcome to the Nuvari Sales Tool</div>
      <div class="nst-auth-sub">請登入以繼續 · Sign in to continue</div>
      <label class="nst-field-label">電子郵件 Email</label>
      <input id="nst-auth-email" type="email" class="nst-input" placeholder="you@example.com" autocomplete="email"/>
      <label class="nst-field-label">密碼 Password</label>
      <input id="nst-auth-password" type="password" class="nst-input" placeholder="Password" autocomplete="current-password"/>
      <div id="nst-auth-error" class="nst-auth-error"></div>
      <button id="nst-auth-submit" class="nst-btn nst-btn-primary nst-btn-full">登入 Sign in</button>
    </div>
    <div id="nst-auth-setpw" style="display:none">
      <div class="nst-auth-title">設定密碼 Set password</div>
      <div class="nst-auth-sub">請設定您的登入密碼 Please set your password</div>
      <label class="nst-field-label">新密碼 New password</label>
      <input id="nst-auth-newpw" type="password" class="nst-input" placeholder="At least 8 characters"/>
      <label class="nst-field-label">確認密碼 Confirm password</label>
      <input id="nst-auth-newpw2" type="password" class="nst-input" placeholder="Repeat password"/>
      <div id="nst-auth-setpw-error" class="nst-auth-error"></div>
      <button id="nst-auth-setpw-submit" class="nst-btn nst-btn-primary nst-btn-full">設定密碼 Set password</button>
    </div>
  </div>
</div>`;
  modal.style.display = 'none';
  document.body.appendChild(modal);
  document.getElementById('nst-auth-logo').src = LOGO;

  document.getElementById('nst-auth-email').addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
  document.getElementById('nst-auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
  document.getElementById('nst-auth-submit').addEventListener('click', doSignIn);
  document.getElementById('nst-auth-setpw-submit').addEventListener('click', doSetPassword);
}

function showSignIn() {
  document.getElementById('nst-auth-signin').style.display = '';
  document.getElementById('nst-auth-setpw').style.display = 'none';
  document.getElementById('nst-auth-modal').style.display = '';
  setTimeout(() => document.getElementById('nst-auth-email').focus(), 50);
}

function showSetPassword() {
  document.getElementById('nst-auth-signin').style.display = 'none';
  document.getElementById('nst-auth-setpw').style.display = '';
  document.getElementById('nst-auth-modal').style.display = '';
  setTimeout(() => document.getElementById('nst-auth-newpw').focus(), 50);
}

function hideModal() {
  const m = document.getElementById('nst-auth-modal');
  if (m) m.style.display = 'none';
}

async function doSignIn() {
  const email = document.getElementById('nst-auth-email').value.trim();
  const password = document.getElementById('nst-auth-password').value;
  const errEl = document.getElementById('nst-auth-error');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Please enter email and password.'; return; }
  const btn = document.getElementById('nst-auth-submit');
  btn.disabled = true; btn.textContent = '登入中… Signing in…';
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = '登入 Sign in';
  if (error) { errEl.textContent = '電子郵件或密碼錯誤 Incorrect email or password.'; return; }
  // Fetch session if not in response
  let session = data.session;
  if (!session) {
    const { data: sd } = await supabase.auth.getSession();
    session = sd.session;
  }
  saveSession(session, data.user);
  hideModal();
  location.href = '../index.html';
}

async function doSetPassword() {
  const pw1 = document.getElementById('nst-auth-newpw').value;
  const pw2 = document.getElementById('nst-auth-newpw2').value;
  const errEl = document.getElementById('nst-auth-setpw-error');
  errEl.textContent = '';
  if (!pw1 || pw1.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; return; }
  if (pw1 !== pw2) { errEl.textContent = '密碼不一致 Passwords do not match.'; return; }
  const btn = document.getElementById('nst-auth-setpw-submit');
  btn.disabled = true; btn.textContent = '設定中… Setting…';
  const { data, error } = await supabase.auth.updateUser({ password: pw1 });
  btn.disabled = false; btn.textContent = '設定密碼 Set password';
  if (error) { errEl.textContent = 'Error: ' + error.message; return; }
  const { data: sd } = await supabase.auth.getSession();
  if (sd.session) saveSession(sd.session, data.user);
  hideModal();
  location.href = '../index.html';
}

export function requireAuth() {
  return new Promise(async resolve => {
    injectModal();

    const hash = window.location.hash || '';
    const isInviteOrRecovery = /type=(invite|recovery)/.test(hash);

    // 1. Check Supabase native session
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      saveSession(session, session.user);
      if (isInviteOrRecovery) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
        _resolveAuth = resolve;
        showSetPassword();
      } else {
        resolve({ id: session.user.id, email: session.user.email });
      }
      return;
    }

    // 2. Fall back to stored user identity + restore client session in background
    const storedUser = loadUser();
    if (storedUser?.id) {
      restoreClientSession(); // fire-and-forget — lets DB queries auth properly
      resolve({ id: storedUser.id, email: storedUser.email });
      return;
    }

    // 3. No session anywhere — show login
    _resolveAuth = resolve;
    showSignIn();
  });
}

export async function signOut() {
  clearAll();
  await supabase.auth.signOut();
  location.href = location.pathname.includes('/nst/') ? 'index.html' : 'nst/index.html';
}
