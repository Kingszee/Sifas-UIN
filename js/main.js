/* ============================================================
   SiFas UIN — Sistem Peminjaman Fasilitas
   File   : js/main.js
   Dimuat : index.html (urutan 4, terakhir)
   Fungsi : - loadAllPages()     → fetch & inject semua pages/*.html
            - go()               → navigasi antar halaman
            - showDetail()       → isi konten detail fasilitas
            - filterFacilities() → search & filter kartu fasilitas
            - setCat()           → filter kategori tab
            - submitForm()       → validasi form & kirim ke Firestore
            - tampilKonfirmasi() → isi halaman konfirmasi dengan data nyata
            - handleCekStatus()  → cek status booking dari input ID
            - tampilStatus()     → render panel status dari data Firestore
            - setStatus()        → tab switcher manual di halaman status
            - tampilBarcode()    → generate barcode asli via JsBarcode
            - init()             → inisialisasi setelah semua halaman dimuat
   ============================================================ */

/* ----------------------------------------------------------
   1. LOADER HALAMAN
   ---------------------------------------------------------- */
const PAGE_FILES = [
  'pages/role-select.html',
  'pages/login-admin.html',
  'pages/admin-dashboard.html',
  'pages/scanner.html',
  'pages/beranda.html',
  'pages/fasilitas.html',
  'pages/detail.html',
  'pages/form.html',
  'pages/konfirmasi.html',
  'pages/status.html',
  'pages/cara.html',
  // barcode.html di-inject langsung oleh _injectBarcodePage() — tidak di-fetch
];

async function loadHTML(url, target, append = true) {
  try {
    const res  = await fetch(url);
    if (!res.ok) {
      console.error(`[SiFas] Gagal fetch ${url}: ${res.status}`);
      return;
    }
    const html = await res.text();
    if (append) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      while (wrapper.firstChild) target.appendChild(wrapper.firstChild);
    } else {
      target.innerHTML = html;
    }
  } catch (err) {
    console.error(`[SiFas] Error fetch ${url}:`, err);
  }
}

async function loadAllPages() {
  const rootNavbar = document.getElementById('root-navbar');
  const rootPages  = document.getElementById('root-pages');

  await loadHTML('pages/navbar.html', rootNavbar, false);
  for (const file of PAGE_FILES) {
    await loadHTML(file, rootPages, true);
  }

  // Inject halaman barcode langsung — tidak via fetch karena sering gagal ter-parse
  _injectBarcodePage(rootPages);

  init();
}

/** Inject halaman barcode langsung ke DOM tanpa fetch */
function _injectBarcodePage(container) {
  const div = document.createElement('div');
  div.id        = 'barcode';
  div.className = 'page';
  div.innerHTML = `
    <div class="barcode-card">
      <div style="width:48px;height:48px;background:var(--green-light);border-radius:50%;
                  display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h2 style="font-size:17px;font-weight:700;margin-bottom:6px;">Peminjaman Disetujui!</h2>
      <p style="font-size:12px;color:var(--gray-3)">Tunjukkan barcode ini kepada petugas saat pengambilan fasilitas.</p>
      <div id="barcodeWrap" style="background:#f8f9fa;border-radius:8px;margin:16px 0;
           padding:16px;display:flex;justify-content:center;align-items:center;min-height:130px;">
        <svg id="barcodeCanvas" style="display:block;max-width:100%;"></svg>
      </div>
      <table class="detail-table">
        <tr><td>Nama</td>          <td style="font-weight:500" id="barcodeNama">-</td></tr>
        <tr><td>Fasilitas</td>     <td style="font-weight:500" id="barcodeFasilitas">-</td></tr>
        <tr><td>Tanggal</td>       <td style="font-weight:500" id="barcodeTanggal">-</td></tr>
        <tr><td>Waktu</td>         <td style="font-weight:500" id="barcodeWaktu">-</td></tr>
        <tr><td>Tujuan</td>        <td style="font-weight:500" id="barcodeTujuan">-</td></tr>
        <tr><td>Jumlah Peserta</td><td style="font-weight:500" id="barcodePeserta">-</td></tr>
      </table>
      <p style="font-size:11px;color:var(--gray-3);margin-top:10px;">
        Barcode berlaku pada tanggal dan waktu yang sudah ditentukan.
      </p>
      <div class="btn-row">
        <button class="btn-outline" onclick="window.print()">🖨 Cetak / Simpan</button>
        <button class="btn-primary" style="border:none;cursor:pointer" onclick="go('beranda')">Kembali ke Beranda</button>
      </div>
    </div>`;
  container.appendChild(div);
}


