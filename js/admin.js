/* ============================================================
   SiFas UIN — Sistem Peminjaman Fasilitas
   File   : js/admin.js
   Dimuat : index.html (urutan 5, setelah main.js)
   Fungsi : Semua logika dashboard admin:
            - loginAdmin()            → Firebase Auth sign in
            - logoutAdmin()           → sign out & kembali ke role select
            - adminNav()              → navigasi panel dalam dashboard
            - loadStats()             → hitung & render stat cards + tabel overview
            - loadPengajuan()         → ambil semua pengajuan dari Firestore (realtime)
            - renderTabelPengajuan()  → render baris tabel pengajuan
            - filterPengajuan()       → filter tabel by status & nama/ID
            - setujuiPengajuan()      → update status → 'disetujui' di Firestore
            - tolakPengajuan()        → buka modal alasan tolak
            - konfirmasiTolak()       → update status → 'ditolak' + alasan
            - renderFasilitasAdmin()  → render kartu fasilitas di panel kelola
            - bukaModalFasilitas()    → buka modal tambah/edit
            - simpanFasilitas()       → simpan ke Firestore koleksi 'fasilitas'
            - hapusFasilitas()        → hapus dari Firestore
            - renderAdminCalendar()   → kalender dengan warna per status booking
            - adminCalNav()           → navigasi bulan kalender admin
   ============================================================ */

/* ----------------------------------------------------------
   STATE GLOBAL ADMIN
   ---------------------------------------------------------- */
let _allPengajuan    = [];
let _fasilitasCache  = [];   // cache data fasilitas untuk modal edit
let _pendingTolakId  = null;
let _pendingTolakRef = null;
let _editFasilitasId = null;
let _unsubPengajuan  = null;

/**
 * Role yang sedang login: 'admin' | 'audit'
 * Diset oleh goLoginDenganRole() dan dibaca oleh semua fungsi
 * yang perlu membedakan akses.
 */
let _currentRole = 'admin';

let adminCalYear  = new Date().getFullYear();
let adminCalMonth = new Date().getMonth();

const ADM_BULAN = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];

/* ----------------------------------------------------------
   TUNGGU FIREBASE SIAP
   ---------------------------------------------------------- */
window.addEventListener('firebase-ready', () => {
  const { getAuth, onAuthStateChanged } = window._firebaseAuth;
  onAuthStateChanged(getAuth(), (user) => {
    if (user && document.getElementById('admin-dashboard').classList.contains('active')) {
      _initAdminDashboard(user);
    }
  });
});


/* ----------------------------------------------------------
   0. PILIH ROLE & ARAHKAN KE LOGIN
   Dipanggil dari role-select.html oleh tombol Admin & Audit.
   @param {string} role - 'admin' | 'audit'
   ---------------------------------------------------------- */
function goLoginDenganRole(role) {
  _currentRole = role;

  // Update title & subtitle di form login sesuai role
  const labelEl = document.getElementById('loginRoleLabel');
  const subEl   = document.getElementById('loginRoleSub');
  const btnEl   = document.getElementById('btnLoginSubmit');

  if (role === 'audit') {
    if (labelEl) labelEl.textContent = 'Login Audit';
    if (subEl)   subEl.textContent   = 'Masuk dengan akun audit SiFas UIN';
    if (btnEl)   btnEl.textContent   = 'Masuk sebagai Audit';
  } else {
    if (labelEl) labelEl.textContent = 'Login Admin';
    if (subEl)   subEl.textContent   = 'Masuk dengan akun admin SiFas UIN';
    if (btnEl)   btnEl.textContent   = 'Masuk sebagai Admin';
  }

  // Reset field & error
  const emailEl = document.getElementById('loginEmail');
  const passEl  = document.getElementById('loginPassword');
  const errEl   = document.getElementById('loginError');
  if (emailEl) emailEl.value = '';
  if (passEl)  passEl.value  = '';
  if (errEl)   errEl.style.display = 'none';

  go('login-admin');
}


/* ----------------------------------------------------------
   1. LOGIN (Admin & Audit) — Firebase Auth
   ---------------------------------------------------------- */
