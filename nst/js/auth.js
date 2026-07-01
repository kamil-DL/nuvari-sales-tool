import { supabase } from './supabase-client.js';

let _resolveAuth = null;

function injectModal() {
  if (document.getElementById('nst-auth-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'nst-auth-modal';
  modal.innerHTML = `
<div class="nst-auth-backdrop">
  <div class="nst-auth-box">
    <div class="nst-auth-brand">Nuvari</div>
    <div id="nst-auth-signin">
      <div class="nst-auth-title">歡迎 · Welcome</div>
      <div class="nst-auth-sub">請登入以繼續 Sign in to continue</div>
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
  document.body.appendChild(modal);

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
  hideModal();
  if (_resolveAuth) _resolveAuth({ id: data.user.id, email: data.user.email });
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
  hideModal();
  const user = data.user;
  if (_resolveAuth && user) _resolveAuth({ id: user.id, email: user.email });
}

export function requireAuth() {
  return new Promise(async resolve => {
    injectModal();
    const hash = window.location.hash || '';
    const isInviteOrRecovery = /type=(invite|recovery)/.test(hash);
    const { data: { session } } = await supabase.auth.getSession();
    if (session && isInviteOrRecovery) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      _resolveAuth = resolve;
      showSetPassword();
    } else if (session) {
      resolve({ id: session.user.id, email: session.user.email });
    } else {
      _resolveAuth = resolve;
      showSignIn();
    }
  });
}

export async function signOut() {
  await supabase.auth.signOut();
  location.reload();
}