/* ----------------------------------------------------------
   2. NAVIGASI HALAMAN
   ---------------------------------------------------------- */
const NAV_MAP = {
  beranda:   0,
  fasilitas: 1,
  cara:      2,
  status:    3,
};

/**
 * Halaman yang TIDAK menampilkan navbar user.
 * (role-select, login-admin, admin-dashboard punya layout sendiri)
 */
const PAGES_NO_NAVBAR = new Set(['role-select', 'login-admin', 'admin-dashboard', 'scanner']);

/**
 * Masuk sebagai peminjam (dari role-select.html).
 * Tampilkan navbar & langsung ke beranda.
 */
function masukSebagaiUser() {
  document.getElementById('root-navbar').style.display = 'block';
  go('beranda');
}

function go(page) {
  // Stop listener realtime kalau keluar dari halaman status
  if (page !== 'status' && typeof stopListeners === 'function') {
    stopListeners();
  }

  // Stop kamera kalau keluar dari halaman scanner
  if (page !== 'scanner' && typeof _stopCamera === 'function') {
    _stopCamera();
  }

  // Sembunyikan / tampilkan navbar sesuai jenis halaman
  const navbar = document.getElementById('root-navbar');
  if (navbar) {
    navbar.style.display = PAGES_NO_NAVBAR.has(page) ? 'none' : 'block';
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const target = document.getElementById(page);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (NAV_MAP[page] !== undefined) {
    document.querySelectorAll('.nav-btn')[NAV_MAP[page]].classList.add('active');
  }

  // Kalender detail sudah di-render oleh loadBookingDates() saat showDetail() dipanggil
  // Tidak perlu renderCalendar() di sini lagi

  window.scrollTo(0, 0);
}


/* ----------------------------------------------------------
   3. DETAIL FASILITAS
   ---------------------------------------------------------- */
async function showDetail(key) {
  // Coba ambil data dari Firestore dulu (real-time, sesuai yang admin edit)
  // Fallback ke data.js kalau Firestore belum siap atau data tidak ada
  let f = null;

  if (window._firebaseReady) {
    try {
      const { db, collection, getDocs, query, where } = window._firebase;
      // Cari fasilitas di Firestore berdasarkan nama yang sesuai key di data.js
      const staticData = facilities[key];
      if (staticData) {
        const q = query(collection(db, 'fasilitas'), where('nama', '==', staticData.name));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0].data();
          // Gabungkan data Firestore dengan key dari data.js
          f = {
            icon:       d.icon       || staticData.icon,
            img:        d.img        || staticData.img  || '',
            name:       d.nama       || staticData.name,
            cap:        d.kapasitas  || staticData.cap,
            loc:        d.lokasi     || staticData.loc,
            badge:      d.badge      || staticData.badge,
            badgeClass: d.badgeClass || staticData.badgeClass,
            desc:       d.desc       || staticData.desc,
            amenities:  d.amenities  || staticData.amenities,
          };
        }
      }
    } catch (err) {
      console.warn('[SiFas] Gagal baca Firestore, pakai data.js:', err.message);
    }
  }

  // Fallback ke data.js kalau Firestore gagal atau belum siap
  if (!f) f = facilities[key];
  if (!f) return;

  // Gambar atau emoji di area detail
  const detailIcon = document.getElementById('detailIcon');
  if (detailIcon) {
    if (f.img) {
      detailIcon.innerHTML = `<img src="${f.img}" alt="${f.name}"
        style="width:100%; height:100%; object-fit:contain; border-radius:var(--radius); padding:8px;"
        onerror="this.parentElement.innerHTML='${f.icon}'; this.parentElement.style.fontSize='48px';" />`;
      detailIcon.style.fontSize = '';
    } else {
      detailIcon.innerHTML = f.icon;
      detailIcon.style.fontSize = '48px';
      detailIcon.style.display  = 'flex';
      detailIcon.style.alignItems    = 'center';
      detailIcon.style.justifyContent = 'center';
    }
  }

  document.getElementById('detailName').textContent  = f.name;
  document.getElementById('detailCap').textContent   = f.cap;
  document.getElementById('detailLoc').textContent   = f.loc;
  document.getElementById('detailBadge').textContent = f.badge;
  document.getElementById('detailBadge').className   = 'badge ' + f.badgeClass;
  document.getElementById('detailDesc').textContent  = f.desc;
  document.getElementById('detailAmenities').innerHTML =
    (f.amenities || []).map(a => `<span class="amenity">${a}</span>`).join('');

  const selectFasilitas = document.getElementById('selectFasilitas');
  if (selectFasilitas) selectFasilitas.value = f.name;

  if (typeof loadBookingDates === 'function') {
    loadBookingDates(f.name);
  }

  go('detail');
}