async function loginAdmin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btnEl    = document.getElementById('btnLoginSubmit');
  const errEl    = document.getElementById('loginError');

  if (!email || !password) {
    errEl.textContent   = 'Email dan password wajib diisi.';
    errEl.style.display = 'block';
    return;
  }

  btnEl.disabled    = true;
  btnEl.textContent = 'Memverifikasi...';
  errEl.style.display = 'none';

  try {
    const { getAuth, signInWithEmailAndPassword } = window._firebaseAuth;
    const auth       = getAuth();
    const credential = await signInWithEmailAndPassword(auth, email, password);

    // Cek role dari Firestore collection 'users'
    // Dokumen user menyimpan field 'role': 'admin' | 'audit'
    // Jika dokumen tidak ada → fallback ke _currentRole yang dipilih di role-select
    await _cekDanSetRole(credential.user);

    _initAdminDashboard(credential.user);
    go('admin-dashboard');

  } catch (err) {
    let pesan = 'Email atau password salah.';
    if (err.code === 'auth/too-many-requests')      pesan = 'Terlalu banyak percobaan. Coba lagi nanti.';
    if (err.code === 'auth/network-request-failed') pesan = 'Gagal terhubung. Periksa koneksi internet.';
    errEl.textContent   = pesan;
    errEl.style.display = 'block';
  } finally {
    btnEl.disabled    = false;
    btnEl.textContent = _currentRole === 'audit' ? 'Masuk sebagai Audit' : 'Masuk sebagai Admin';
  }
}

/**
 * Ambil role dari Firestore collection 'users/{uid}.role'.
 * Jika dokumen tidak ada, gunakan _currentRole dari pilihan role-select.
 * @param {Object} user - Firebase Auth user object
 */
async function _cekDanSetRole(user) {
  try {
    const { db, doc, getDoc } = window._firebase;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists() && snap.data().role) {
      _currentRole = snap.data().role; // 'admin' atau 'audit'
    }
    // Jika tidak ada dokumen, _currentRole tetap dari pilihan role-select
  } catch (e) {
    // Tidak bisa akses Firestore users → tetap pakai pilihan dari role-select
    console.warn('[SiFas] Tidak bisa cek role dari Firestore, pakai pilihan role-select.');
  }
}


/* ----------------------------------------------------------
   2. LOGOUT
   ---------------------------------------------------------- */
async function logoutAdmin() {
  if (_unsubPengajuan) { _unsubPengajuan(); _unsubPengajuan = null; }
  const { getAuth, signOut } = window._firebaseAuth;
  await signOut(getAuth());
  _currentRole = 'admin'; // reset
  go('role-select');
}


/* ----------------------------------------------------------
   3. INIT DASHBOARD — terapkan pembatasan sesuai role
   ---------------------------------------------------------- */
function _initAdminDashboard(user) {
  // ── Email & badge role di sidebar ──
  const emailEl = document.getElementById('adminEmailDisplay');
  if (emailEl) emailEl.textContent = user.email;

  const badgeEl = document.getElementById('sidebarRoleBadge');
  if (badgeEl) {
    badgeEl.textContent        = _currentRole === 'audit' ? 'AUDIT' : 'ADMIN';
    badgeEl.style.background   = _currentRole === 'audit' ? '#2d6bc4' : '';
  }

  // ── Tanggal di topbar ──
  const dateEl = document.getElementById('adminTodayDate');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = `${now.getDate()} ${ADM_BULAN[now.getMonth()]} ${now.getFullYear()}`;
  }

  // ── Terapkan pembatasan AUDIT ──
  _terapkanAksesRole();

  // ── Load data ──
  loadPengajuan();
  renderFasilitasAdmin();
  renderAdminCalendar();
}

/**
 * Terapkan pembatasan akses berdasarkan _currentRole.
 * Admin  → semua fitur aktif.
 * Audit  → hanya baca: sembunyikan tombol aksi, kunci menu fasilitas.
 */
