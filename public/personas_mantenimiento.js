const API = '/api/personas-mantenimiento';
const API_CARGOS = '/api/cargos';

const tbody = document.getElementById('tbody');
const btnNuevo = document.getElementById('btnNuevo');
const modal = new bootstrap.Modal(document.getElementById('modal'));
const searchInput = document.getElementById('search');

const $ = (id)=>document.getElementById(id);

function showToast(message, type='success'){
  const container = document.getElementById('toastContainer');
  const bg = type==='success'?'bg-success':type==='error'?'bg-danger':'bg-info';
  const el = document.createElement('div');
  el.className = `toast align-items-center text-white ${bg} border-0`;
  el.role='alert'; el.ariaLive='assertive'; el.ariaAtomic='true';
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  container.appendChild(el);
  const t=new bootstrap.Toast(el,{delay:2800}); t.show();
  el.addEventListener('hidden.bs.toast', ()=>el.remove());
}

async function fetchJSON(url, opts){
  const r = await fetch(url, opts);
  const text = await r.text();
  if(!r.ok){
    try{
      const j = JSON.parse(text);
      throw new Error(j?.error || j?.errors?.join(' | ') || text || 'Error');
    }catch{
      throw new Error(text || 'Error');
    }
  }
  return text ? JSON.parse(text) : {};
}

async function cargarCargos(){
  const select = $('cargoId');
  select.innerHTML = `<option value="">(Sin cargo)</option>`;
  const cargos = await fetchJSON(API_CARGOS);
  cargos.forEach(c=>{
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.nombre} (${c.tipo})`;
    select.appendChild(opt);
  });
}

/* ===== Listar personas ===== */
async function listar(q = ''){
  const params = q ? `?q=${encodeURIComponent(q)}` : '';
  const data = await fetchJSON(`${API}${params}`);
  tbody.innerHTML = '';
  if(!Array.isArray(data) || !data.length){
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">Sin resultados</td></tr>';
    return;
  }
  data.forEach(p=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${p.identificacion}</td>
      <td>${p.nombres}</td>
      <td>${p.apellidos}</td>
      <td>${p.Cargo?.nombre || ''}</td>
      <td>${p.email || ''}</td>
      <td>${p.telefono || ''}</td>
      <td>${p.createdAt || ''}</td>
      <td>${p.updatedAt || ''}</td>
      <td>
        ${
          (window.CURRENT_USER_ROLE === 'admin' || window.CURRENT_USER_ROLE === 'officer') 
          ? `<button class="btn btn-sm btn-warning me-2" data-act="edit" data-id="${p.id}">Editar</button>`
          : ''
        }

        ${
          (window.CURRENT_USER_ROLE === 'admin')
          ? `<button class="btn btn-sm btn-danger" data-act="del" data-id="${p.id}">Eliminar</button>`
          : ''
        }
      </td>
      `;
    tbody.appendChild(tr);
  });
}

/* ===== Nueva persona mantenimiento ===== */
btnNuevo.addEventListener('click', async ()=>{
  $('title').textContent = 'Nueva persona de mantenimiento';
  $('id').value='';
  $('identificacion').value='';
  $('nombres').value='';
  $('apellidos').value='';
  $('email').value='';
  $('telefono').value='';
  await cargarCargos();
  $('cargoId').value='';
  modal.show();
});

/* ===== Acciones editar/eliminar ===== */
tbody.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const {act,id} = btn.dataset;
  if (act==='edit'){
    const it = await fetchJSON(`${API}/${id}`);
    $('title').textContent = `Editar persona #${id}`;
    $('id').value = id;
    $('identificacion').value = it.identificacion || '';
    $('nombres').value = it.nombres || '';
    $('apellidos').value = it.apellidos || '';
    $('email').value = it.email || '';
    $('telefono').value = it.telefono || '';
    await cargarCargos();
    $('cargoId').value = (it.cargoId ?? it.Cargo?.id) || '';
    modal.show();
  } else if (act==='del'){
    if(!confirm('¿Eliminar persona?')) return;
    try{
      await fetchJSON(`${API}/${id}`, { method:'DELETE' });
      await listar(); showToast('Persona eliminada','info');
    }catch(e){ showToast(e.message || 'No se pudo eliminar','error'); }
  }
});

/* ===== Guardar (POST/PUT) ===== */
document.getElementById('form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const payload = {
    identificacion: $('identificacion').value.trim(),
    nombres: $('nombres').value.trim(),
    apellidos: $('apellidos').value.trim(),
    cargoId: $('cargoId').value ? Number($('cargoId').value) : null,
    email: $('email').value.trim() || null,
    telefono: $('telefono').value.trim() || null,
  };
  const id = $('id').value;
  try{
    if (id) {
      await fetchJSON(`${API}/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    } else {
      await fetchJSON(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    }
    modal.hide(); await listar(); showToast(id?'Persona actualizada':'Persona creada');
  }catch(e){ showToast(e.message || 'Error al guardar','error'); }
});

/* ===== init ===== */
(async function init(){
  try{
    await listar();
  }catch(e){
    console.error(e);
    showToast('Error al listar','error');
  }
})();

// Búsqueda
let searchTimeout;
searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    listar(searchInput.value.trim());
  }, 400);
});

// Inicial
listar().catch(()=>showToast('Error al listar','error'));;;