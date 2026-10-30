import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon } from 'lucide-react';

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

/* ── Panel Branding (Kiri) ── */
function BrandPanel({ t, isDark }) {
  return (
    <div className="panel panel--brand" style={isDark ? { background: 'linear-gradient(165deg, #152e6e 0%, #0c1f4a 40%, #070d1f 100%)' } : undefined}>
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

/* ── Tombol Toggle Tema ── */
function ThemeToggle({ isDark, toggleTheme }) {
  return (
    <button
      onClick={toggleTheme}
      type="button"
      title={isDark ? 'Beralih ke Tema Terang' : 'Beralih ke Tema Gelap'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 38,
        height: 38,
        borderRadius: 9999,
        border: `1.5px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        background: isDark ? '#1e293b' : '#f1f5f9',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? '#334155' : '#e2e8f0'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? '#1e293b' : '#f1f5f9'; }}
    >
      {isDark ? (
        <Moon size={16} strokeWidth={1.8} color="#93c5fd" />
      ) : (
        <Sun size={16} strokeWidth={1.8} color="#f59e0b" />
      )}
    </button>
  );
}

/* ── Dropdown Bahasa ── */
function LangDropdown({ lang, setLang, isDark }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const label = lang === 'id' ? 'Bahasa Indonesia (ID)' : 'English (EN)';

  const toggleStyle = {
    background: isDark ? '#1e293b' : '#f1f5f9',
    color: isDark ? '#cbd5e1' : '#475569',
    border: `1.5px solid ${isDark ? '#334155' : 'transparent'}`,
  };

  const menuStyle = {
    background: isDark ? '#1e293b' : '#fff',
    border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
    boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.1)',
  };

  const optionStyle = (active) => ({
    color: active ? (isDark ? '#60a5fa' : '#2563EB') : (isDark ? '#e2e8f0' : '#0F172A'),
    background: 'transparent',
  });

  const optionHover = isDark ? '#0f172a' : '#f8fafc';

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        className={`lang-toggle ${open ? 'open' : ''}`}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={toggleStyle}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
        </svg>
        <span>{label}</span>
        <svg className="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div className={`lang-menu ${open ? 'show' : ''}`} style={menuStyle}>
        {['id', 'en'].map((code) => {
          const active = lang === code;
          const name = code === 'id' ? 'Bahasa Indonesia (ID)' : 'English (EN)';
          return (
            <button
              key={code}
              className={`lang-option ${active ? 'active' : ''}`}
              onClick={() => { setLang(code); setOpen(false); }}
              style={optionStyle(active)}
              onMouseEnter={(e) => { e.currentTarget.style.background = optionHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {name}
              <svg className="check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ visibility: active ? 'visible' : 'hidden' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Input Password dengan Toggle Mata ── */
function PasswordInput({ id, placeholder, isDark }) {
  const [show, setShow] = useState(false);
  const inputStyle = isDark
    ? { background: 'rgba(30,41,59,0.9)', borderColor: '#334155', color: '#f1f5f9' }
    : {};
  return (
    <div className="input-wrap">
      <input type={show ? 'text' : 'password'} id={id} className="has-toggle" placeholder={placeholder} autoComplete="off" style={inputStyle} />
      <span className="icon-left" style={isDark ? { color: '#64748b' } : undefined}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" />
        </svg>
      </span>
      <button type="button" className="toggle-pw" onClick={() => setShow(!show)} aria-label="Toggle password" style={isDark ? { color: '#64748b' } : undefined}>
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

/* ── Footer ── */
function FormFooter({ t, isDark }) {
  const linkStyle = isDark ? { color: '#64748b' } : {};
  return (
    <div className="form-footer" style={isDark ? { color: '#64748b' } : undefined}>
      <span style={linkStyle}>{t.footerCopy}</span>
      <div className="footer-right">
        <span className="footer-helpdesk">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={linkStyle}>
            <path d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
          </svg>
          <a href="#" style={linkStyle}>{t.helpdesk}</a>
        </span>
        <a href="#" style={linkStyle}>{t.privacy}</a>
      </div>
    </div>
  );
}

/* ── Halaman Login ── */
export default function LoginPage({ isDark, toggleTheme, onLogin, onForgotPassword }) {
  const [lang, setLang] = useState('id');
  const t = dict[lang];

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin();
  };

  const panelFormStyle = {
    background: isDark ? '#0B1120' : '#fff',
    transition: 'background 0.3s ease',
  };

  const inputStyle = isDark
    ? { background: 'rgba(30,41,59,0.9)', borderColor: '#334155', color: '#f1f5f9' }
    : {};

  return (
    <div className="login-shell">
      <BrandPanel t={t} isDark={isDark} />

      <div className="panel panel--form" style={panelFormStyle}>
        {/* Header: Toggle Tema + Dropdown Bahasa */}
        <div className="form-header" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
          <ThemeToggle isDark={isDark} toggleTheme={toggleTheme} />
          <LangDropdown lang={lang} setLang={setLang} isDark={isDark} />
        </div>

        <div className="form-center">
          <div className="form-wrap view-enter">
            <h2 className="form-title" style={{ color: isDark ? '#f1f5f9' : undefined }}>{t.loginTitle}</h2>
            <p className="form-subtitle" style={{ color: isDark ? '#94a3b8' : undefined }}>{t.loginSub}</p>

            <form className="form-fields" onSubmit={handleSubmit} autoComplete="off">
              {/* NIP */}
              <div className="field-group">
                <div className="label-row">
                  <label htmlFor="nipLogin" style={{ color: isDark ? '#e2e8f0' : undefined }}>{t.nipLabel}</label>
                  <span className="hint" style={{ color: isDark ? '#64748b' : undefined }}>{t.nipHint}</span>
                </div>
                <div className="input-wrap">
                  <input type="text" id="nipLogin" placeholder={t.nipPh} inputMode="numeric" maxLength="16" autoComplete="off" style={inputStyle} />
                  <span className="icon-left" style={isDark ? { color: '#64748b' } : undefined}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /><circle cx="7.5" cy="15" r="1.5" />
                    </svg>
                  </span>
                </div>
              </div>

              {/* Password */}
              <div className="field-group">
                <div className="label-row">
                  <label htmlFor="pwLogin" style={{ color: isDark ? '#e2e8f0' : undefined }}>{t.pwLabel}</label>
                  <span className="hint" style={{ color: isDark ? '#64748b' : undefined }}>{t.pwHint}</span>
                </div>
                <PasswordInput id="pwLogin" placeholder={t.pwPh} isDark={isDark} />
              </div>

              {/* Remember Me */}
              <div className="remember-row">
                <input type="checkbox" id="remember" />
                <label htmlFor="remember" style={{ color: isDark ? '#94a3b8' : undefined }}>{t.rememberMe}</label>
              </div>

              {/* Submit */}
              <button type="submit" className="btn-submit">
                <span>{t.loginBtn}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>

              {/* Forgot Password */}
              <button
                type="button"
                className="form-link link-forgot"
                onClick={onForgotPassword}
                style={{ color: isDark ? '#94a3b8' : undefined }}
              >
                {t.forgotPw}
              </button>
            </form>
          </div>
        </div>

        <FormFooter t={t} isDark={isDark} />
      </div>
    </div>
  );
}

export { BrandPanel, ThemeToggle, LangDropdown, PasswordInput, FormFooter, dict };
