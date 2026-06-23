/* ============================================================
   SiFas UIN — Sistem Peminjaman Fasilitas
   File   : js/scanner.js
   Dimuat : index.html (setelah main.js)
   Fungsi : Scanner barcode via kamera untuk validasi peminjam
            Library: html5-qrcode (dimuat via CDN di index.html)
   ============================================================ */

let _html5QrCode   = null;   // instance scanner
let _scannerActive = false;  // flag kamera sedang jalan

const NAMA_BULAN_SC = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];


/* ----------------------------------------------------------
   1. BUKA SCANNER
   Dipanggil dari role-select.html (tombol Scanner)
   ---------------------------------------------------------- */
function bukaScanner() {
  // Reset hasil & input manual
  const resultEl = document.getElementById('scannerResult');
  const inputEl  = document.getElementById('scannerManualInput');
  const statusEl = document.getElementById('scannerCamStatus');
  if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
  if (inputEl)  inputEl.value = '';
  if (statusEl) statusEl.textContent = 'Memulai kamera...';

  go('scanner');

  // Mulai kamera setelah halaman tampil
  setTimeout(_startCamera, 300);
}


/* ----------------------------------------------------------
   2. MULAI KAMERA
   ---------------------------------------------------------- */
function _startCamera() {
  if (typeof Html5Qrcode === 'undefined') {
    _tampilStatusKam('❌ Library scanner tidak tersedia.');
    return;
  }

  if (_html5QrCode && _scannerActive) return;

  try {
    _html5QrCode = new Html5Qrcode('scannerCam');

    // Config optimal untuk QR Code
    const config = {
      fps:         20,
      qrbox:       { width: 250, height: 250 },
      aspectRatio: 1.0,
    };

    // Tambah format jika library support
    if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
      config.formatsToSupport = [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
      ];
    }

    _html5QrCode.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => { _onScanSuccess(decodedText); },
      (errorMsg)    => { /* abaikan error per-frame */ }
    )
    .then(() => {
      _scannerActive = true;
      _tampilStatusKam('');
    })
    .catch(err => {
      _scannerActive = false;
      if (err.toString().includes('permission')) {
        _tampilStatusKam('❌ Izin kamera ditolak. Mohon izinkan akses kamera di browser.');
      } else {
        _tampilStatusKam('❌ Kamera tidak bisa dibuka. Gunakan input manual di bawah.');
      }
    });

  } catch (err) {
    _tampilStatusKam('❌ Gagal memulai scanner: ' + err.message);
  }
}

function _tampilStatusKam(pesan) {
  const el = document.getElementById('scannerCamStatus');
  if (!el) return;
  el.textContent     = pesan;
  el.style.display   = pesan ? 'flex' : 'none';
}


/* ----------------------------------------------------------
   3. TUTUP SCANNER & HENTIKAN KAMERA
   Dipanggil tombol "← Kembali"
   ---------------------------------------------------------- */
async function tutupScanner() {
  await _stopCamera();
  go('role-select');
}

async function _stopCamera() {
  if (_html5QrCode && _scannerActive) {
    try {
      await _html5QrCode.stop();
      _html5QrCode.clear();
    } catch (e) { /* abaikan */ }
    _html5QrCode   = null;
    _scannerActive = false;
  }
}


/* ----------------------------------------------------------
   4. HANDLER SAAT SCAN BERHASIL
   @param {string} text - teks hasil scan (booking ID atau URL)
   ---------------------------------------------------------- */
let _lastScanned = '';  // cegah scan berulang untuk barcode yang sama

async function _onScanSuccess(text) {
  // Ambil booking ID dari teks — bisa berupa ID langsung atau embedded di teks
  const match = text.match(/SF\d{6}-\d{4}/);
  const bookingId = match ? match[0] : text.trim();

  if (bookingId === _lastScanned) return;
  _lastScanned = bookingId;

  // Pause kamera sementara
  if (_html5QrCode && _scannerActive) {
    try { await _html5QrCode.pause(); } catch(e) {}
  }

  // Tampilkan loading
  _tampilHasilScan('loading', null, bookingId);

  // Cari data ke Firestore
  const data = await cekStatusBooking(bookingId);
  _tampilHasilScan(data ? data.status : 'notfound', data, bookingId);
}


/* ----------------------------------------------------------
   5. SCAN MANUAL (input keyboard)
   ---------------------------------------------------------- */
async function scanManual() {
  const inputEl   = document.getElementById('scannerManualInput');
  const bookingId = inputEl ? inputEl.value.trim() : '';

  if (!bookingId) return;

  _lastScanned = '';  // reset agar bisa scan lagi
  _tampilHasilScan('loading', null, bookingId);

  const data = await cekStatusBooking(bookingId);
  _tampilHasilScan(data ? data.status : 'notfound', data, bookingId);
}


/* ----------------------------------------------------------
   6. TAMPILKAN HASIL SCAN
   @param {string} status  - 'loading'|'disetujui'|'menunggu'|'ditolak'|'notfound'
   @param {Object} data    - data booking dari Firestore (bisa null)
   @param {string} bookingId
   ---------------------------------------------------------- */
