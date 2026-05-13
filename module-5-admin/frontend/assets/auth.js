'use strict';
const form = document.getElementById('login-form');
const errorDiv = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');
const btnText = document.getElementById('btn-text');
const btnLoader = document.getElementById('btn-loader');
const toggleBtn = document.getElementById('toggle-password');
const passwordEl = document.getElementById('password');

toggleBtn.addEventListener('click', () => {
  const isHidden = passwordEl.type === 'password';
  passwordEl.type = isHidden ? 'text' : 'password';
  toggleBtn.style.opacity = isHidden ? '1' : '0.6';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = passwordEl.value;
  if (!username || !password) return;
  errorDiv.classList.add('hidden');
  loginBtn.disabled = true;
  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (res.ok && data.success) { window.location.href = '/app'; return; }
    showError(data.error || 'Erreur de connexion.');
  } catch { showError('Impossible de joindre le serveur.'); }
});

function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.classList.remove('hidden');
  loginBtn.disabled = false;
  btnText.classList.remove('hidden');
  btnLoader.classList.add('hidden');
  form.classList.remove('shake');
  void form.offsetWidth;
  form.classList.add('shake');
}
