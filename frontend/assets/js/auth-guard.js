/**
 * auth-guard.js — RumahDrive
 * Dimuat PALING AWAL di index.html (sebelum api.js & app.js).
 *
 * Sesi login sekarang sepenuhnya berbasis cookie HttpOnly yang di-set
 * backend (lihat /auth/login) — cookie itu TIDAK bisa dibaca lewat
 * JavaScript sama sekali. Jadi satu-satunya cara memastikan status login
 * adalah bertanya langsung ke backend lewat GET /auth/me.
 *
 * File ini sengaja mandiri (tidak memakai apiFetch dari api.js) karena
 * dimuat lebih dulu daripada api.js pada urutan <script> di index.html.
 */
(function () {
  // Base path API & login dibuat dinamis, mengikuti pola yang sama dengan
  // loader script di index.html (supaya tetap benar walau prefix reverse-proxy berubah).
  var segments = window.location.pathname.split('/').filter(Boolean);
  var firstSegment = segments[0] || '';
  var apiBase = firstSegment
    ? window.location.origin + '/' + firstSegment + '/thorix-api'
    : window.location.origin + '/thorix-api';
  var loginPath = firstSegment ? '/' + firstSegment + '/login' : '/login';

  function goToLogin() {
    localStorage.removeItem('rumahdrive_user');
    window.location.replace(loginPath);
  }

  // Sembunyikan halaman dulu sampai status login dipastikan, supaya tidak
  // ada "kedipan" konten sebelum redirect (dan tidak ada loop render).
  document.documentElement.style.visibility = 'hidden';

  fetch(apiBase + '/auth/me', { credentials: 'include' })
    .then(function (res) {
      if (!res.ok) {
        goToLogin();
        return;
      }
      document.documentElement.style.visibility = 'visible';
    })
    .catch(function () {
      // Gagal konek ke server (mis. offline sesaat) tidak langsung dianggap logout —
      // tetap tampilkan halaman, biar app.js yang menampilkan error koneksinya sendiri.
      document.documentElement.style.visibility = 'visible';
    });
})();
