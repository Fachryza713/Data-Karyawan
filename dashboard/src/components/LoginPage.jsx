import React, { useState, useEffect, useRef } from 'react';

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
    footerCopy: '© 2026 Blue Rose Tech. All rights reserved.',
    helpdesk: 'IT / HR Helpdesk Support',
    privacy: 'Privacy Policy',
    langName: 'English (EN)',
  },
};

function BrandPanel({ t }) {
  return (
    <div className="panel panel--brand">
      <div className="brand-header">
        <div className="brand-logo-sm">
          <img src="/assets/logo.jpg" alt="Blue Rose Tech Logo" />
        </div>
        <div className="brand-header-text">
          <div className="brand-header-row">
            <span className="brand-header-name">Blue Rose Tech</span>
            <span className="badge-enterprise">Enterprise</span>
          </div>
          <span className="brand-header-sub">NEXUS HRIS • Portal Karyawan Mandiri</span>
        </div>
      </div>

      <div className="brand-center">
        <div className="security-pill">
          <span className="dot" />
          <span>{t.securityProtocol}</span>
        </div>
        <h1 className="brand-headline">{t.headline}</h1>
        <p className="brand-desc">{t.brandDesc}</p>
        <div className="brand-divider" />
      </div>

      <div className="brand-footer">
        <div className="cert-row">
          <span className="cert-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          </span>
          <div>
            <div className="cert-title">{t.certTitle}</div>
            <div className="cert-sub">{t.certSub}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LangDropdown({ lang, setLang }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const label = lang === 'id' ? 'Bahasa Indonesia (ID)' : 'English (EN)';

  return (
    <div className="form-header" ref={ref}>
      <button className={`lang-toggle ${open ? 'open' : ''}`} type="button" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
        </svg>
        <span>{label}</span>
        <svg className="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div className={`lang-menu ${open ? 'show' : ''}`}>
        <button className={`lang-option ${lang === 'id' ? 'active' : ''}`} onClick={() => { setLang('id'); setOpen(false); }}>
          Bahasa Indonesia (ID)
          <svg className="check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ visibility: lang === 'id' ? 'visible' : 'hidden' }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
        <button className={`lang-option ${lang === 'en' ? 'active' : ''}`} onClick={() => { setLang('en'); setOpen(false); }}>
          English (EN)
          <svg className="check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ visibility: lang === 'en' ? 'visible' : 'hidden' }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function PasswordInput({ id, placeholder, iconSvg }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input type={show ? 'text' : 'password'} id={id} className="has-toggle" placeholder={placeholder} autoComplete="off" />
      <span className="icon-left" dangerouslySetInnerHTML={{ __html: iconSvg }} />
      <button type="button" className="toggle-pw" onClick={() => setShow(!show)} aria-label="Toggle password">
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

const lockSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>';
const cardSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="7.5" cy="15" r="1.5"/></svg>';

function FormFooter({ t }) {
  return (
    <div className="form-footer">
      <span>{t.footerCopy}</span>
      <div className="footer-right">
        <span className="footer-helpdesk">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
          </svg>
          <a href="#">{t.helpdesk}</a>
        </span>
        <a href="#">{t.privacy}</a>
      </div>
    </div>
  );
}

export default function LoginPage({ onLogin, onForgotPassword }) {
  const [lang, setLang] = useState('id');
  const t = dict[lang];

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin();
  };

  return (
    <div className="login-shell">
      <BrandPanel t={t} />

      <div className="panel panel--form">
        <LangDropdown lang={lang} setLang={setLang} />

        <div className="form-center">
          <div className="form-wrap view-enter">
            <h2 className="form-title">{t.loginTitle}</h2>
            <p className="form-subtitle">{t.loginSub}</p>

            <form className="form-fields" onSubmit={handleSubmit} autoComplete="off">
              {/* NIP */}
              <div className="field-group">
                <div className="label-row">
                  <label htmlFor="nipLogin">{t.nipLabel}</label>
                  <span className="hint">{t.nipHint}</span>
                </div>
                <div className="input-wrap">
                  <input type="text" id="nipLogin" placeholder={t.nipPh} inputMode="numeric" maxLength="16" autoComplete="off" />
                  <span className="icon-left" dangerouslySetInnerHTML={{ __html: cardSvg }} />
                </div>
              </div>

              {/* Password */}
              <div className="field-group">
                <div className="label-row">
                  <label htmlFor="pwLogin">{t.pwLabel}</label>
                  <span className="hint">{t.pwHint}</span>
                </div>
                <PasswordInput id="pwLogin" placeholder={t.pwPh} iconSvg={lockSvg} />
              </div>

              {/* Remember Me */}
              <div className="remember-row">
                <input type="checkbox" id="remember" />
                <label htmlFor="remember">{t.rememberMe}</label>
              </div>

              {/* Submit */}
              <button type="submit" className="btn-submit">
                <span>{t.loginBtn}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>

              {/* Forgot Password */}
              <button type="button" className="form-link link-forgot" onClick={onForgotPassword}>
                {t.forgotPw}
              </button>
            </form>
          </div>
        </div>

        <FormFooter t={t} />
      </div>
    </div>
  );
}

export { BrandPanel, LangDropdown, PasswordInput, FormFooter, dict, lockSvg, cardSvg };

