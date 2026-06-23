/* ============================================================
   SiFas UIN — Sistem Peminjaman Fasilitas
   File   : js/firebase.js
   Dimuat : index.html (urutan 2, setelah data.js)
   Fungsi : semua operasi database Firestore

   PENTING — KALENDER PER FASILITAS:
   window.calBookingData hanya berisi booking untuk fasilitas
   yang sedang dibuka di halaman detail. Jadi Sound System tidak
   terpengaruh booking Sepeda Listrik, dll.
   ============================================================ */

let _db, _col, _addDoc, _getDocs, _getDoc, _query, _where,
    _orderBy, _onSnapshot, _doc, _updateDoc, _deleteDoc, _serverTimestamp;

/** Cache tanggal booking — HANYA untuk fasilitas yang sedang aktif */
window.calBookingData = {};

/** Nama fasilitas yang sedang ditampilkan di kalender */
window.calActiveFasilitas = null;

let _activeStatusListener = null;
let _calListener          = null;


/* ----------------------------------------------------------
   1. INISIALISASI
   Gunakan dua pendekatan sekaligus:
   - addEventListener: untuk load normal (SDK async module)
   - if(window._firebase): untuk kasus SDK sudah siap duluan
   ---------------------------------------------------------- */

/** Flag apakah Firebase sudah siap */
window._firebaseReady = false;

function _initFirebase() {
  if (window._firebaseReady) return; // jangan init dua kali
  if (!window._firebase) return;     // SDK belum siap

  const f          = window._firebase;
  _db              = f.db;
  _col             = f.collection;
  _addDoc          = f.addDoc;
  _getDocs         = f.getDocs;
  _getDoc          = f.getDoc;
  _query           = f.query;
  _where           = f.where;
  _orderBy         = f.orderBy;
  _onSnapshot      = f.onSnapshot;
  _doc             = f.doc;
  _updateDoc       = f.updateDoc;
  _deleteDoc       = f.deleteDoc;
  _serverTimestamp = f.serverTimestamp;

  window._firebaseReady = true;

  const siap = _db && _onSnapshot && _query && _where;
  if (siap) {
    console.log('Firebase Connected ✅ | Project: sifas-uin');
  } else {
    console.error('Firebase GAGAL init — cek konfigurasi di index.html!');
  }
}

// Jalankan saat event fired (load normal — SDK async)
window.addEventListener('firebase-ready', _initFirebase);

// Jalankan langsung juga — kalau SDK sudah siap sebelum firebase.js jalan
_initFirebase();


/* ----------------------------------------------------------
   2. GENERATE BOOKING ID
   Format: SF + YYMMDD + 4-digit random. Contoh: SF260522-4821
   ---------------------------------------------------------- */
function generateBookingId() {
  const now  = new Date();
  const yy   = String(now.getFullYear()).slice(2);
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `SF${yy}${mm}${dd}-${rand}`;
}


/* ----------------------------------------------------------
   3. SUBMIT PENGAJUAN PEMINJAMAN → Firestore
   ---------------------------------------------------------- */
async function submitPeminjaman(formData) {
  if (!window._firebaseReady) {
    throw new Error('Firebase belum siap. Tunggu beberapa detik lalu coba lagi.');
  }

  const bookingId = generateBookingId();

  await _addDoc(_col(_db, 'peminjaman'), {
    bookingId,
    nama:          formData.nama,
    nim:           formData.nim,
    email:         formData.email,
    noHp:          formData.noHp,
    fasilitas:     formData.fasilitas,
    tanggal:       formData.tanggal,
    jamMulai:      formData.jamMulai,
    jamSelesai:    formData.jamSelesai,
    tujuan:        formData.tujuan,
    jumlahPeserta: Number(formData.jumlahPeserta),
    status:        'menunggu',
    alasanTolak:   '',
    createdAt:     _serverTimestamp()
  });

  // Update cache lokal HANYA jika fasilitas yang di-submit
  // sama dengan yang sedang ditampilkan di kalender
  if (window.calActiveFasilitas === formData.fasilitas) {
    const parts = formData.tanggal.split('-');
    const key   = `${parts[0]}-${parseInt(parts[1]) - 1}-${parseInt(parts[2])}`;
    if (window.calBookingData[key] !== 'booked') {
      window.calBookingData[key] = 'pending';
    }
  }

  return bookingId;
}


/* ----------------------------------------------------------
   4. LOAD BOOKING DATES — PER FASILITAS (realtime)

   LOGIKA WARNA KALENDER:
   - 'disetujui' + jam belum selesai → 'booked'  → MERAH
   - 'disetujui' + jam sudah lewat   → di-skip   → HIJAU (tersedia lagi)
   - 'menunggu'                      → 'pending' → KUNING
   - 'ditolak'                       → di-skip   → tidak blokir tanggal

   @param {string} namaFasilitas - nama fasilitas yang sedang dibuka
   ---------------------------------------------------------- */