/* ----------------------------------------------------------
   4. SEARCH & FILTER FASILITAS
   ─ filterFacilities()   → filter by teks pencarian (search bar)
   ─ setCat()             → filter by tab kategori (sync dropdown)
   ─ filterByDropdown()   → filter by dropdown (sync tab)
   ─ _applyFilter()       → logika filter terpusat (dipakai keduanya)
   ---------------------------------------------------------- */

/** State aktif filter kategori */
let _activeCat = 'Semua';

/**
 * Logika filter terpusat.
 * Cek BOTH kategori aktif DAN teks pencarian sekaligus.
 */
function _applyFilter() {
  const query = document.getElementById('searchInput')
    ? document.getElementById('searchInput').value.toLowerCase()
    : '';

  document.querySelectorAll('#facGrid .facility-card').forEach(card => {
    const name    = card.querySelector('.fac-name').textContent.toLowerCase();
    const cardCat = card.getAttribute('data-cat');

    const matchCat    = (_activeCat === 'Semua' || cardCat === _activeCat);
    const matchSearch = !query || name.includes(query);

    card.style.display = (matchCat && matchSearch) ? 'block' : 'none';
  });
}

/** Dipanggil oleh oninput search bar */
function filterFacilities() {
  _applyFilter();
}

/**
 * Dipanggil oleh tombol tab kategori.
 * Sinkronkan juga dropdown.
 */
function setCat(btn, cat) {
  _activeCat = cat;

  // Update active tab
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Sinkronkan dropdown
  const dropdown = document.getElementById('catFilter');
  if (dropdown) dropdown.value = cat;

  _applyFilter();
}

/**
 * Dipanggil oleh onchange dropdown.
 * Sinkronkan juga tombol tab.
 */
function filterByDropdown(selectEl) {
  const cat = selectEl.value;
  _activeCat = cat;

  // Sinkronkan tab
  document.querySelectorAll('.cat-btn').forEach(btn => {
    const btnCat = btn.textContent.trim();
    btn.classList.toggle('active',
      (cat === 'Semua' && btnCat === 'Semua') || btnCat === cat
    );
  });

  _applyFilter();
}


/* ----------------------------------------------------------
   5. FORM PEMINJAMAN → FIREBASE
   ---------------------------------------------------------- */

/**
 * Validasi & submit form ke Firestore via firebase.js.
 * Dipanggil oleh tombol "Kirim Pengajuan" di form.html.
 */
async function submitForm() {
  const formData = {
    nama:          document.getElementById('inputNama').value.trim(),
    nim:           document.getElementById('inputNim').value.trim(),
    email:         document.getElementById('inputEmail').value.trim(),
    noHp:          document.getElementById('inputNoHp').value.trim(),
    fasilitas:     document.getElementById('selectFasilitas').value,
    tanggal:       document.getElementById('inputTanggal').value,
    jamMulai:      document.getElementById('inputJamMulai').value,
    jamSelesai:    document.getElementById('inputJamSelesai').value,
    tujuan:        document.getElementById('inputTujuan').value.trim(),
    jumlahPeserta: document.getElementById('inputPeserta').value,
  };

  const wajib = ['nama','nim','email','noHp','fasilitas','tanggal','jamMulai','jamSelesai','tujuan','jumlahPeserta'];
  for (const key of wajib) {
    if (!formData[key]) {
      tampilAlert('Harap lengkapi semua field yang wajib diisi (*).');
      return;
    }
  }

  if (formData.jamSelesai <= formData.jamMulai) {
    tampilAlert('Jam selesai harus lebih dari jam mulai.');
    return;
  }

  const btnKirim = document.getElementById('btnKirim');
  btnKirim.disabled    = true;
  btnKirim.textContent = 'Mengirim...';

  try {
    const bookingId = await submitPeminjaman(formData);
    tampilKonfirmasi(bookingId, formData);
    go('konfirmasi');

  } catch (err) {
    console.error('[SiFas] Gagal submit:', err);
    tampilAlert('Gagal mengirim pengajuan. Periksa koneksi internet Anda dan coba lagi.');
  } finally {
    btnKirim.disabled    = false;
    btnKirim.textContent = 'Kirim Pengajuan';
  }
}

