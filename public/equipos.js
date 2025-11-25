// public/equipos.js
const API = {
  eqp: '/api/equipos',
  ubic: '/api/ubicaciones',
  resp: '/api/responsables-custodios' 
};

const tbody = document.getElementById('tbody');
const btnNuevo = document.getElementById('btnNuevo');
const modal = new bootstrap.Modal(document.getElementById('modal'));
const $ = (id)=>document.getElementById(id);


function prettyError(err) {
  let msg = (err && err.message) ? err.message : 'Error';
  // Si el mensaje “parece” JSON, lo parseamos y lo simplificamos
  if (typeof msg === 'string' && (msg.trim().startsWith('{') || msg.trim().startsWith('['))) {
    try {
      const obj = JSON.parse(msg);
      if (Array.isArray(obj?.errors)) return obj.errors.join('<br>');

      if (obj?.error) return String(obj.error);
      return JSON.stringify(obj); // fallback
    } catch { /* ignore */ }
  }
  return msg;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const bg = type==='success'?'bg-success':type==='error'?'bg-danger':'bg-info';
  const el = document.createElement('div');
  el.className = `toast align-items-center text-white ${bg} border-0`;
  el.role='alert'; el.ariaLive='assertive'; el.ariaAtomic='true';
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  container.appendChild(el); const t=new bootstrap.Toast(el,{delay:2800}); t.show();
  el.addEventListener('hidden.bs.toast', ()=>el.remove());
}
async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    try {
      const j = JSON.parse(text);
      const msg = j?.errors?.join(' | ') || j?.error || text || 'Error';
      throw new Error(msg);
    } catch {
      throw new Error(text || 'Error');
    }
  }
  return text ? JSON.parse(text) : {};
}

const TIPOS = ['laptop','desktop','impresora','switch','router','servidor','otro'];
const ESTADOS = ['operativo','en_mantenimiento','dado_de_baja'];

async function loadEnumsAndCatalogs(){
  $('fTipo').innerHTML = '<option value="">Tipo...</option>' + TIPOS.map(t=>`<option value="${t}">${t}</option>`).join('');
  $('fEstado').innerHTML = '<option value="">Estado...</option>' + ESTADOS.map(e=>`<option value="${e}">${e}</option>`).join('');
  $('tipo').innerHTML = TIPOS.map(t=>`<option value="${t}">${t}</option>`).join('');
  $('estado').innerHTML = ESTADOS.map(e=>`<option value="${e}">${e}</option>`).join('');
  const ubic = await fetchJSON(API.ubic);
  $('fUbic').innerHTML = '<option value="">Ubicación...</option>'+ ubic.map(u=>`<option value="${u.id}">${u.identificacion} — ${u.sede}/${u.edificio}/${u.piso}/${u.sala}</option>`).join('');
  $('ubicacionId').innerHTML = ubic.map(u=>`<option value="${u.id}">${u.identificacion} — ${u.sede}/${u.edificio}/${u.piso}/${u.sala}</option>`).join('');
  const resp = await fetchJSON(API.resp);
  $('fResp').innerHTML = '<option value="">Responsable...</option>'+ resp.map(r=>`<option value="${r.id}">${r.id_area} — ${r.nombre_area}</option>`).join('');
  $('responsableId').innerHTML = resp.map(r=>`<option value="${r.id}">${r.id_area} — ${r.nombre_area}</option>`).join('');
}