function _tampilHasilScan(status, data, bookingId) {
  const el = document.getElementById('scannerResult');
  if (!el) return;

  el.style.display = 'block';

  if (status === 'loading') {
    el.innerHTML = `
      <div class="scanner-result-box" style="border-color:var(--border);">
        <div style="text-align:center; padding:16px; color:var(--gray-3); font-size:13px;">
          ⏳ Mencari data booking <strong>${bookingId}</strong>...
        </div>
      </div>`;
    return;
  }

  if (status === 'notfound') {
    el.innerHTML = `
      <div class="scanner-result-box scanner-result-invalid">
        <div class="scanner-result-icon">❌</div>
        <div class="scanner-result-title">Booking Tidak Ditemukan</div>
        <div class="scanner-result-sub">ID <strong>${bookingId}</strong> tidak ada dalam sistem.</div>
        <button class="scanner-retry-btn" onclick="_resetScan()">Scan Lagi</button>
      </div>`;
    return;
  }

  // Format tanggal
  const [y, m, d]   = (data.tanggal || '').split('-');
  const tglFormatted = data.tanggal
    ? `${parseInt(d)} ${NAMA_BULAN_SC[parseInt(m) - 1]} ${y}`
    : '-';

  if (status === 'disetujui') {
    el.innerHTML = `
      <div class="scanner-result-box scanner-result-valid">
        <div class="scanner-result-icon">✅</div>
        <div class="scanner-result-title">Peminjaman Valid & Disetujui</div>
        <table class="scanner-table">
          <tr><td>ID Booking</td>   <td><strong>${data.bookingId}</strong></td></tr>
          <tr><td>Nama</td>         <td>${data.nama}</td></tr>
          <tr><td>NIM</td>          <td>${data.nim}</td></tr>
          <tr><td>Fasilitas</td>    <td>${data.fasilitas}</td></tr>
          <tr><td>Tanggal</td>      <td>${tglFormatted}</td></tr>
          <tr><td>Waktu</td>        <td>${data.jamMulai} – ${data.jamSelesai}</td></tr>
          <tr><td>Tujuan</td>       <td>${data.tujuan}</td></tr>
          <tr><td>Peserta</td>      <td>${data.jumlahPeserta} Orang</td></tr>
        </table>
        <div class="scanner-valid-note">
          ✓ Silakan izinkan peminjam menggunakan fasilitas
        </div>
        <button class="scanner-retry-btn" onclick="_resetScan()">Scan Berikutnya</button>
      </div>`;

  } else if (status === 'menunggu') {
    el.innerHTML = `
      <div class="scanner-result-box scanner-result-pending">
        <div class="scanner-result-icon">⏳</div>
        <div class="scanner-result-title">Menunggu Persetujuan Admin</div>
        <table class="scanner-table">
          <tr><td>ID Booking</td>   <td><strong>${data.bookingId}</strong></td></tr>
          <tr><td>Nama</td>         <td>${data.nama}</td></tr>
          <tr><td>NIM</td>          <td>${data.nim}</td></tr>
          <tr><td>Fasilitas</td>    <td>${data.fasilitas}</td></tr>
          <tr><td>Tanggal</td>      <td>${tglFormatted}</td></tr>
          <tr><td>Waktu</td>        <td>${data.jamMulai} – ${data.jamSelesai}</td></tr>
        </table>
        <div class="scanner-invalid-note">
          ⚠️ Peminjaman belum disetujui admin. Jangan izinkan dulu.
        </div>
        <button class="scanner-retry-btn" onclick="_resetScan()">Scan Lagi</button>
      </div>`;

  } else {
    // ditolak
    el.innerHTML = `
      <div class="scanner-result-box scanner-result-invalid">
        <div class="scanner-result-icon">🚫</div>
        <div class="scanner-result-title">Peminjaman Ditolak</div>
        <table class="scanner-table">
          <tr><td>ID Booking</td><td><strong>${data.bookingId}</strong></td></tr>
          <tr><td>Nama</td>      <td>${data.nama}</td></tr>
          <tr><td>Fasilitas</td><td>${data.fasilitas}</td></tr>
        </table>
        ${data.alasanTolak ? `<div class="scanner-invalid-note">Alasan: ${data.alasanTolak}</div>` : ''}
        <button class="scanner-retry-btn" onclick="_resetScan()">Scan Lagi</button>
      </div>`;
  }
}


/* ----------------------------------------------------------
   7. RESET SCAN — lanjut scan barcode berikutnya
   ---------------------------------------------------------- */
function _resetScan() {
  _lastScanned = '';

  const resultEl = document.getElementById('scannerResult');
  if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }

  const inputEl = document.getElementById('scannerManualInput');
  if (inputEl) inputEl.value = '';

  // Resume kamera
  if (_html5QrCode && _scannerActive) {
    try { _html5QrCode.resume(); } catch(e) {}
  } else {
    _startCamera();
  }
}