function _terapkanAksesRole() {
  const isAudit = (_currentRole === 'audit');

  // Banner info di panel Pengajuan & Fasilitas
  const bannerP = document.getElementById('auditBannerPengajuan');
  const bannerF = document.getElementById('auditBannerFasilitas');
  if (bannerP) bannerP.style.display = isAudit ? 'flex' : 'none';
  if (bannerF) bannerF.style.display = isAudit ? 'flex' : 'none';

  // Menu Kelola Fasilitas di sidebar — kunci untuk audit
  const fasItem = document.getElementById('sidebarItemFasilitas');
  if (fasItem) {
    fasItem.style.opacity       = isAudit ? '0.4' : '1';
    fasItem.style.pointerEvents = isAudit ? 'none' : 'auto';
    fasItem.title               = isAudit ? 'Tidak tersedia untuk Audit' : '';
  }

  // Tombol "+ Tambah Fasilitas" di header panel fasilitas — disembunyikan untuk audit
  const btnTambahFas = document.querySelector('[onclick="bukaModalFasilitas()"]');
  if (btnTambahFas) btnTambahFas.style.display = isAudit ? 'none' : 'inline-block';
}


/* ----------------------------------------------------------
   4. NAVIGASI PANEL ADMIN
   @param {string}      panelKey - 'overview'|'pengajuan'|'fasilitas'|'kalender'
   @param {HTMLElement} el       - sidebar-item yang diklik
   ---------------------------------------------------------- */
const PANEL_TITLES = {
  overview:   'Overview',
  pengajuan:  'Pengajuan Masuk',
  fasilitas:  'Kelola Fasilitas',
  kalender:   'Kalender Booking'
};

function adminNav(panelKey, el) {
  // Sembunyikan semua panel
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`ap-${panelKey}`).classList.add('active');

  // Update sidebar active
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');

  // Update topbar title
  const titleEl = document.getElementById('adminPanelTitle');
  if (titleEl) titleEl.textContent = PANEL_TITLES[panelKey] || '';

  // Render ulang kalender saat panel kalender dibuka
  if (panelKey === 'kalender') renderAdminCalendar();
}


/* ----------------------------------------------------------
   5. LOAD PENGAJUAN (realtime listener dari Firestore)
   ---------------------------------------------------------- */
function loadPengajuan() {
  const { db, collection, query, orderBy, onSnapshot } = window._firebase;

  // Hentikan listener lama
  if (_unsubPengajuan) _unsubPengajuan();

  const q = query(collection(db, 'peminjaman'), orderBy('createdAt', 'desc'));

  _unsubPengajuan = onSnapshot(q, snapshot => {
    _allPengajuan = snapshot.docs.map(d => ({ _docId: d.id, ...d.data() }));
    loadStats();
    renderTabelPengajuan(_allPengajuan);
    renderAdminCalendar();
  });
}


/* ----------------------------------------------------------
   6. LOAD STATS & TABEL OVERVIEW
   ---------------------------------------------------------- */
function loadStats() {
  const total     = _allPengajuan.length;
  const menunggu  = _allPengajuan.filter(d => d.status === 'menunggu').length;
  const disetujui = _allPengajuan.filter(d => d.status === 'disetujui').length;
  const ditolak   = _allPengajuan.filter(d => d.status === 'ditolak').length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('statTotal',     total);
  set('statMenunggu',  menunggu);
  set('statDisetujui', disetujui);
  set('statDitolak',   ditolak);

  // Tabel overview: 5 terbaru
  const tbody = document.getElementById('tblOverviewBody');
  if (!tbody) return;

  const recent = _allPengajuan.slice(0, 5);
  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">Belum ada pengajuan.</td></tr>';
    return;
  }

  tbody.innerHTML = recent.map(d => `
    <tr>
      <td><strong>${d.bookingId}</strong></td>
      <td>${d.nama}</td>
      <td>${d.fasilitas}</td>
      <td>${_formatTgl(d.tanggal)}</td>
      <td>${_badgeStatus(d.status)}</td>
    </tr>
  `).join('');
}


/* ----------------------------------------------------------
   7. RENDER TABEL PENGAJUAN LENGKAP
   @param {Array} data - array dokumen pengajuan
   ---------------------------------------------------------- */
