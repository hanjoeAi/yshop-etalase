/* ============================================================
   KONFIGURASI FIREBASE
   ------------------------------------------------------------
   1. Buka https://console.firebase.google.com, buat project baru (gratis)
   2. Build > Authentication > Get started > Sign-in method
      > aktifkan "Email/Password"
   3. Authentication > Users > Add user
      > isi email & password KAMU SENDIRI (ini akun admin nanti)
   4. Build > Firestore Database > Create database
      > pilih mode "production", pilih lokasi terdekat (mis. asia-southeast2)
   5. Tab "Rules" di Firestore, ganti isinya dengan:

        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /products/{productId} {
              allow read: if true;
              allow write: if request.auth != null;
            }
          }
        }

     lalu klik "Publish". Ini artinya: SEMUA ORANG boleh membaca
     (etalase publik), tapi HANYA yang sudah login yang boleh
     menambah/menghapus produk.
   6. Project settings (ikon gerigi) > scroll ke "Your apps" >
      klik ikon web ( </> ) > daftarkan app > salin objek
      firebaseConfig yang muncul, tempel di bawah ini.
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyAtgP2bhU1pBOWqvgGT-fGqO4ie6Vxlb0w",
  authDomain: "yshop-links.firebaseapp.com",
  projectId: "yshop-links",
  storageBucket: "yshop-links.firebasestorage.app",
  messagingSenderId: "340420205806",
  appId: "1:340420205806:web:12d7b91be5db047c6da7ff"
};
/* ============================================================ */

const isConfigured = Boolean(firebaseConfig.apiKey) && firebaseConfig.apiKey.length > 20 && !firebaseConfig.apiKey.startsWith('GANTI');
const DEFAULT_CATEGORY = 'Umum';
const isAdmin = document.body.dataset.mode === 'admin';

let links = [];
let activeCategory = null;
let db = null;
let auth = null;

const listArea = document.getElementById('list-area');
const countTag = document.getElementById('count-tag');
const catList = document.getElementById('cat-list');
const toast = document.getElementById('toast');
const storageBadge = document.getElementById('storage-badge');

// admin-only elements (may not exist on the public page)
const form = document.getElementById('link-form');
const formMsg = document.getElementById('form-msg');
const categoryOptions = document.getElementById('category-options');
const clearAllBtn = document.getElementById('clearAll');
const loginGate = document.getElementById('login-gate');
const adminContent = document.getElementById('admin-content');
const loginForm = document.getElementById('login-form');
const loginMsg = document.getElementById('login-msg');
const logoutBtn = document.getElementById('logoutBtn');
const adminEmailLabel = document.getElementById('admin-email');

function showToast(msg){
  if(!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> toast.classList.remove('show'), 2400);
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function normalizeUrl(url){
  url = url.trim();
  if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function updateStorageBadge(state, detail){
  if(!storageBadge) return;
  storageBadge.classList.remove('ok','warn');
  if(state === 'ok'){
    storageBadge.classList.add('ok');
    storageBadge.innerHTML = '<span class="dot"></span>Tersimpan online &middot; terlihat semua pengunjung';
  } else if(state === 'loading'){
    storageBadge.innerHTML = '<span class="dot"></span>Memuat etalase&hellip;';
  } else {
    storageBadge.classList.add('warn');
    storageBadge.innerHTML = '<span class="dot"></span>' + escapeHtml(detail || 'Firebase belum dikonfigurasi');
  }
}

/* ---------- Rendering (sama untuk kedua halaman) ---------- */

function getCategoryCounts(){
  const counts = {};
  links.forEach(item => {
    const cat = item.category || DEFAULT_CATEGORY;
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return counts;
}

function renderSidebar(){
  if(!catList) return;
  const counts = getCategoryCounts();
  const categories = Object.keys(counts).sort((a,b)=> a.localeCompare(b, 'id'));

  if(categoryOptions){
    categoryOptions.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
  }
  if(activeCategory && !categories.includes(activeCategory)){
    activeCategory = null;
  }

  const items = [
    `<button class="cat-item ${activeCategory === null ? 'active' : ''}" data-cat="">
      <span>Semua</span><span class="cat-count">${links.length}</span>
    </button>`,
    ...categories.map(cat => `
      <button class="cat-item ${activeCategory === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">
        <span>${escapeHtml(cat)}</span><span class="cat-count">${counts[cat]}</span>
      </button>
    `)
  ];
  catList.innerHTML = items.join('');
  catList.querySelectorAll('.cat-item').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat || null;
      render();
    });
  });
}

function cardImageHtml(item){
  if(item.image){
    return `<div class="card-image"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.closest('.card-image').innerHTML='<div class=&quot;img-placeholder&quot;>🛍️</div>'"></div>`;
  }
  return `<div class="card-image"><div class="img-placeholder">🛍️</div></div>`;
}

function cardActionsHtml(item){
  const buy = `<a class="buy-btn" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Beli di Shopee</a>`;
  const copy = `<button class="icon-btn" title="Salin link" onclick="copyLink('${item.id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    </button>`;
  if(!isAdmin) return `<div class="card-actions">${buy}${copy}</div>`;
  const del = `<button class="icon-btn" title="Hapus" onclick="deleteLink('${item.id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
    </button>`;
  return `<div class="card-actions">${buy}${copy}${del}</div>`;
}

