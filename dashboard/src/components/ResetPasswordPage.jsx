import React, { useState } from 'react';
import { BrandPanel, LangDropdown, PasswordInput, FormFooter, lockSvg, cardSvg } from './LoginPage';

const dict = {
  id: {
    securityProtocol: 'Protokol Keamanan Akses Karyawan',
    headline: 'Sistem Manajemen Karyawan dan Kinerja Terpadu',
    brandDesc: 'Akses terintegrasi untuk pengelolaan absensi mandiri, pengajuan cuti, transparansi slip gaji, dan pemantauan capaian KPI profesional Anda.',
    certTitle: 'ISO/IEC 27001 CERTIFIED & TERENKRIPSI',
    certSub: 'Enterprise-grade Security & Confidentiality',
    resetTitle: 'Reset Password',
    resetSub: 'Silakan isi seluruh kolom yang diwajibkan untuk mengatur ulang kata sandi Anda',
    nipLabel: 'Nomor Induk Pegawai (NIP)',
    nipPh: 'Masukkan NIP Anda',
    newPwLabel: 'Password Baru',
    newPwPh: 'Buat password baru',
    pwHelp: 'Minimal 8 karakter kombinasi huruf dan angka',
    confirmPwLabel: 'Konfirmasi Password Baru',
    confirmPwPh: 'Ulangi password baru Anda',
    resetBtn: 'Reset Password',
    backToLogin: '\u2190 Kembali ke Halaman Login',
    footerCopy: '© 2026 Blue Rose Tech. All rights reserved.',
    helpdesk: 'Bantuan IT / HR Helpdesk',
    privacy: 'Kebijakan Privasi',
    langName: 'Bahasa Indonesia (ID)',
  },
  en: {
    securityProtocol: 'Employee Access Security Protocol',
    headline: 'Integrated Employee Management and Performance System',
    brandDesc: 'Integrated access for self-service attendance management, leave requests, payslip transparency, and professional KPI achievement monitoring.',
    certTitle: 'ISO/IEC 27001 CERTIFIED & ENCRYPTED',
    certSub: 'Enterprise-grade Security & Confidentiality',
    resetTitle: 'Reset Password',
    resetSub: 'Please fill in all required fields to reset your password',
    nipLabel: 'Employee ID Number (NIP)',
    nipPh: 'Enter your NIP',
    newPwLabel: 'New Password',
    newPwPh: 'Create a new password',
    pwHelp: 'Minimum 8 characters with letters and numbers',
    confirmPwLabel: 'Confirm New Password',
    confirmPwPh: 'Re-enter your new password',
    resetBtn: 'Reset Password',
    backToLogin: '\u2190 Back to Login Page',
    footerCopy: '© 2026 Blue Rose Tech. All rights reserved.',
    helpdesk: 'IT / HR Helpdesk Support',
    privacy: 'Privacy Policy',
    langName: 'English (EN)',
  },
};

export default function ResetPasswordPage({ onReset, onBackToLogin }) {
  const [lang, setLang] = useState('id');
  const t = dict[lang];

  const handleSubmit = (e) => {
    e.preventDefault();
    onReset();
  };

  return (
    <div className="login-shell">
      <BrandPanel t={t} />

      <div className="panel panel--form">
        <LangDropdown lang={lang} setLang={setLang} />

        <div className="form-center">
          <div className="form-wrap view-enter">
            <h2 className="form-title">{t.resetTitle}</h2>
            <p className="form-subtitle"><em>{t.resetSub}</em></p>

            <form className="form-fields" onSubmit={handleSubmit} autoComplete="off">
              {/* NIP */}
              <div className="field-group">
                <div className="label-row">
                  <label htmlFor="nipReset">{t.nipLabel}<span className="req"> *</span></label>
                </div>
                <div className="input-wrap">
                  <input type="text" id="nipReset" placeholder={t.nipPh} inputMode="numeric" maxLength="16" autoComplete="off" />
                  <span className="icon-left" dangerouslySetInnerHTML={{ __html: cardSvg }} />
                </div>
              </div>

              {/* New Password */}
              <div className="field-group">
                <div className="label-row">
                  <label htmlFor="newPw">{t.newPwLabel}<span className="req"> *</span></label>
                </div>
                <PasswordInput id="newPw" placeholder={t.newPwPh} iconSvg={lockSvg} />
                <div className="input-help">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>{t.pwHelp}</span>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="field-group">
                <div className="label-row">
                  <label htmlFor="confirmPw">{t.confirmPwLabel}<span className="req"> *</span></label>
                </div>
                <PasswordInput id="confirmPw" placeholder={t.confirmPwPh} iconSvg={lockSvg} />
              </div>

              {/* Submit */}
              <button type="submit" className="btn-submit">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                <span>{t.resetBtn}</span>
              </button>

              {/* Back to Login */}
              <button type="button" className="form-link link-back" onClick={onBackToLogin}>
                {t.backToLogin}
              </button>
            </form>
          </div>
        </div>

        <FormFooter t={t} />
      </div>
    </div>
  );
}