function renderTabelPengajuan(data) {
  const tbody = document.getElementById('tblPengajuan');
  if (!tbody) return;

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="tbl-empty">Tidak ada pengajuan ditemukan.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(d => {
    // Tombol aksi: hanya muncul untuk ADMIN dan status 'menunggu'
    const isAdmin = (_currentRole === 'admin');
    const aksi = (isAdmin && d.status === 'menunggu')
      ? `<div class="tbl-actions">
           <button class="btn-approve" onclick="setujuiPengajuan('${d._docId}')">✓ Setujui</button>
           <button class="btn-reject"  onclick="tolakPengajuan('${d._docId}')">✕ Tolak</button>
         </div>`
      : `<span style="font-size:11px; color:var(--gray-3)">–</span>`;

    return `
      <tr>
        <td><strong>${d.bookingId}</strong><br>
            <span style="font-size:11px; color:var(--gray-3)">${d.nim}</span></td>
        <td>${d.nama}<br>
            <span style="font-size:11px; color:var(--gray-3)">${d.email}</span></td>
        <td>${d.fasilitas}</td>
        <td>${_formatTgl(d.tanggal)}<br>
            <span style="font-size:11px; color:var(--gray-3)">${d.jamMulai} – ${d.jamSelesai}</span></td>
        <td>${d.jumlahPeserta} org</td>
        <td>${_badgeStatus(d.status)}</td>
        <td>${aksi}</td>
      </tr>
    `;
  }).join('');
}


/* ----------------------------------------------------------
   8. FILTER TABEL PENGAJUAN
   ---------------------------------------------------------- */
function filterPengajuan() {
  const status = document.getElementById('filterStatus').value;
  const query  = document.getElementById('searchPengajuan').value.toLowerCase();

  const filtered = _allPengajuan.filter(d => {
    const matchStatus = !status || d.status === status;
    const matchSearch = !query  ||
      d.nama.toLowerCase().includes(query) ||
      d.bookingId.toLowerCase().includes(query) ||
      d.nim.toLowerCase().includes(query);
    return matchStatus && matchSearch;
  });

  renderTabelPengajuan(filtered);
}


/* ----------------------------------------------------------
   MODAL KONFIRMASI CUSTOM
   Menggantikan browser confirm() yang posisinya tidak bisa dikontrol.
   ---------------------------------------------------------- */

/**
 * Tampilkan modal konfirmasi di tengah layar.
 * @param {Object} opts
 *   icon      {string} - emoji icon
 *   title     {string} - judul modal
 *   desc      {string} - deskripsi
 *   okLabel   {string} - teks tombol OK
 *   okClass   {string} - class CSS tombol OK (btn-approve / btn-reject / btn-del-fac)
 *   onOk      {Function} - callback saat OK diklik
 */
function _tampilKonfirmModal({ icon, title, desc, okLabel, okClass, onOk }) {
  document.getElementById('modalKonfirmIcon').textContent  = icon;
  document.getElementById('modalKonfirmTitle').textContent = title;
  document.getElementById('modalKonfirmDesc').textContent  = desc;

  const btnOk = document.getElementById('modalKonfirmOk');
  btnOk.textContent = okLabel;
  btnOk.className   = okClass;
  btnOk.onclick     = () => { tutupKonfirmModal(); onOk(); };

  document.getElementById('modalKonfirm').classList.add('open');
}

function tutupKonfirmModal() {
  document.getElementById('modalKonfirm').classList.remove('open');
}


/* ----------------------------------------------------------
   9. SETUJUI PENGAJUAN
   ---------------------------------------------------------- */
async function setujuiPengajuan(docId) {
  _tampilKonfirmModal({
    icon:     '✅',
    title:    'Setujui Pengajuan?',
    desc:     'Peminjam akan mendapat notifikasi bahwa pengajuannya telah disetujui.',
    okLabel:  'Ya, Setujui',
    okClass:  'btn-approve',
    onOk:     async () => {
      const { db, doc, updateDoc } = window._firebase;
      try {
        await updateDoc(doc(db, 'peminjaman', docId), {
          status: 'disetujui',
          alasanTolak: ''
        });
      } catch (err) {
        alert('Gagal menyetujui. Coba lagi.');
        console.error(err);
      }
    }
  });
}


/* ----------------------------------------------------------
   10. TOLAK PENGAJUAN — buka modal
   @param {string} docId
   ---------------------------------------------------------- */
function tolakPengajuan(docId) {
  _pendingTolakId  = docId;
  document.getElementById('inputAlasan').value = '';
  document.getElementById('modalTolak').classList.add('open');
}

function tutupModal() {
  _pendingTolakId = null;
  document.getElementById('modalTolak').classList.remove('open');
}

