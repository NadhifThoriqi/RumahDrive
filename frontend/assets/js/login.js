/**
 * login.js — RumahDrive
 * Logika halaman login. Memanggil endpoint asli backend (POST /auth/login).
 * Sesi login disimpan backend lewat cookie HttpOnly — file ini TIDAK
 * menyimpan token apapun secara manual (tidak ada localStorage token lagi),
 * cukup biarkan browser yang mengurus cookie-nya.
 *
 * File ini butuh api.js sudah dimuat lebih dulu (lihat urutan di login.html).
 */

(function () {
  const REDIRECT_TARGET = '/storage/';

  const $ = (sel) => document.querySelector(sel);

  const form = $('#loginForm');
  const emailInput = $('#emailInput');
  const passwordInput = $('#passwordInput');
  const rememberInput = $('#rememberInput');
  const errorMsg = $('#loginError');
  const btnLogin = $('#btnLogin');
  const btnLoginText = $('#btnLoginText');
  const btnTogglePwd = $('#btnTogglePwd');
  const card = document.querySelector('.login-card');

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.hidden = false;
    card.classList.remove('shake');
    // Force reflow supaya animasi bisa diulang
    void card.offsetWidth;
    card.classList.add('shake');
  }

  function clearError() {
    errorMsg.hidden = true;
  }

  function setLoading(isLoading) {
    btnLogin.disabled = isLoading;
    btnLoginText.textContent = isLoading ? 'Memeriksa…' : 'Masuk';
  }

  btnTogglePwd.addEventListener('click', () => {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    btnTogglePwd.textContent = showing ? '👁' : '🙈';
    btnTogglePwd.setAttribute('aria-label', showing ? 'Tampilkan kata sandi' : 'Sembunyikan kata sandi');
    passwordInput.focus();
  });

  emailInput.addEventListener('input', clearError);
  passwordInput.addEventListener('input', clearError);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const remember = rememberInput.checked;

    if (!email || !password) {
      showError('Email dan kata sandi wajib diisi.');
      return;
    }

    setLoading(true);
    clearError();

    try {
      const res = await apiLogin(email, password, remember);
      // Token sesi sudah otomatis tersimpan di cookie HttpOnly oleh backend.
      // Cuma simpan nama/email untuk ditampilkan di header (bukan data rahasia).
      localStorage.setItem('rumahdrive_user', JSON.stringify(res.user));
      window.location.href = REDIRECT_TARGET;
    } catch (err) {
      setLoading(false);
      showError(err.message || 'Email atau kata sandi salah.');
      passwordInput.select();
    }
  });

  // Kalau ternyata sudah ada sesi login aktif (cookie masih berlaku),
  // langsung lempar ke halaman utama tanpa perlu isi form lagi.
  (async function checkExistingSession() {
    try {
      await apiMe();
      window.location.replace(REDIRECT_TARGET);
    } catch (_) {
      // belum login — biarkan form login tampil seperti biasa
    }
  })();
})();
