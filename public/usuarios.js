// public/usuarios.js

const API = '/api/usuarios';

const tbody = document.getElementById('tbodyUsuarios');
const btnNuevo = document.getElementById('btnNuevo');
const modalEl = document.getElementById('modalUsuario');
const modal = new bootstrap.Modal(modalEl);
const form = document.getElementById('formUsuario');
const errorBox = document.getElementById('errorBox');
const toastEl = document.getElementById('mainToast');
const toastBody = document.getElementById('toastBody');
const toast = new bootstrap.Toast(toastEl);
const searchInput = document.getElementById('search');

const $ = (id) => document.getElementById(id);

function showError(msgs) {
  if (!Array.isArray(msgs)) msgs = [msgs];
  errorBox.textContent = msgs.join(' | ');
  errorBox.classList.remove('d-none');
}

function clearError() {
  errorBox.classList.add('d-none');
  errorBox.textContent = '';
}

function showToast(message) {
  toastBody.textContent = message;
  toast.show();
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw data;
  }
  return data;
}

function renderRows(usuarios) {
  tbody.innerHTML = '';
  usuarios.forEach(u => {
    const tr = document.createElement('tr');
    tr.dataset.id = u.id;
    let badgeColor = 'secondary'; // default para 'user'
    if (u.role === 'admin') badgeColor = 'danger';
    if (u.role === 'officer') badgeColor = 'info'; // Color para officer
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td><span class="badge bg-${badgeColor}">${u.role}</span></td>
      <td>${u.createdAt || ''}</td>
      <td>${u.updatedAt || ''}</td>
      <td>
        <button class="btn btn-sm btn-warning me-2">Editar</button>
        <button class="btn btn-sm btn-danger">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Cargar lista
async function loadUsuarios(q = '') {
  try {
    const params = q ? `?q=${encodeURIComponent(q)}` : '';
    const data = await fetchJSON(`${API}${params}`);
    renderRows(data);
  } catch (e) {
    console.error(e);
    showToast('Error al cargar usuarios');
  }
}

// para crear nuevo usuario
btnNuevo?.addEventListener('click', () => {
  clearError();
  $('modalTitulo').textContent = 'Nuevo usuario';
  $('usuarioId').value = '';
  $('username').value = '';
  $('password').value = '';
  $('role').value = 'user';
  $('role').disabled = false;  // con esto puede elegir el rol, pero en el caso de editar su propio usuario se deshabilita
  $('helpPassword').textContent = 'Para nuevo usuario es obligatoria.';
  modal.show();
});


// Editar / Eliminar
tbody?.addEventListener('click', async (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const id = tr.dataset.id;

  // Editar
  if (e.target.classList.contains('btn-edit')) {
  clearError();
  try {
    const u = await fetchJSON(`${API}/${id}`);
    $('modalTitulo').textContent = `Editar usuario #${id}`;
    $('usuarioId').value = u.id;
    $('username').value = u.username;
    $('password').value = '';
    $('role').value = u.role;

    // 🔒 Si está editando su propio usuario, no permitir cambiar el rol
    if (Number(id) === Number(window.CURRENT_USER_ID)) {
      $('role').disabled = true;
      $('helpPassword').textContent = 'Puede cambiar su contraseña, pero no su propio rol.';
    } else {
      $('role').disabled = false;
      $('helpPassword').textContent = 'Deje en blanco si no desea cambiar la contraseña.';
    }

    modal.show();
  } catch (err) {
    console.error(err);
    showToast('Error al cargar usuario');
  }
}


  // Eliminar
  if (e.target.classList.contains('btn-delete')) {
    if (Number(id) === Number(window.CURRENT_USER_ID)) {
      alert('No puede eliminar su propio usuario.');
      return;
    }

    if (!confirm('¿Seguro que desea eliminar este usuario?')) return;

    try {
      await fetchJSON(`${API}/${id}`, { method: 'DELETE' });
      showToast('Usuario eliminado');
      loadUsuarios(searchInput.value.trim());
    } catch (err) {
      console.error(err);
      alert(err.error || 'Error al eliminar usuario');
    }
  }
});

// Guardar (crear/editar)
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const id = $('usuarioId').value;
  const username = $('username').value.trim();
  const password = $('password').value;
  const role = $('role').value;

  const payload = { username, role };
  if (password) payload.password = password;

  try {
    if (!id) {
      // Crear → contraseña obligatoria
      if (!password) {
        showError('La contraseña es obligatoria para un nuevo usuario');
        return;
      }
      await fetchJSON(API, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Usuario creado');
    } else {
      await fetchJSON(`${API}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Usuario actualizado');
    }

    modal.hide();
    loadUsuarios(searchInput.value.trim());
  } catch (err) {
    console.error(err);
    if (err.errors) {
      showError(err.errors);
    } else {
      showError(err.error || 'Error al guardar usuario');
    }
  }
});

// Búsqueda
let searchTimeout;
searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadUsuarios(searchInput.value.trim());
  }, 400);
});

// Inicial
loadUsuarios();