async function konfirmasiTolak() {
  const alasan = document.getElementById('inputAlasan').value.trim();
  if (!alasan) {
    alert('Masukkan alasan penolakan.');
    return;
  }

  const { db, doc, updateDoc } = window._firebase;
  try {
    await updateDoc(doc(db, 'peminjaman', _pendingTolakId), {
      status: 'ditolak',
      alasanTolak: alasan
    });
    tutupModal();
  } catch (err) {
    alert('Gagal menolak. Coba lagi.');
    console.error(err);
  }
}


/* ----------------------------------------------------------
   11. KELOLA FASILITAS — Render kartu
   ---------------------------------------------------------- */

/**
 * Data default fasilitas — sama persis dengan data.js di sisi peminjam.
 * Dipakai oleh _seedFasilitas() untuk mengisi Firestore
 * pertama kali saat collection 'fasilitas' masih kosong.
 */
const _defaultFasilitas = [
  {
    icon: '🏟️', img: '', nama: 'Aula Student Center',
    kapasitas: '200 Orang', lokasi: 'Student Center Lt. 2',
    badge: 'Tersedia', badgeClass: 'badge-green',
    desc: 'Aula representatif untuk kegiatan seminar, workshop, pelatihan, dan acara lainnya.',
    amenities: ['AC', 'LCD Projector', 'Sound System', 'Kursi', 'Mikrofon']
  },
  {
    icon: '🎤', img: '', nama: 'Ruang Seminar',
    kapasitas: '50 Orang', lokasi: 'Gedung Rektorat Lt. 3',
    badge: 'Tersedia', badgeClass: 'badge-green',
    desc: 'Ruang seminar modern dengan fasilitas lengkap untuk diskusi dan presentasi.',
    amenities: ['AC', 'Proyektor', 'Whiteboard', 'Kursi', 'Wifi']
  },
  {
    icon: '📽️', img: 'img/proyektor.jpg', nama: 'Proyektor LCD',
    kapasitas: '-', lokasi: 'Gedung Utama',
    badge: 'Tersedia', badgeClass: 'badge-green',
    desc: 'Proyektor LCD resolusi tinggi untuk keperluan presentasi dan acara.',
    amenities: ['HDMI', 'VGA', 'Remote', 'Layar']
  },
  {
    icon: '🔊', img: 'img/sound-system.jpg', nama: 'Sound System',
    kapasitas: '-', lokasi: 'Gudang Peralatan',
    badge: 'Terbatas', badgeClass: 'badge-amber',
    desc: 'Speaker dan mixer profesional untuk acara indoor maupun outdoor.',
    amenities: ['Speaker', 'Mixer', 'Mikrofon', 'Kabel']
  },
  {
    icon: '🎸', img: 'img/alat-musik.jpg', nama: 'Alat Musik',
    kapasitas: '-', lokasi: 'Ruang Seni',
    badge: 'Tersedia', badgeClass: 'badge-green',
    desc: 'Koleksi alat musik lengkap termasuk gitar, keyboard, drum, dan lainnya.',
    amenities: ['Gitar', 'Keyboard', 'Drum', 'Bass', 'Amplifier']
  },
  {
    icon: '🛵', img: '', nama: 'Sepeda Listrik',
    kapasitas: '1 Orang / unit', lokasi: 'Pos Keamanan Utama',
    badge: 'Tersedia', badgeClass: 'badge-green',
    desc: 'Sepeda listrik kampus untuk mobilitas di area UIN Jakarta. Tersedia beberapa unit, peminjaman per hari.',
    amenities: ['Helm', 'Kunci', 'Charger', 'Keranjang']
  },
  {
    icon: '💻', img: 'img/lab-komputer.jpg', nama: 'Lab Komputer',
    kapasitas: '40 Orang', lokasi: 'Gedung Teknik Lt. 2',
    badge: 'Penuh', badgeClass: 'badge-red',
    desc: 'Laboratorium komputer dengan spesifikasi tinggi untuk pembelajaran dan riset.',
    amenities: ['PC', 'AC', 'Projector', 'Printer', 'Internet']
  }
];

/**
 * Isi collection 'fasilitas' di Firestore dengan data default.
 * Hanya dipanggil jika collection masih kosong.
 */
async function _seedFasilitas() {
  const { db, collection, addDoc } = window._firebase;
  try {
    for (const f of _defaultFasilitas) {
      await addDoc(collection(db, 'fasilitas'), f);
    }
    console.log('[SiFas] Data fasilitas default berhasil ditambahkan.');
  } catch (err) {
    console.error('[SiFas] Gagal seed fasilitas:', err);
  }
}

