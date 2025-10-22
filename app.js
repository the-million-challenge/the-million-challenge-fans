// app.js - Lógica principal (vanilla JS)
// Atención: este código está pensado para uso móvil ligero y educativo.
// Para producción se requieren reglas de seguridad, validaciones server-side y webhooks de Stripe.

let currentRole = null; // 'fan' o 'creator'
let currentUser = null;
let currentCreatorView = null;

// UI helpers
function $(id){ return document.getElementById(id) }
function showSection(id){
  ['landing','auth','creator-profile','browse-creators'].forEach(s=> {
    const el = $(s); if(el) el.classList.toggle('hidden', s!==id)
  });
  if(id==='browse-creators') loadCreatorsList();
}
function toast(msg, time=3000){ const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'), time) }
function showSignUp(role){
  currentRole = role;
  $('signup-fan').classList.toggle('hidden', role!=='fan');
  $('signup-creator').classList.toggle('hidden', role!=='creator');
  $('signin').classList.add('hidden');
}
function showSignIn(){
  $('signin').classList.remove('hidden');
  $('signup-fan').classList.add('hidden'); $('signup-creator').classList.add('hidden');
}

// Landing actions
function startAs(role){
  if(role==='fan') {
    showSection('auth'); showSignUp('fan');
  } else {
    showSection('auth'); showSignUp('creator');
  }
}

// AUTH: Fan signup
async function signUpFan(){
  const name = $('fan-name').value.trim();
  const email = $('fan-email').value.trim();
  const password = $('fan-password').value;
  if(!name||!email||!password) return toast('Rellena todos los campos');
  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);
    currentUser = userCred.user;
    await db.collection('users').doc(currentUser.uid).set({
      displayName:name,
      role:'fan',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Registro de fan exitoso');
    showSection('landing');
  } catch(err){ toast('Error: '+err.message) }
}

// AUTH: Creator signup (goes to pending or active depending on limit)
async function signUpCreator(){
  const name = $('creator-name').value.trim();
  const email = $('creator-email').value.trim();
  const password = $('creator-password').value;
  const age = parseInt($('creator-age').value,10);
  const bank = $('creator-bank').value.trim();
  if(!name||!email||!password||!age||!bank) return toast('Rellena todos los campos');
  if(age < 18) return toast('Debes ser mayor de 18 años');
  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);
    currentUser = userCred.user;

    // Check number of active creators
    const snap = await db.collection('users').where('role','==','creator').where('status','==','active').get();
    const activeCount = snap.size;

    const status = activeCount < 500 ? 'pending' : 'waiting_list';

    await db.collection('users').doc(currentUser.uid).set({
      displayName: name,
      email: email,
      role: 'creator',
      age: age,
      bankMask: bank.slice(-4), // sólo guardar últimos 4 dígitos
      status: status, // pending (awaiting admin approval) or waiting_list
      crowns: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Also add to creators_pending collection for admin convenience
    await db.collection('creators_pending').doc(currentUser.uid).set({
      uid: currentUser.uid,
      displayName: name,
      email,
      age,
      bankMask: bank.slice(-4),
      requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
      status
    });

    toast('Solicitud enviada. El administrador revisará tu cuenta.');
    showSection('landing');
  } catch(err){ toast('Error: '+err.message) }
}

// Sign In
async function signIn(){
  const email = $('sign-email').value.trim();
  const password = $('sign-password').value;
  if(!email||!password) return toast('Rellena todos los campos');
  try {
    const userCred = await auth.signInWithEmailAndPassword(email, password);
    currentUser = userCred.user;
    toast('Bienvenido');
    showSection('landing');
  } catch(err){ toast('Error: '+err.message) }
}

// Auth state observer
auth.onAuthStateChanged(async (user)=> {
  currentUser = user;
  if(user){
    const doc = await db.collection('users').doc(user.uid).get();
    const data = doc.exists ? doc.data() : null;
    if(data && data.role === 'creator' && data.status === 'active'){
      // Show creator dashboard (personal)
      openCreatorProfile(user.uid, true);
    }
  } else {
    // usuario desconectado
  }
});

// Load creators list (public)
async function loadCreatorsList(){
  const el = $('creators-list'); el.innerHTML = 'Cargando...';
  const snap = await db.collection('users').where('role','==','creator').where('status','==','active').orderBy('crowns','desc').limit(100).get();
  el.innerHTML = '';
  snap.forEach(doc=>{
    const d = doc.data();
    const card = document.createElement('div');
    card.className = 'content-item';
    card.innerHTML = `<strong>${d.displayName||'Creador'}</strong><div class="muted">Coronas: ${d.crowns||0}</div><div class="muted">Progreso: ${Math.min(100, Math.round((d.crowns||0)/10000))}%</div><button class="btn" onclick="openCreatorProfile('${doc.id}', false)">Ver perfil</button>`;
    el.appendChild(card);
  });
}

// Open creator profile (public view if publicView true uses current user cretor)
async function openCreatorProfile(uid, personal=false){
  const doc = await db.collection('users').doc(uid).get();
  if(!doc.exists) return toast('Creador no encontrado');
  const d = doc.data();
  currentCreatorView = { uid, ...d };

  $('creator-title').textContent = d.displayName || 'Sin nombre';
  $('creator-sub').textContent = personal ? 'Tu panel de creador' : `Perfil público`;
  $('creator-crowns').textContent = d.crowns || 0;
  $('creator-progress').value = d.crowns || 0;

  // load content
  const contentGrid = $('content-grid');
  contentGrid.innerHTML = 'Cargando contenido...';
  const contSnap = await db.collection('content').where('owner','==',uid).orderBy('createdAt','desc').limit(50).get();
  contentGrid.innerHTML = '';
  contSnap.forEach(cdoc=>{
    const c = cdoc.data();
    const item = document.createElement('div'); item.className='content-item';
    if(c.type && c.type.startsWith('image')) item.innerHTML = `<img src="${c.url}" alt="${c.message||''}" />`;
    else item.innerHTML = `<video controls src="${c.url}"></video>`;
    item.innerHTML += `<div class="muted">${c.message||''}</div>`;
    if(personal){
      item.innerHTML += `<button class="btn" onclick="deleteContent('${cdoc.id}')">Eliminar</button>`;
    }
    contentGrid.appendChild(item);
  });

  showSection('creator-profile');
}

// Upload content (for creators)
async function uploadContent(){
  if(!currentUser) return toast('Debes iniciar sesión como creador');
  const fileInput = $('file-input');
  const msg = $('content-msg').value || '';
  if(!fileInput.files.length) return toast('Selecciona un archivo');
  const file = fileInput.files[0];
  const ownerDoc = await db.collection('users').doc(currentUser.uid).get();
  const ownerData = ownerDoc.exists ? ownerDoc.data() : null;
  if(!ownerData || ownerData.role!=='creator' || ownerData.status !== 'active') return toast('Tu cuenta de creador no está activa');

  try {
    const path = `content/${currentUser.uid}/${Date.now()}_${file.name}`;
    const ref = storage.ref().child(path);
    const task = await ref.put(file);
    const url = await ref.getDownloadURL();

    await db.collection('content').add({
      owner: currentUser.uid,
      url,
      type: file.type,
      message: msg,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Contenido subido');
    $('file-input').value = ''; $('content-msg').value = '';
    openCreatorProfile(currentUser.uid, true);
  } catch(err){ toast('Error: '+err.message) }
}

// Delete content (admin or owner)
async function deleteContent(contentId){
  const cdoc = await db.collection('content').doc(contentId).get();
  if(!cdoc.exists) return toast('Contenido no encontrado');
  const c = cdoc.data();
  // Basic permission: only owner or admin (admin detection in admin-panel)
  if(!currentUser || (currentUser.uid !== c.owner)){
    return toast('No tienes permisos para eliminar este contenido desde aquí. Usa el panel de admin para gestionar.');
  }
  await db.collection('content').doc(contentId).delete();
  toast('Contenido eliminado');
  if(currentUser) openCreatorProfile(currentUser.uid, true);
}

// Modal profile (public)
function openCreatorProfile(uid, _unused){
  // Reuse the public modal, not the creator dashboard
  // For simplicity: fetch and show modal
  (async ()=>{
    const doc = await db.collection('users').doc(uid).get();
    if(!doc.exists) return toast('Creador no encontrado');
    const d = doc.data();
    $('modal-name').textContent = d.displayName || 'Creador';
    $('modal-desc').textContent = d.status === 'active' ? 'Activo' : 'No autorizado';
    $('modal-crowns').textContent = d.crowns || 0;
    $('donate-amount').value = 1;
    $('modal-content').innerHTML = 'Cargando contenido...';
    const cont = await db.collection('content').where('owner','==',uid).orderBy('createdAt','desc').limit(20).get();
    $('modal-content').innerHTML = '';
    cont.forEach(docc=>{
      const c = docc.data();
      const item = document.createElement('div'); item.className='content-item';
      if(c.type && c.type.startsWith('image')) item.innerHTML = `<img src="${c.url}" />`;
      else item.innerHTML = `<video controls src="${c.url}"></video>`;
      $('modal-content').appendChild(item);
    });
    $('modal-profile').classList.remove('hidden');
    // store for donation
    currentCreatorView = { uid, ...d };
  })();
}
function closeModal(){ $('modal-profile').classList.add('hidden') }

// BUY CROWNS (simplified)
async function buyCrownsModal(){
  const amount = parseInt($('donate-amount').value, 10);
  if(!currentCreatorView || !currentCreatorView.uid) return toast('Perfil inválido');
  if(amount <= 0) return toast('Cantidad no válida');

  // If stripePaymentLinks has a link for this amount, redirect user to checkout
  const link = (typeof stripePaymentLinks !== 'undefined') ? stripePaymentLinks[String(amount)] : undefined;
  if(link){
    // Append query params so we can handle redirect back if needed
    const successUrl = `${location.origin}${location.pathname}?payment_success=1&creator=${currentCreatorView.uid}&amount=${amount}`;
    // Open Stripe payment link (hosted). Payment Links must be created in Stripe Dashboard.
    window.location.href = link;
    return;
  }

  // FALLBACK: flujo simulado (demo). En producción, valida con webhooks desde el servidor.
  try {
    const fanId = currentUser ? currentUser.uid : null;
    // Create transaction record (unverified in demo)
    await db.collection('transactions').add({
      creator: currentCreatorView.uid,
      fan: fanId || null,
      crowns: amount,
      priceUSD: amount * 1.5,
      platformFeeUSD: amount * 0.5,
      creatorUSD: amount * 1.0,
      status: 'completed_demo', // en producción usar 'pending' y verificar por webhook
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // actualizar coronas del creador (atomico)
    const cRef = db.collection('users').doc(currentCreatorView.uid);
    await db.runTransaction(async tx => {
      const snap = await tx.get(cRef);
      const prev = snap.exists ? snap.data().crowns || 0 : 0;
      tx.update(cRef, { crowns: prev + amount });
    });
    toast(`Has apoyado con ${amount} coronas (demo).`);
    closeModal();
  } catch(err){ toast('Error: '+err.message) }
}

// On page load: check if redirected from Stripe (simple demo handling)
window.addEventListener('load', async ()=>{
  // Initialize UI
  // Show creators list by default for browsing
  showSection('landing');

  // Simple redirect handling: ?payment_success=1&creator=UID&amount=N
  const url = new URL(location.href);
  if(url.searchParams.get('payment_success')==='1'){
    const cid = url.searchParams.get('creator');
    const amount = parseInt(url.searchParams.get('amount'),10) || 0;
    if(cid && amount>0){
      // NOTE: THIS TRUSTS THE REDIRECT. In production verify session with Stripe webhooks or server.
      await db.collection('transactions').add({
        creator: cid,
        fan: currentUser ? currentUser.uid : null,
        crowns: amount,
        priceUSD: amount * 1.5,
        platformFeeUSD: amount * 0.5,
        creatorUSD: amount * 1.0,
        status: 'completed_redirect',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      const cRef = db.collection('users').doc(cid);
      await db.runTransaction(async tx => {
        const snap = await tx.get(cRef);
        const prev = snap.exists ? snap.data().crowns || 0 : 0;
        tx.update(cRef, { crowns: prev + amount });
      });
      toast('Pago confirmado (redirección). Gracias por apoyar.');
      // Clean URL
      url.searchParams.delete('payment_success'); url.searchParams.delete('creator'); url.searchParams.delete('amount');
      history.replaceState({},'', url.toString());
    }
  }
});

// Export helper (used in admin panel - placed here for reuse)
async function exportCollectionToCSV(collectionPath, filename='export.csv'){
  const snap = await db.collection(collectionPath).get();
  if(snap.empty) throw new Error('No hay registros');
  const rows = [];
  snap.forEach(doc => {
    const data = doc.data();
    const flat = Object.assign({id: doc.id}, data);
    rows.push(flat);
  });
  // Build CSV header
  const headers = Array.from(Object.keys(rows[0]));
  const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => JSON.stringify(r[h] || '')).join(','))).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Utility: withdraw (creator requests withdrawal) - applies 50% penalty if withdraw before 1M crowns
async function requestWithdraw(){
  if(!currentUser) return toast('Inicia sesión');
  const doc = await db.collection('users').doc(currentUser.uid).get();
  if(!doc.exists) return toast('Usuario no encontrado');
  const data = doc.data();
  if(data.role !== 'creator') return toast('No eres creador');
  const crowns = data.crowns || 0;
  if(crowns <= 0) return toast('No tienes coronas para retirar');
  const confirm = window.confirm('Solicitar retiro aplica penalización del 50% si no alcanzaste 1,000,000 de coronas. Continuar?');
  if(!confirm) return;
  let penalty = 0;
  if(crowns < 1000000){
    penalty = Math.floor(crowns * 0.5);
  }
  const finalCrowns = crowns - penalty;
  // Create withdrawal request
  await db.collection('withdrawals').add({
    uid: currentUser.uid,
    originalCrowns: crowns,
    penalty,
    finalCrowns,
    status: 'requested',
    requestedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  // Update user: set crowns to 0 and mark account closed/pending payout when admin processes
  await db.collection('users').doc(currentUser.uid).update({
    crowns: 0,
    status: 'withdraw_requested'
  });
  toast('Retiro solicitado. El administrador procesará el pago y te notificará.');
}