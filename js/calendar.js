/* ============================================================
   SiFas UIN — Sistem Peminjaman Fasilitas
   File   : js/calendar.js
   Fungsi : Kalender ketersediaan di halaman Detail Fasilitas.
            Mode VIEW ONLY — hanya menampilkan status tanggal,
            tidak ada interaksi klik pada tanggal.
            Navigasi bulan (prev/next) tetap bisa digunakan.
   ============================================================ */

/* ----------------------------------------------------------
   SHARED: KONFIGURASI & KONSTANTA
   ---------------------------------------------------------- */
const CAL_MIN_YEAR   = 2010;
const CAL_MIN_MONTH  = 0;
const CAL_MAX_OFFSET = 12;

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret',    'April',
  'Mei',     'Juni',     'Juli',     'Agustus',
  'September','Oktober', 'November', 'Desember'
];

/* ----------------------------------------------------------
   SHARED: STATUS HARI
   Membaca window.calBookingData yang diisi firebase.js (realtime).
   - 'booked'    → disetujui admin, jam belum selesai → MERAH
   - 'pending'   → menunggu verifikasi               → KUNING
   - 'available' → tidak ada booking                 → HIJAU
   - 'unavailable'→ tanggal sudah lewat              → ABU
   ---------------------------------------------------------- */
function getDayStatus(year, month, day) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(year, month, day);
  if (date < today) return 'unavailable';
  const key = `${year}-${month}-${day}`;
  return (window.calBookingData || {})[key] || 'available';
}


/* ============================================================
   KALENDER 1: DETAIL FASILITAS
   Lokasi HTML : detail.html → #calGrid, #calLabel, #calPrev, #calNext
   Mode        : VIEW ONLY — tidak ada interaksi klik pada tanggal
   ============================================================ */

let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();

function renderCalendar() {
  const grid    = document.getElementById('calGrid');
  const label   = document.getElementById('calLabel');
  const btnPrev = document.getElementById('calPrev');
  const btnNext = document.getElementById('calNext');
  if (!grid || !label) return;

  label.textContent = `${NAMA_BULAN[calMonth]} ${calYear}`;

  const now     = new Date();
  const maxDate = new Date(now.getFullYear(), now.getMonth() + CAL_MAX_OFFSET, 1);
  const isAtMin = (calYear === CAL_MIN_YEAR && calMonth === CAL_MIN_MONTH);
  const isAtMax = (calYear === maxDate.getFullYear() && calMonth === maxDate.getMonth());
  btnPrev.disabled      = isAtMin;
  btnPrev.style.opacity = isAtMin ? '0.3' : '1';
  btnNext.disabled      = isAtMax;
  btnNext.style.opacity = isAtMax ? '0.3' : '1';

  const dayNameEls = Array.from(grid.querySelectorAll('.cal-day-name'));
  grid.innerHTML = '';
  dayNameEls.forEach(el => grid.appendChild(el));

  const firstDay  = new Date(calYear, calMonth, 1).getDay();
  const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
  const today     = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < firstDay; i++) {
    const e = document.createElement('div');
    e.className = 'cal-day empty';
    grid.appendChild(e);
  }

  for (let d = 1; d <= totalDays; d++) {
    const status  = getDayStatus(calYear, calMonth, d);
    const isToday = (new Date(calYear, calMonth, d).toDateString() === today.toDateString());
    const cell    = document.createElement('div');
    cell.textContent  = d;

    /* ── VIEW ONLY: semua cursor default, tidak ada addEventListener ── */
    if (status === 'booked') {
      cell.className     = 'cal-day cal-booked';
      cell.style.cssText = `background:var(--red-light); color:var(--red);
                            font-weight:600; cursor:default;
                            ${isToday ? 'outline:2px solid var(--red);' : ''}`;
    } else if (status === 'pending') {
      cell.className     = 'cal-day cal-pending';
      cell.style.cssText = 'background:var(--amber-light); color:var(--amber); font-weight:500; cursor:default;';
    } else if (status === 'unavailable') {
      cell.className     = 'cal-day cal-unavailable';
      cell.style.cssText = 'background:var(--gray-2); color:var(--gray-3); cursor:default;';
    } else {
      /* available */
      cell.className     = 'cal-day available';
      cell.style.cssText = isToday
        ? 'background:var(--green-light); color:var(--green); font-weight:700; cursor:default; outline:2px solid var(--green);'
        : 'cursor:default;';
    }

    grid.appendChild(cell);
  }
}


/* ----------------------------------------------------------
   NAVIGASI BULAN — kalender detail
   ---------------------------------------------------------- */
function calNav(direction) {
  const now     = new Date();
  const maxDate = new Date(now.getFullYear(), now.getMonth() + CAL_MAX_OFFSET, 1);
  let newMonth  = calMonth + direction;
  let newYear   = calYear;
  if (newMonth < 0)  { newMonth = 11; newYear--; }
  if (newMonth > 11) { newMonth = 0;  newYear++; }
  if (newYear < CAL_MIN_YEAR || (newYear === CAL_MIN_YEAR && newMonth < CAL_MIN_MONTH)) return;
  if (newYear > maxDate.getFullYear() ||
     (newYear === maxDate.getFullYear() && newMonth > maxDate.getMonth())) return;
  calYear  = newYear;
  calMonth = newMonth;
  renderCalendar();
}