async function renderFasilitasAdmin() {
  const grid = document.getElementById('fasilitasAdminGrid');
  if (!grid) return;

  const { db, collection, getDocs } = window._firebase;

  try {
    const snap = await getDocs(collection(db, 'fasilitas'));

    // Jika collection kosong → isi dulu dengan data default lalu render ulang
    if (snap.empty) {
      grid.innerHTML = `<div style="color:var(--gray-3); font-size:13px; padding:20px; grid-column:1/-1">
        ⏳ Mengisi data fasilitas default...
      </div>`;
      await _seedFasilitas();
      // Panggil ulang setelah seed selesai
      await renderFasilitasAdmin();
      return;
    }

    const list = snap.docs.map(d => ({ _id: d.id, ...d.data() }));

    // Simpan ke cache agar modal edit bisa pakai tanpa fetch ulang
    _fasilitasCache = list;

    grid.innerHTML = list.map(f => {
      const isAdmin = (_currentRole === 'admin');
      const aksiBtn = isAdmin
        ? `<div class="fac-admin-actions">
             <button class="btn-edit-fac" onclick="bukaModalFasilitas('${f._id}')">✏ Edit</button>
             <button class="btn-del-fac"  onclick="hapusFasilitas('${f._id}', '${f.nama}')">🗑 Hapus</button>
           </div>`
        : `<div style="font-size:11px; color:var(--gray-3); margin-top:8px;">👁 Hanya baca</div>`;

      const imgHtml = f.img
        ? `<div style="height:110px; overflow:hidden; border-radius:var(--radius) var(--radius) 0 0; margin:-14px -14px 12px -14px;">
             <img src="${f.img}" alt="${f.nama}"
                  style="width:100%; height:100%; object-fit:cover;"
                  onerror="this.parentElement.style.display='none'" />
           </div>`
        : `<div style="font-size:28px; text-align:center; margin-bottom:8px;">${f.icon || '🏛️'}</div>`;

      return `
        <div class="fac-admin-card">
          ${imgHtml}
          <div class="fa-top">
            <div>
              <h4>${f.nama}</h4>
              <p>${f.lokasi || ''}</p>
            </div>
            <span class="badge ${f.badgeClass || 'badge-green'}">${_labelStatus(f.badgeClass)}</span>
          </div>
          <p style="font-size:12px; color:var(--gray-3); margin-bottom:4px;">Kapasitas: ${f.kapasitas || '-'}</p>
          <p style="font-size:12px; color:var(--gray-3);">${f.desc || ''}</p>
          ${aksiBtn}
        </div>
      `;
    }).join('');

  } catch (err) {
    grid.innerHTML = `<div style="color:var(--red); font-size:13px;">Gagal memuat fasilitas.</div>`;
    console.error(err);
  }
}

/* Buka modal tambah / edit fasilitas */
async function bukaModalFasilitas(docId = null) {
  _editFasilitasId = docId;
  const titleEl = document.getElementById('modalFasilitasTitle');
  const btnEl   = document.getElementById('btnSimpanFasilitas');

  // Reset semua field dulu
  document.getElementById('facIcon').value   = '';
  document.getElementById('facNama').value   = '';
  document.getElementById('facKap').value    = '';
  document.getElementById('facLok').value    = '';
  document.getElementById('facAmen').value   = '';
  document.getElementById('facDesc').value   = '';
  document.getElementById('facStatus').value = 'badge-green';

  if (docId) {
    titleEl.textContent = 'Edit Fasilitas';
    btnEl.textContent   = 'Simpan Perubahan';

    // Cari data dari cache _fasilitasCache dulu (tidak perlu fetch ulang)
    const cached = _fasilitasCache.find(f => f._id === docId);
    if (cached) {
      document.getElementById('facIcon').value   = cached.icon       || '';
      document.getElementById('facNama').value   = cached.nama       || '';
      document.getElementById('facKap').value    = cached.kapasitas  || '';
      document.getElementById('facLok').value    = cached.lokasi     || '';
      document.getElementById('facAmen').value   = (cached.amenities || []).join(', ');
      document.getElementById('facDesc').value   = cached.desc       || '';
      document.getElementById('facStatus').value = cached.badgeClass || 'badge-green';
    } else {
      // Fallback: fetch dari Firestore
      try {
        const { db, doc, getDoc } = window._firebase;
        const snap = await getDoc(doc(db, 'fasilitas', docId));
        if (snap.exists()) {
          const f = snap.data();
          document.getElementById('facIcon').value   = f.icon       || '';
          document.getElementById('facNama').value   = f.nama       || '';
          document.getElementById('facKap').value    = f.kapasitas  || '';
          document.getElementById('facLok').value    = f.lokasi     || '';
          document.getElementById('facAmen').value   = (f.amenities || []).join(', ');
          document.getElementById('facDesc').value   = f.desc       || '';
          document.getElementById('facStatus').value = f.badgeClass || 'badge-green';
        }
      } catch (err) {
        console.error('[SiFas] Gagal ambil data fasilitas:', err);
        alert('Gagal memuat data fasilitas. Coba lagi.');
        return;
      }
    }
  } else {
    titleEl.textContent = 'Tambah Fasilitas';
    btnEl.textContent   = 'Simpan';
  }

  document.getElementById('modalFasilitas').classList.add('open');
}

