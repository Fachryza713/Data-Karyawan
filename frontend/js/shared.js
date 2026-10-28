/* =============================================
   Blue Rose Tech HRIS — Shared JavaScript
   Translation, Language Dropdown, NIP validation,
   Password toggle, Toast notifications
   ============================================= */

const HRIS = (function () {

  /* ---- Translation Dictionary ---- */
  const dict = {
    id: {
      securityProtocol: 'Protokol Keamanan Akses Karyawan',
      headline: 'Sistem Manajemen Karyawan dan Kinerja Terpadu',
      brandDesc: 'Akses terintegrasi untuk pengelolaan absensi mandiri, pengajuan cuti, transparansi slip gaji, dan pemantauan capaian KPI profesional Anda.',
      certTitle: 'ISO/IEC 27001 CERTIFIED & TERENKRIPSI',
      certSub: 'Enterprise-grade Security & Confidentiality',
      loginTitle: 'Login',
      loginSub: 'Silakan login dengan Nomor Induk Pegawai (NIP).',
      nipLabel: 'Nomor Induk Pegawai (NIP)',
      nipHint: 'Contoh: 10482910',
      nipPh: 'Masukkan NIP Anda',
      pwLabel: 'Kata Sandi',
      pwHint: 'Minimal 8 karakter',
      pwPh: 'Masukkan kata sandi Anda',
      rememberMe: 'Ingat Saya di Perangkat Ini',
      loginBtn: 'Login ke Portal HRIS',
      forgotPw: 'Lupa Password?',
      resetTitle: 'Reset Password',
      resetSub: 'Silakan isi seluruh kolom yang diwajibkan untuk mengatur ulang kata sandi Anda',
      newPwLabel: 'Password Baru',
      newPwPh: 'Buat password baru',
      pwHelp: 'Minimal 8 karakter kombinasi huruf dan angka',
      confirmPwLabel: 'Konfirmasi Password Baru',
      confirmPwPh: 'Ulangi password baru Anda',
      resetBtn: 'Reset Password',
      backToLogin: '\u2190 Kembali ke Halaman Login',
      footerCopy: '\u00A9 2026 Blue Rose Tech. All rights reserved.',
      helpdesk: 'Bantuan IT / HR Helpdesk',
      privacy: 'Kebijakan Privasi',
      langName: 'Bahasa Indonesia (ID)',
      toastSuccess: 'Password berhasil diperbarui, silakan login kembali.',
      toastEmptyFields: 'Semua kolom wajib diisi.',
      toastMismatch: 'Password baru dan konfirmasi tidak cocok.',
      toastMinLen: 'Password minimal 8 karakter.'
    },
    en: {
      securityProtocol: 'Employee Access Security Protocol',
      headline: 'Integrated Employee Management and Performance System',
      brandDesc: 'Integrated access for self-service attendance management, leave requests, payslip transparency, and professional KPI achievement monitoring.',
      certTitle: 'ISO/IEC 27001 CERTIFIED & ENCRYPTED',
      certSub: 'Enterprise-grade Security & Confidentiality',
      loginTitle: 'Login',
      loginSub: 'Please login with your Employee Identification Number (NIP).',
      nipLabel: 'Employee ID Number (NIP)',
      nipHint: 'Example: 10482910',
      nipPh: 'Enter your NIP',
      pwLabel: 'Password',
      pwHint: 'Minimum 8 characters',
      pwPh: 'Enter your password',
      rememberMe: 'Remember Me on This Device',
      loginBtn: 'Login to HRIS Portal',
      forgotPw: 'Forgot Password?',
      resetTitle: 'Reset Password',
      resetSub: 'Please fill in all required fields to reset your password',
      newPwLabel: 'New Password',
      newPwPh: 'Create a new password',
      pwHelp: 'Minimum 8 characters with letters and numbers',
      confirmPwLabel: 'Confirm New Password',
      confirmPwPh: 'Re-enter your new password',
      resetBtn: 'Reset Password',
      backToLogin: '\u2190 Back to Login Page',
      footerCopy: '\u00A9 2026 Blue Rose Tech. All rights reserved.',
      helpdesk: 'IT / HR Helpdesk Support',
      privacy: 'Privacy Policy',
      langName: 'English (EN)',
      toastSuccess: 'Password updated successfully, please login again.',
      toastEmptyFields: 'All fields are required.',
      toastMismatch: 'New password and confirmation do not match.',
      toastMinLen: 'Password must be at least 8 characters.'
    }
  };

  let currentLang = localStorage.getItem('hris_lang') || 'id';

  function getLang() { return currentLang; }
  function getDict() { return dict[currentLang]; }

  /* ---- Apply translations to the page ---- */
  function applyLang(lang) {
    currentLang = lang;
    localStorage.setItem('hris_lang', lang);
    const t = dict[lang];

    document.querySelectorAll('[data-t]').forEach(function (el) {
      var key = el.getAttribute('data-t');
      if (t[key] !== undefined) el.textContent = t[key];
    });

    document.querySelectorAll('[data-ph]').forEach(function (el) {
      var key = el.getAttribute('data-ph');
      if (t[key] !== undefined) el.placeholder = t[key];
    });

    var langLabel = document.getElementById('langLabel');
    if (langLabel) langLabel.textContent = t.langName;
  }

  /* ---- Language Dropdown ---- */
  function initLangDropdown() {
    var langToggle = document.getElementById('langToggle');
    var langMenu   = document.getElementById('langMenu');
    var optId      = document.getElementById('optId');
    var optEn      = document.getElementById('optEn');

    if (!langToggle || !langMenu) return;

    langToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = langMenu.classList.toggle('show');
      langToggle.classList.toggle('open', open);
    });

    document.addEventListener('click', function () {
      langMenu.classList.remove('show');
      langToggle.classList.remove('open');
    });

    function selectLang(lang) {
      applyLang(lang);
      if (optId) {
        optId.classList.toggle('active', lang === 'id');
        optId.querySelector('.check').style.visibility = lang === 'id' ? 'visible' : 'hidden';
      }
      if (optEn) {
        optEn.classList.toggle('active', lang === 'en');
        optEn.querySelector('.check').style.visibility = lang === 'en' ? 'visible' : 'hidden';
      }
      langMenu.classList.remove('show');
      langToggle.classList.remove('open');
    }

    if (optId) optId.addEventListener('click', function () { selectLang('id'); });
    if (optEn) optEn.addEventListener('click', function () { selectLang('en'); });

    // Set initial state from stored preference
    selectLang(currentLang);
  }

  /* ---- NIP: digits only, max 16 ---- */
  function initNipValidation() {
    document.querySelectorAll('input[inputmode="numeric"]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        inp.value = inp.value.replace(/\D/g, '').slice(0, 16);
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
      });
    });
  }

  /* ---- Password Toggle (eye icon) ---- */
  function initPasswordToggles() {
    document.querySelectorAll('.toggle-pw').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = document.getElementById(btn.dataset.target);
        var showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.querySelector('.eye-open').style.display  = showing ? 'block' : 'none';
        btn.querySelector('.eye-closed').style.display = showing ? 'none'  : 'block';
      });
    });
  }

  /* ---- Toast Notifications ---- */
  function showToast(msg, type) {
    var toastBox = document.getElementById('toastContainer');
    if (!toastBox) return;

    var el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    var iconClass = type === 'error' ? 'error' : 'success';
    var iconSvg = type === 'error'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    el.innerHTML = '<span class="toast-icon ' + iconClass + '">' + iconSvg + '</span><span>' + msg + '</span>';
    toastBox.appendChild(el);
    setTimeout(function () {
      el.style.animation = 'toastOut 0.3s ease-in forwards';
      setTimeout(function () { el.remove(); }, 300);
    }, 3500);
  }

  /* ---- Initialize all shared features ---- */
  function init() {
    initLangDropdown();
    initNipValidation();
    initPasswordToggles();
  }

  return {
    init: init,
    applyLang: applyLang,
    getLang: getLang,
    getDict: getDict,
    showToast: showToast,
    dict: dict
  };

})();

document.addEventListener('DOMContentLoaded', function () {
  HRIS.init();
});