async function listar(){
  const params = new URLSearchParams();
  const q = $('q').value.trim(); if(q) params.set('q', q);
  const est = $('fEstado').value; if(est) params.set('estado', est);
  const tip = $('fTipo').value; if(tip) params.set('tipo', tip);
  const ub = $('fUbic').value; if(ub) params.set('ubicacionId', ub);
  const rp = $('fResp').value; if(rp) params.set('responsableId', rp);

  const data = await fetchJSON(`${API.eqp}${params.toString()?`?${params}`:''}`);
  tbody.innerHTML = '';

if (!Array.isArray(data) || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted py-4">Sin resultados</td></tr>';
    return; // importante para no seguir con el forEach y parar aquí
  }

  data.forEach(e=>{
    const tr=document.createElement('tr');
    // Obtener el rol del usuario actual desde la variable global
    const currentRole = window.CURRENT_USER_ROLE;
    // Verificar si el usuario puede modificar (admin u officer)
    const canModify = currentRole === 'admin';
    tr.innerHTML = `
      <td>${e.id}</td><td>${e.codigo_inventario}</td><td>${e.serial||''}</td>
      <td>${e.marca||''}</td><td>${e.modelo||''}</td>
      <td>${e.tipo_equipo}</td><td>${e.estado}</td>
      <td>${e.Ubicacion ? `${e.Ubicacion.identificacion}` : ''}</td>
      <td>${
        e.ResponsableCustodio
          ? `${e.ResponsableCustodio.id_area} — ${e.ResponsableCustodio.nombre_area}`
          : ''
      }</td>
      <td>${e.createdAt||''}</td><td>${e.updatedAt||''}</td>
      <td>
        <a class="btn btn-sm btn-info me-2" href="/mantenimientos?equipoId=${e.id}">Ver Mtto</a>
        <button class="btn btn-sm btn-warning me-2" data-act="edit" data-id="${e.id}">Editar</button>
        ${canModify ? `
          <button class="btn btn-sm btn-danger" data-act="del" data-id="${e.id}">Eliminar</button>
        ` : ''}
      </td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('btnFiltrar').addEventListener('click', ()=>listar().catch(()=>showToast('Error al filtrar','error')));
document.getElementById('btnLimpiar').addEventListener('click', ()=>{
  $('q').value=''; $('fEstado').value=''; $('fTipo').value=''; $('fUbic').value=''; $('fResp').value='';
  listar().catch(()=>showToast('Error','error'));
});

btnNuevo.addEventListener('click', ()=>{
  $('title').textContent='Nuevo equipo';
  $('id').value=''; $('codigo').value=''; $('serial').value=''; $('marca').value=''; $('modelo').value='';
  $('tipo').selectedIndex=0; $('estado').selectedIndex=0;
  if($('ubicacionId').options.length) $('ubicacionId').selectedIndex=0;
  if($('responsableId').options.length) $('responsableId').selectedIndex=0;
  modal.show();
});

tbody.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const {act,id} = btn.dataset;
  if (act==='edit'){
    const it = await fetchJSON(`${API.eqp}/${id}`);
    $('title').textContent = `Editar equipo #${id}`;
    $('id').value = id;
    $('codigo').value = it.codigo_inventario || '';
    $('serial').value = it.serial || '';
    $('marca').value = it.marca || '';
    $('modelo').value = it.modelo || '';
    $('tipo').value = it.tipo_equipo;
    $('estado').value = it.estado;
    $('ubicacionId').value = it.ubicacionId;
    $('responsableId').value = it.responsableId;
    modal.show();
  } else if (act==='del'){
    if(!confirm('¿Eliminar equipo?')) return;
    try { 
      await fetchJSON(`${API.eqp}/${id}`, { method:'DELETE' }); 
      await listar(); 
      showToast('Equipo eliminado','info'); 
    } catch(e){ 
      showToast(prettyError(e) || 'No se pudo eliminar','error'); 
    }
  }
});


// submit
document.getElementById('form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const payload = {
    codigo_inventario: $('codigo').value.trim(),
    serial: $('serial').value.trim(),
    marca: $('marca').value.trim(),
    modelo: $('modelo').value.trim(),
    tipo_equipo: $('tipo').value,
    estado: $('estado').value,
    ubicacionId: Number($('ubicacionId').value),
    responsableId: Number($('responsableId').value)
  };

  const id = $('id').value;
  try {
    if (id) {
      await fetchJSON(`${API.eqp}/${id}`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
    } else {
      await fetchJSON(API.eqp, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
    }
    modal.hide();
    await listar();
    showToast(id ? 'Equipo actualizado' : 'Equipo creado');
  } catch (e) {
    showToast(prettyError(e) || 'No se pudo guardar', 'error'); // ← aquí
  }
});




(async function init(){
  try{ await loadEnumsAndCatalogs(); await listar(); }
  catch(e){ console.error(e); showToast('Error de carga','error'); }
})();