function tutupModalFasilitas() {
  _editFasilitasId = null;
  document.getElementById('modalFasilitas').classList.remove('open');
}

/* Simpan fasilitas ke Firestore */
async function simpanFasilitas() {
  const data = {
    icon:       document.getElementById('facIcon').value.trim(),
    nama:       document.getElementById('facNama').value.trim(),
    kapasitas:  document.getElementById('facKap').value.trim(),
    lokasi:     document.getElementById('facLok').value.trim(),
    amenities:  document.getElementById('facAmen').value
                  .split(',').map(s => s.trim()).filter(Boolean),
    desc:       document.getElementById('facDesc').value.trim(),
    badgeClass: document.getElementById('facStatus').value,
    badge:      _labelStatus(document.getElementById('facStatus').value),
  };

  if (!data.nama) {
    alert('Nama fasilitas wajib diisi.');
    return;
  }

  const btnEl = document.getElementById('btnSimpanFasilitas');
  btnEl.disabled    = true;
  btnEl.textContent = 'Menyimpan...';

  const { db, collection, addDoc, doc, updateDoc } = window._firebase;

  try {
    if (_editFasilitasId) {
      await updateDoc(doc(db, 'fasilitas', _editFasilitasId), data);
    } else {
      await addDoc(collection(db, 'fasilitas'), data);
    }

    // Reset cache supaya renderFasilitasAdmin fetch data segar dari Firestore
    _fasilitasCache = [];

    tutupModalFasilitas();
    await renderFasilitasAdmin();

  } catch (err) {
    console.error('[SiFas] Gagal simpan fasilitas:', err);
    alert('Gagal menyimpan. Pastikan koneksi internet aktif dan coba lagi.');
  } finally {
    btnEl.disabled    = false;
    btnEl.textContent = _editFasilitasId ? 'Simpan Perubahan' : 'Simpan';
  }
}

/* Hapus fasilitas */
async function hapusFasilitas(docId, nama) {
  _tampilKonfirmModal({
    icon:    '🗑️',
    title:   'Hapus Fasilitas?',
    desc:    `"${nama}" akan dihapus permanen dan tidak bisa dikembalikan.`,
    okLabel: 'Ya, Hapus',
    okClass: 'btn-del-fac',
    onOk:    async () => {
      const { db, doc, deleteDoc } = window._firebase;
      try {
        await deleteDoc(doc(db, 'fasilitas', docId));
        renderFasilitasAdmin();
      } catch (err) {
        alert('Gagal menghapus.');
        console.error(err);
      }
    }
  });
}


/* ----------------------------------------------------------
   12. KALENDER ADMIN
   Warna: amber = menunggu, hijau = disetujui, abu = tidak ada
   ---------------------------------------------------------- */