/** Tampilkan pesan error ringan di atas form */
function tampilAlert(pesan) {
  let el = document.getElementById('formAlert');
  if (!el) {
    el = document.createElement('div');
    el.id = 'formAlert';
    el.style.cssText = `
      background:#fee2e2; color:#dc2626; border:1px solid #fca5a5;
      border-radius:6px; padding:10px 14px; font-size:13px;
      margin-bottom:12px;
    `;
    document.querySelector('.form-card').prepend(el);
  }
  el.textContent = pesan;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}


/* ----------------------------------------------------------
   6. HALAMAN KONFIRMASI — isi dengan data nyata dari form
   ---------------------------------------------------------- */
function tampilKonfirmasi(bookingId, formData) {
  const [y, m, d]   = formData.tanggal.split('-');
  const tglFormatted = `${parseInt(d)} ${NAMA_BULAN[parseInt(m) - 1]} ${y}`;

  document.getElementById('konfBookingId').textContent  = bookingId;
  document.getElementById('konfFasilitas').textContent  = formData.fasilitas;
  document.getElementById('konfTanggal').textContent    = tglFormatted;
  document.getElementById('konfWaktu').textContent      = `${formData.jamMulai} - ${formData.jamSelesai}`;
  document.getElementById('konfTujuan').textContent     = formData.tujuan;
  document.getElementById('konfPeserta').textContent    = formData.jumlahPeserta + ' Orang';
  document.getElementById('konfEmail').textContent      = formData.email;

  localStorage.setItem('lastBookingId', bookingId);
}


/* ----------------------------------------------------------
   7. HALAMAN STATUS — CEK & REALTIME
   ---------------------------------------------------------- */

/**
 * Dipanggil oleh tombol "Cek Status" di status.html.
 * Membaca input ID booking, lalu pasang realtime listener.
 */
function handleCekStatus() {
  const inputEl = document.getElementById('inputBookingId');
  const bookingId = inputEl ? inputEl.value.trim() : '';

  if (!bookingId) {
    document.getElementById('statusResult').innerHTML =
      `<div class="info-banner danger">Masukkan ID Booking terlebih dahulu.</div>`;
    return;
  }

  // Tampilkan loading
  document.getElementById('statusResult').innerHTML =
    `<div class="info-banner info">⏳ Memuat data...</div>`;

  // Pasang listener realtime — UI akan update otomatis jika admin ubah status
  listenStatus(bookingId, (data) => {
    if (!data) {
      document.getElementById('statusResult').innerHTML =
        `<div class="info-banner danger">❌ ID Booking <strong>${bookingId}</strong> tidak ditemukan.</div>`;
      return;
    }
    tampilStatus(data);
  });
}

/**
 * Render panel status dari data Firestore.
 * @param {Object} data - dokumen Firestore
 */
