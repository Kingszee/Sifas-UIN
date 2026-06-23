/* ============================================================
   SiFas UIN — Sistem Peminjaman Fasilitas
   File   : js/data.js
   Dimuat : index.html (urutan 1)
   Fungsi : data master fasilitas — STATIS, tidak ke database.
            Data booking (tanggal penuh/tersedia) diambil dari
            Firestore oleh firebase.js, bukan dari file ini.
   ============================================================ */

const facilities = {
  aula: {
    icon:       '🏟️',
    img:        'img/aula-center.jpg',   // belum ada gambar
    name:       'Aula Student Center',
    cap:        '200 Orang',
    loc:        'Student Center Lt. 2',
    badge:      'Tersedia',
    badgeClass: 'badge-green',
    desc:       'Aula representatif untuk kegiatan seminar, workshop, pelatihan, dan acara lainnya.',
    amenities:  ['AC', 'LCD Projector', 'Sound System', 'Kursi', 'Mikrofon']
  },
  seminar: {
    icon:       '🎤',
    img:        'img/ruang-seminar.jpg',   // belum ada gambar
    name:       'Ruang Seminar',
    cap:        '50 Orang',
    loc:        'Gedung Rektorat Lt. 3',
    badge:      'Tersedia',
    badgeClass: 'badge-green',
    desc:       'Ruang seminar modern dengan fasilitas lengkap untuk diskusi dan presentasi.',
    amenities:  ['AC', 'Proyektor', 'Whiteboard', 'Kursi', 'Wifi']
  },
  proyektor: {
    icon:       '📽️',
    img:        'img/proyektor.jpg',
    name:       'Proyektor LCD',
    cap:        '-',
    loc:        'Gedung Utama',
    badge:      'Tersedia',
    badgeClass: 'badge-green',
    desc:       'Proyektor LCD resolusi tinggi untuk keperluan presentasi dan acara.',
    amenities:  ['HDMI', 'VGA', 'Remote', 'Layar']
  },
  sound: {
    icon:       '🔊',
    img:        'img/sound-system.jpg',
    name:       'Sound System',
    cap:        '-',
    loc:        'Gudang Peralatan',
    badge:      'Terbatas',
    badgeClass: 'badge-amber',
    desc:       'Speaker dan mixer profesional untuk acara indoor maupun outdoor.',
    amenities:  ['Speaker', 'Mixer', 'Mikrofon', 'Kabel']
  },
  musik: {
    icon:       '🎸',
    img:        'img/alat-musik.jpg',
    name:       'Alat Musik',
    cap:        '-',
    loc:        'Ruang Seni',
    badge:      'Tersedia',
    badgeClass: 'badge-green',
    desc:       'Koleksi alat musik lengkap termasuk gitar, keyboard, drum, dan lainnya.',
    amenities:  ['Gitar', 'Keyboard', 'Drum', 'Bass', 'Amplifier']
  },
  lab: {
    icon:       '💻',
    img:        'img/lab-komputer.jpg',
    name:       'Lab Komputer',
    cap:        '40 Orang',
    loc:        'Gedung Teknik Lt. 2',
    badge:      'Penuh',
    badgeClass: 'badge-red',
    desc:       'Laboratorium komputer dengan spesifikasi tinggi untuk pembelajaran dan riset.',
    amenities:  ['PC', 'AC', 'Projector', 'Printer', 'Internet']
  },
  sepeda: {
    icon:       '🛵',
    img:        'img/sepeda-listrik.jpg',   // belum ada gambar
    name:       'Sepeda Listrik',
    cap:        '1 Orang / unit',
    loc:        'Pos Keamanan Utama',
    badge:      'Tersedia',
    badgeClass: 'badge-green',
    desc:       'Sepeda listrik kampus untuk mobilitas di area UIN Jakarta. Tersedia beberapa unit, peminjaman per hari.',
    amenities:  ['Helm', 'Kunci', 'Charger', 'Keranjang']
  }
};