function renderAdminCalendar() {
  const grid  = document.getElementById('adminCalGrid');
  const label = document.getElementById('adminCalLabel');
  if (!grid || !label) return;

  label.textContent = `${ADM_BULAN[adminCalMonth]} ${adminCalYear}`;

  // Simpan header nama hari
  const headers = Array.from(grid.querySelectorAll('.cal-day-name'));
  grid.innerHTML = '';
  headers.forEach(h => grid.appendChild(h));

  const firstDay  = new Date(adminCalYear, adminCalMonth, 1).getDay();
  const totalDays = new Date(adminCalYear, adminCalMonth + 1, 0).getDate();

  // Buat map: "YYYY-MM-DD" → array status
  const dayMap = {};
  _allPengajuan.forEach(d => {
    if (!d.tanggal) return;
    const [y, m, day] = d.tanggal.split('-');
    const key = `${y}-${m}-${String(day).padStart(2,'0')}`;
    if (!dayMap[key]) dayMap[key] = [];
    dayMap[key].push(d.status);
  });

  // Sel kosong
  for (let i = 0; i < firstDay; i++) {
    const e = document.createElement('div');
    e.className = 'cal-day empty';
    grid.appendChild(e);
  }

  const today = new Date();

  for (let d = 1; d <= totalDays; d++) {
    const mm  = String(adminCalMonth + 1).padStart(2, '0');
    const dd  = String(d).padStart(2, '0');
    const key = `${adminCalYear}-${mm}-${dd}`;
    const statuses = dayMap[key] || [];

    const cell = document.createElement('div');
    cell.textContent = d;
    cell.className   = 'cal-day';

    const isToday = (new Date(adminCalYear, adminCalMonth, d).toDateString() === today.toDateString());

    if (isToday) {
      cell.style.cssText = 'background:#1a56a0; color:white; font-weight:700;';
    } else if (statuses.includes('disetujui')) {
      cell.style.cssText = 'background:var(--green-light); color:var(--green); font-weight:600;';
    } else if (statuses.includes('menunggu')) {
      cell.style.cssText = 'background:var(--amber-light); color:var(--amber); font-weight:600;';
    }

    // Klik → tampilkan detail booking di tanggal itu
    if (statuses.length > 0) {
      cell.style.cursor = 'pointer';
      cell.title = `${statuses.length} booking`;
      cell.addEventListener('click', () => _tampilDetailKalender(key, statuses.length));
    }

    grid.appendChild(cell);
  }
}

function _tampilDetailKalender(dateKey, count) {
  const detailWrap = document.getElementById('adminCalDetail');
  const detailList = document.getElementById('adminCalDetailList');
  if (!detailWrap || !detailList) return;

  const bookings = _allPengajuan.filter(d => {
    if (!d.tanggal) return false;
    const [y, m, day] = d.tanggal.split('-');
    return `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}` === dateKey;
  });

  detailList.innerHTML = bookings.map(d => `
    <div style="background:var(--gray); border-radius:6px; padding:10px 12px; margin-bottom:6px; font-size:12px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
        <strong>${d.bookingId}</strong>
        ${_badgeStatus(d.status)}
      </div>
      <div>${d.nama} — ${d.fasilitas}</div>
      <div style="color:var(--gray-3)">${d.jamMulai} – ${d.jamSelesai} · ${d.jumlahPeserta} orang</div>
    </div>
  `).join('');

  detailWrap.style.display = 'block';
}

function adminCalNav(direction) {
  let m = adminCalMonth + direction;
  let y = adminCalYear;
  if (m < 0)  { m = 11; y--; }
  if (m > 11) { m = 0;  y++; }
  adminCalMonth = m;
  adminCalYear  = y;
  renderAdminCalendar();
  // Tutup detail saat bulan berubah
  const dw = document.getElementById('adminCalDetail');
  if (dw) dw.style.display = 'none';
}


/* ----------------------------------------------------------
   HELPER FUNCTIONS
   ---------------------------------------------------------- */

/** Format "2026-05-20" → "20 Mei 2026" */
function _formatTgl(tgl) {
  if (!tgl) return '-';
  const [y, m, d] = tgl.split('-');
  return `${parseInt(d)} ${ADM_BULAN[parseInt(m) - 1]} ${y}`;
}

/** Render badge HTML berdasarkan status */
function _badgeStatus(status) {
  const map = {
    menunggu:  ['badge-amber', 'Menunggu'],
    disetujui: ['badge-green', 'Disetujui'],
    ditolak:   ['badge-red',   'Ditolak'],
  };
  const [cls, label] = map[status] || ['badge-amber', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

/** Label teks dari badgeClass */
function _labelStatus(badgeClass) {
  return { 'badge-green': 'Tersedia', 'badge-amber': 'Terbatas', 'badge-red': 'Penuh' }[badgeClass] || 'Tersedia';
}