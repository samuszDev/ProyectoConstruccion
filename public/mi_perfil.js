// public/mi_perfil.js
const errorBox = document.getElementById('errorBox');
const successBox = document.getElementById('successBox');
const form = document.getElementById('formPerfil');

function showError(msgs) {
  if (!Array.isArray(msgs)) msgs = [msgs];
  errorBox.textContent = msgs.join(' | ');
  errorBox.classList.remove('d-none');
  successBox.classList.add('d-none');
}

function showSuccess(msg) {
  successBox.textContent = msg;
  successBox.classList.remove('d-none');
  errorBox.classList.add('d-none');
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  const payload = { username };
  if (password) payload.password = password;

  try {
    await fetchJSON('/api/me', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showSuccess('Perfil actualizado correctamente.');
    document.getElementById('password').value = '';
  } catch (err) {
    console.error(err);
    showError(err.errors || err.error || 'Error al actualizar perfil');
  }
});
