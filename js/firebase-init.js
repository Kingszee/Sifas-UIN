/* ============================================================
   SiFas UIN — Sistem Peminjaman Fasilitas
   File   : js/firebase-init.js
   Tipe   : ES Module (wajib dipanggil dengan type="module" di HTML)
   Fungsi : Inisialisasi Firebase SDK, ekspos ke window._firebase
            dan window._firebaseAuth, lalu dispatch 'firebase-ready'
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,       /* ← tambahan: dibutuhkan oleh bukaModalFasilitas di admin.js */
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,    /* ← tambahan: dibutuhkan oleh hapusFasilitas di admin.js */
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";


/* ----------------------------------------------------------
   KONFIGURASI FIREBASE
   ---------------------------------------------------------- */
const firebaseConfig = {
  apiKey:            "AIzaSyAe_LrcAqS-WCO5OIkLq4ZZRVNzkxGx5f0",
  authDomain:        "sifas-uin.firebaseapp.com",
  projectId:         "sifas-uin",
  storageBucket:     "sifas-uin.firebasestorage.app",
  messagingSenderId: "761932393526",
  appId:             "1:761932393526:web:19f7330d8ef1f0b80bbc97",
  measurementId:     "G-61WBYEVHTE"
};


/* ----------------------------------------------------------
   INISIALISASI
   ---------------------------------------------------------- */
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);


/* ----------------------------------------------------------
   EKSPOS KE WINDOW
   Diakses oleh firebase.js via window._firebase
   ---------------------------------------------------------- */
window._firebase = {
  db,
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp
};

window._firebaseAuth = {
  getAuth:                  () => auth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
};


/* ----------------------------------------------------------
   BERITAHU SEMUA SCRIPT BAHWA FIREBASE SUDAH SIAP
   Karena file ini type="module" (defer), event ini selalu
   fired SETELAH semua script biasa (firebase.js, main.js, dll)
   sudah selesai load — sehingga addEventListener di firebase.js
   pasti sudah terdaftar sebelum event ini dikirim.
   ---------------------------------------------------------- */
window.dispatchEvent(new Event('firebase-ready'));
console.log('Firebase Init Success ✅ | Project: sifas-uin');