function tampilStatus(data) {
  const [y, m, d]   = data.tanggal.split('-');
  const tglFormatted = `${parseInt(d)} ${NAMA_BULAN[parseInt(m) - 1]} ${y}`;

  let badgeClass, badgeLabel, bannerClass, bannerText, extraBtn = '';

  switch (data.status) {
    case 'disetujui':
      badgeClass  = 'badge-green';
      badgeLabel  = 'Disetujui';
      bannerClass = 'success';
      bannerText  = '✓ Pengajuan Anda telah <strong>disetujui</strong>. Silakan lihat barcode untuk pengambilan.';
      extraBtn    = `<button class="btn-ajukan" onclick="tampilBarcode('${data.bookingId}')" style="margin-top:14px">
                      📱 Lihat Barcode
                    </button>`;
      break;
    case 'ditolak':
      badgeClass  = 'badge-red';
      badgeLabel  = 'Ditolak';
      bannerClass = 'danger';
      bannerText  = `✕ Pengajuan Anda <strong>ditolak</strong>.${
        data.alasanTolak ? `<br><strong>Alasan:</strong> ${data.alasanTolak}` : ''
      } Silakan ajukan kembali dengan tanggal lain.`;
      extraBtn    = `<button class="btn-ajukan" onclick="go('fasilitas')" style="margin-top:14px">
                      Ajukan Kembali
                    </button>`;
      break;
    default: // menunggu
      badgeClass  = 'badge-amber';
      badgeLabel  = 'Menunggu Verifikasi';
      bannerClass = 'info';
      bannerText  = 'ℹ️ Pengajuan Anda sedang menunggu verifikasi admin. Halaman ini update otomatis.';
  }

  document.getElementById('statusResult').innerHTML = `
    <div class="tracking-card">
      <div class="track-header">
        <div class="track-id">
          <span>ID Booking</span>
          <strong>${data.bookingId}</strong>
        </div>
        <span class="badge ${badgeClass}">${badgeLabel}</span>
      </div>

      <div class="info-banner ${bannerClass}" style="margin:12px 0">
        ${bannerText}
      </div>

      <div style="border-top:1px solid var(--border); padding-top:14px;">
        <table class="detail-table" style="margin-top:0; border-top:none; padding-top:0">
          <tr><td>Fasilitas</td>     <td style="font-weight:500">${data.fasilitas}</td></tr>
          <tr><td>Tanggal</td>       <td style="font-weight:500">${tglFormatted}</td></tr>
          <tr><td>Waktu</td>         <td style="font-weight:500">${data.jamMulai} - ${data.jamSelesai}</td></tr>
          <tr><td>Tujuan</td>        <td style="font-weight:500">${data.tujuan}</td></tr>
          <tr><td>Jumlah Peserta</td><td style="font-weight:500">${data.jumlahPeserta} Orang</td></tr>
          <tr><td>Nama</td>          <td style="font-weight:500">${data.nama}</td></tr>
          <tr><td>NIM</td>           <td style="font-weight:500">${data.nim}</td></tr>
        </table>
      </div>

      ${extraBtn}
    </div>
  `;
}

/**
 * Auto-isi input ID booking dari localStorage (setelah submit form)
 * dan langsung cek statusnya.
 */
function autoLoadLastBooking() {
  const lastId = localStorage.getItem('lastBookingId');
  const inputEl = document.getElementById('inputBookingId');
  if (lastId && inputEl) {
    inputEl.value = lastId;
    handleCekStatus();
  }
}


/* ----------------------------------------------------------
   8. BARCODE — tampilkan di halaman barcode
   Barcode asli di-generate oleh JsBarcode via tampilBarcode()
   ---------------------------------------------------------- */

/**
 * Isi halaman barcode dengan data booking yang disetujui.
 * @param {string} bookingId
 */
async function tampilBarcode(bookingId) {
  const data = await cekStatusBooking(bookingId);
  if (!data) return;

  const [y, m, d]   = data.tanggal.split('-');
  const tglFormatted = `${parseInt(d)} ${NAMA_BULAN[parseInt(m) - 1]} ${y}`;

  // Pastikan halaman barcode ada di DOM, inject jika belum
  if (!document.getElementById('barcode')) {
    _injectBarcodePage(document.getElementById('root-pages'));
  }

  // Pindah ke halaman barcode
  go('barcode');

  // Isi data + render barcode setelah halaman aktif
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const nama = document.getElementById('barcodeNama');
      if (!nama) { console.error('[SiFas] barcodeNama masih null'); return; }

      nama.textContent = data.nama;
      document.getElementById('barcodeFasilitas').textContent = data.fasilitas;
      document.getElementById('barcodeTanggal').textContent   = tglFormatted;
      document.getElementById('barcodeWaktu').textContent     = `${data.jamMulai} - ${data.jamSelesai}`;
      document.getElementById('barcodeTujuan').textContent    = data.tujuan;
      document.getElementById('barcodePeserta').textContent   = data.jumlahPeserta + ' Orang';

      _renderBarcode(data.bookingId);
    });
  });
}