function loadBookingDates(namaFasilitas) {
  // Hentikan listener fasilitas sebelumnya
  if (_calListener) {
    _calListener();
    _calListener = null;
  }

  // Simpan fasilitas aktif & reset cache
  window.calActiveFasilitas = namaFasilitas;
  window.calBookingData     = {};
  if (typeof renderCalendar === 'function') renderCalendar();

  if (!namaFasilitas) return;

  // Query HANYA booking fasilitas ini yang statusnya aktif
  const q = _query(
    _col(_db, 'peminjaman'),
    _where('fasilitas', '==', namaFasilitas),
    _where('status', 'in', ['menunggu', 'disetujui'])
  );

  _calListener = _onSnapshot(
    q,
    snapshot => {
      window.calBookingData = {};
      const now = new Date();

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (!data.tanggal) return;

        // Parse tanggal "2026-05-30" → komponen terpisah
        const parts   = data.tanggal.split('-');
        const tglYear = parseInt(parts[0]);
        const tglMon  = parseInt(parts[1]);   // 1-indexed
        const tglDay  = parseInt(parts[2]);

        // Parse jam selesai "16:49" → komponen terpisah
        const jamStr   = data.jamSelesai || '23:59';
        const jamParts = jamStr.split(':');
        const jamHour  = parseInt(jamParts[0]);
        const jamMin   = parseInt(jamParts[1]);

        // Waktu selesai booking sebagai objek Date
        const selesaiDate = new Date(tglYear, tglMon - 1, tglDay, jamHour, jamMin, 0);

        // Key kalender: "YYYY-M-D" bulan 0-indexed tanpa leading zero
        const key = `${tglYear}-${tglMon - 1}-${tglDay}`;

        if (data.status === 'disetujui') {
          if (selesaiDate > now) {
            window.calBookingData[key] = 'booked';   // MERAH
          }
          // Jika jam sudah lewat → tidak masuk cache → hijau otomatis
        } else if (data.status === 'menunggu') {
          if (window.calBookingData[key] !== 'booked') {
            window.calBookingData[key] = 'pending';  // KUNING
          }
        }
      });

      console.log(`[SiFas] Kalender ${namaFasilitas}:`, window.calBookingData);
      if (typeof renderCalendar === 'function') renderCalendar();
    },
    err => {
      // Error di sini biasanya karena Composite Index belum dibuat
      console.error('[SiFas] onSnapshot error:', err.message);
      if (err.message && err.message.includes('index')) {
        console.warn('[SiFas] ⚠️ Composite Index belum ada! Ikuti link di console untuk membuatnya.');
      }
      // Fallback: query tanpa filter status, filter di client
      _fallbackLoadBooking(namaFasilitas);
    }
  );
}

/**
 * Fallback — dipakai saat Composite Index belum dibuat di Firebase Console.
 * Query hanya 1 where (fasilitas), filter status dilakukan di client side.
 */
async function _fallbackLoadBooking(namaFasilitas) {
  console.log('[SiFas] Fallback query untuk:', namaFasilitas);
  try {
    const q        = _query(
      _col(_db, 'peminjaman'),
      _where('fasilitas', '==', namaFasilitas)
    );
    const snapshot = await _getDocs(q);
    window.calBookingData = {};
    const now = new Date();

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (!data.tanggal || data.status === 'ditolak') return;

      const parts   = data.tanggal.split('-');
      const tglYear = parseInt(parts[0]);
      const tglMon  = parseInt(parts[1]);
      const tglDay  = parseInt(parts[2]);

      const jamStr   = data.jamSelesai || '23:59';
      const jamParts = jamStr.split(':');
      const jamHour  = parseInt(jamParts[0]);
      const jamMin   = parseInt(jamParts[1]);

      const selesaiDate = new Date(tglYear, tglMon - 1, tglDay, jamHour, jamMin, 0);
      const key         = `${tglYear}-${tglMon - 1}-${tglDay}`;

      if (data.status === 'disetujui' && selesaiDate > now) {
        window.calBookingData[key] = 'booked';
      } else if (data.status === 'menunggu') {
        if (window.calBookingData[key] !== 'booked') {
          window.calBookingData[key] = 'pending';
        }
      }
    });

    console.log('[SiFas] Fallback kalender:', window.calBookingData);
    if (typeof renderCalendar === 'function') renderCalendar();
  } catch (err) {
    console.error('[SiFas] Fallback juga gagal:', err);
  }
}


/* ----------------------------------------------------------
   5. CEK STATUS BOOKING (sekali, by bookingId)
   ---------------------------------------------------------- */
async function cekStatusBooking(bookingId) {
  try {
    const q        = _query(
      _col(_db, 'peminjaman'),
      _where('bookingId', '==', bookingId.trim())
    );
    const snapshot = await _getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  } catch (err) {
    console.error('[SiFas] Gagal cek status:', err);
    return null;
  }
}


/* ----------------------------------------------------------
   6. REALTIME LISTENER STATUS BOOKING
   ---------------------------------------------------------- */
function listenStatus(bookingId, callback) {
  if (_activeStatusListener) {
    _activeStatusListener();
    _activeStatusListener = null;
  }

  const q = _query(
    _col(_db, 'peminjaman'),
    _where('bookingId', '==', bookingId.trim())
  );

  _activeStatusListener = _onSnapshot(q, snapshot => {
    if (snapshot.empty) { callback(null); return; }
    const data = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    callback(data);
  });
}


/* ----------------------------------------------------------
   7. HENTIKAN LISTENER STATUS
   ---------------------------------------------------------- */
function stopListeners() {
  if (_activeStatusListener) {
    _activeStatusListener();
    _activeStatusListener = null;
  }
}