function render(){
  renderSidebar();

  const filtered = activeCategory
    ? links.filter(item => (item.category || DEFAULT_CATEGORY) === activeCategory)
    : links;

  countTag.textContent = filtered.length + ' produk' + (activeCategory ? ` di "${activeCategory}"` : '');

  if(links.length === 0){
    listArea.innerHTML = `<div class="empty"><strong>Etalase masih kosong</strong>${isAdmin ? 'Tambahkan link pertamamu lewat formulir di atas.' : 'Produk akan segera ditambahkan, cek lagi nanti.'}</div>`;
    return;
  }
  if(filtered.length === 0){
    listArea.innerHTML = `<div class="empty"><strong>Belum ada produk di kategori ini</strong>Pilih kategori lain.</div>`;
    return;
  }

  const sorted = [...filtered].sort((a,b)=> b.createdAt - a.createdAt);
  listArea.innerHTML = `<div class="grid">${sorted.map(item => `
    <div class="card" data-id="${item.id}">
      ${cardImageHtml(item)}
      <div class="card-body">
        <span class="card-cat">${escapeHtml(item.category || DEFAULT_CATEGORY)}</span>
        <div class="card-title">${escapeHtml(item.title)}</div>
        ${item.price ? `<div class="card-price">${escapeHtml(item.price)}</div>` : `<div class="card-note">Ketuk untuk membuka produk di Shopee.</div>`}
        ${cardActionsHtml(item)}
      </div>
    </div>
  `).join('')}</div>`;
}

/* ---------- Firestore: baca data (realtime, kedua halaman) ---------- */

function startListening(){
  updateStorageBadge('loading');
  db.collection('products').onSnapshot(
    (snapshot) => {
      links = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateStorageBadge('ok');
      render();
    },
    (err) => {
      updateStorageBadge('warn', 'Gagal memuat: ' + err.message);
    }
  );
}

window.copyLink = async function(id){
  const item = links.find(l => l.id === id);
  if(!item) return;
  try{
    await navigator.clipboard.writeText(item.url);
    showToast('Link produk disalin');
  }catch(e){
    showToast('Gagal menyalin link');
  }
};

/* ---------- Admin-only: auth + tulis data ---------- */

if(isAdmin){
  window.deleteLink = async function(id){
    try{
      await db.collection('products').doc(id).delete();
      showToast('Produk dihapus dari etalase');
    }catch(e){
      showToast('Gagal menghapus: ' + e.message);
    }
  };

  if(form){
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      formMsg.textContent = '';
      try{
        const title = document.getElementById('f-title').value.trim();
        const urlRaw = document.getElementById('f-url').value.trim();
        const categoryRaw = document.getElementById('f-category').value.trim();
        const image = document.getElementById('f-image').value.trim();
        const price = document.getElementById('f-price').value.trim();

        if(!title || !urlRaw){
          formMsg.textContent = 'Isi nama produk dan link Shopee dulu, ya.';
          return;
        }
        const url = normalizeUrl(urlRaw);
        try{ new URL(url); }catch(e){
          formMsg.textContent = 'Link Shopee belum valid.';
          return;
        }
        let imageUrl = '';
        if(image){
          imageUrl = normalizeUrl(image);
          try{ new URL(imageUrl); }catch(e){
            formMsg.textContent = 'Link gambar belum valid.';
            return;
          }
        }
        const category = categoryRaw || DEFAULT_CATEGORY;

        await db.collection('products').add({
          title, url, category, price, image: imageUrl,
          createdAt: Date.now()
        });
        form.reset();
        document.getElementById('f-title').focus();
        showToast('Produk ditambahkan ke etalase');
      }catch(err){
        console.error('Gagal menambah produk:', err);
        formMsg.textContent = 'Terjadi error: ' + (err && err.message ? err.message : String(err));
      }
    });
  }

  if(clearAllBtn){
    clearAllBtn.addEventListener('click', async () => {
      if(links.length === 0) return;
      if(!confirm('Hapus semua produk dari etalase ini?')) return;
      try{
        await Promise.all(links.map(item => db.collection('products').doc(item.id).delete()));
        showToast('Etalase dikosongkan');
      }catch(e){
        showToast('Gagal mengosongkan: ' + e.message);
      }
    });
  }

  if(loginForm){
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginMsg.textContent = '';
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      try{
        await auth.signInWithEmailAndPassword(email, password);
      }catch(err){
        loginMsg.textContent = 'Login gagal: email atau password salah.';
      }
    });
  }

  if(logoutBtn){
    logoutBtn.addEventListener('click', () => auth.signOut());
  }
}

/* ---------- Share button (kedua halaman) ---------- */

const shareBtn = document.getElementById('shareBtn');
if(shareBtn){
  shareBtn.addEventListener('click', async () => {
    const url = shareBtn.dataset.shareUrl || window.location.href;
    try{
      if(navigator.share){
        await navigator.share({ title: 'Etalase — Link Belanja Shopee', url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast('Link etalase disalin, siap dibagikan');
      }
    }catch(e){
      try{
        await navigator.clipboard.writeText(url);
        showToast('Link etalase disalin, siap dibagikan');
      }catch(e2){
        showToast('Gagal membagikan link');
      }
    }
  });
}

window.addEventListener('error', (e) => {
  console.error('Error tak tertangani:', e.error || e.message);
});

/* ---------- Inisialisasi ---------- */

if(!isConfigured){
  updateStorageBadge('warn', 'Firebase belum dikonfigurasi (lihat app.js)');
  render();
} else {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  if(isAdmin){
    auth = firebase.auth();
    auth.onAuthStateChanged((user) => {
      if(user){
        if(loginGate) loginGate.style.display = 'none';
        if(adminContent) adminContent.style.display = '';
        if(logoutBtn) logoutBtn.style.display = '';
        if(adminEmailLabel) adminEmailLabel.textContent = user.email;
        startListening();
      }else{
        if(loginGate) loginGate.style.display = '';
        if(adminContent) adminContent.style.display = 'none';
        if(logoutBtn) logoutBtn.style.display = 'none';
        if(adminEmailLabel) adminEmailLabel.textContent = '';
        links = [];
      }
    });
  } else {
    startListening();
  }
}