function _renderBarcode(bookingId) {
  const wrap = document.getElementById('barcodeWrap');
  if (!wrap) { console.error('[SiFas] #barcodeWrap tidak ditemukan'); return; }

  wrap.innerHTML = '';

  // Coba JsBarcode dulu (sudah confirmed load = function)
  if (typeof JsBarcode !== 'undefined') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'display:block; max-width:100%; min-width:280px;';
    wrap.appendChild(svg);
    try {
      JsBarcode(svg, bookingId, {
        format:       'CODE128',
        width:        2,
        height:       80,
        displayValue: true,
        fontSize:     13,
        margin:       10,
        background:   '#f8f9fa',
        lineColor:    '#000000',
      });
      console.log('[SiFas] Barcode CODE128 OK:', bookingId);
      return;
    } catch(e) {
      console.warn('[SiFas] JsBarcode gagal:', e.message);
      wrap.innerHTML = '';
    }
  }

  // Fallback: tampilkan ID sebagai teks besar yang bisa diketik manual
  wrap.innerHTML = `
    <div style="text-align:center; padding:16px;">
      <div style="font-size:11px; color:var(--gray-3); margin-bottom:8px;">ID Booking</div>
      <div style="font-family:monospace; font-size:20px; font-weight:700;
                  letter-spacing:3px; color:var(--text); padding:12px 16px;
                  background:white; border:2px solid var(--border); border-radius:6px;
                  display:inline-block;">
        ${bookingId}
      </div>
      <div style="font-size:11px; color:var(--gray-3); margin-top:8px;">
        Tunjukkan ID ini kepada petugas atau gunakan input manual di Scanner
      </div>
    </div>`;
}


/* ----------------------------------------------------------
   9. FEATURE SLIDER (Beranda)
   ─ sliderNav(dir)   → geser -1 (prev) atau +1 (next)
   ─ sliderGoTo(idx)  → langsung ke slide tertentu (klik dot)
   ─ _sliderRender()  → update posisi track + highlight dot
   ─ Auto-slide tiap 3.5 detik, pause saat hover / touch
   ---------------------------------------------------------- */
let _sliderIdx     = 0;
let _sliderTotal   = 3;   // sesuai jumlah .fslider-slide di beranda.html
let _sliderTimer   = null;
const SLIDER_DELAY = 3500;

function _sliderRender() {
  const track = document.getElementById('fsliderTrack');
  if (track) track.style.transform = `translateX(-${_sliderIdx * 100}%)`;

  document.querySelectorAll('.fslider-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === _sliderIdx);
  });
}

function sliderNav(dir) {
  _sliderIdx = (_sliderIdx + dir + _sliderTotal) % _sliderTotal;
  _sliderRender();
  _sliderResetTimer();
}

function sliderGoTo(idx) {
  _sliderIdx = idx;
  _sliderRender();
  _sliderResetTimer();
}

function _sliderStartTimer() {
  _sliderTimer = setInterval(() => {
    _sliderIdx = (_sliderIdx + 1) % _sliderTotal;
    _sliderRender();
  }, SLIDER_DELAY);
}

function _sliderResetTimer() {
  clearInterval(_sliderTimer);
  _sliderStartTimer();
}

function _sliderInit() {
  const wrap = document.querySelector('.fslider-wrap');
  if (!wrap) return;

  _sliderIdx = 0;
  _sliderRender();
  _sliderStartTimer();

  // Pause auto-slide saat hover
  wrap.addEventListener('mouseenter', () => clearInterval(_sliderTimer));
  wrap.addEventListener('mouseleave', () => _sliderStartTimer());

  // Swipe support (mobile)
  let touchStartX = 0;
  wrap.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  wrap.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 40) sliderNav(diff > 0 ? 1 : -1);
  }, { passive: true });
}


/* ----------------------------------------------------------
   10. INISIALISASI
   ---------------------------------------------------------- */
function init() {
  // Sembunyikan navbar dulu — tampil setelah user pilih "Peminjam"
  const navbar = document.getElementById('root-navbar');
  if (navbar) navbar.style.display = 'none';

  // Mulai dari halaman pemilihan peran
  go('role-select');

  renderCalendar();
  _sliderInit();
}


/* ----------------------------------------------------------
   11. ENTRY POINT
   ---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', loadAllPages);