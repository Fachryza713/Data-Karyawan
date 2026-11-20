import React, { useState } from 'react';
import { Sun, Moon, Eye, EyeOff, Check } from 'lucide-react';
import { Button, IconButton, Field, inputCls, cx } from './ui';

export const dict = {
  id: {
    headline: 'Satu tempat untuk urusan kepegawaian Anda.',
    brandDesc: 'Absensi, pengajuan cuti, dan slip gaji — tanpa formulir kertas.',
    features: ['Absen masuk & pulang berbasis lokasi', 'Ajukan dan pantau cuti', 'Unduh slip gaji bulanan'],
    loginTitle: 'Masuk',
    loginSub: 'Gunakan NIP dan kata sandi Anda.',
    nipLabel: 'NIP',
    nipPh: 'Contoh: 10482910',
    pwLabel: 'Kata sandi',
    rememberMe: 'Ingat saya',
    loginBtn: 'Masuk',
    forgotPw: 'Lupa kata sandi?',
    errNip: 'Masukkan NIP Anda.',
    errPw: 'Masukkan kata sandi.',
    showPw: 'Tampilkan kata sandi',
    hidePw: 'Sembunyikan kata sandi',
    footerCopy: '© 2026 Blue Rose Tech',
    helpdesk: 'Helpdesk IT & HR',
    privacy: 'Privasi',
    language: 'Bahasa',
    themeLight: 'Gunakan tema terang',
    themeDark: 'Gunakan tema gelap',
  },
  en: {
    headline: 'One place for everything about your employment.',
    brandDesc: 'Attendance, leave requests, and payslips — no paper forms.',
    features: ['Location-based check-in & check-out', 'Request and track leave', 'Download monthly payslips'],
    loginTitle: 'Sign in',
    loginSub: 'Use your employee ID and password.',
    nipLabel: 'Employee ID',
    nipPh: 'e.g. 10482910',
    pwLabel: 'Password',
    rememberMe: 'Remember me',
    loginBtn: 'Sign in',
    forgotPw: 'Forgot password?',
    errNip: 'Enter your employee ID.',
    errPw: 'Enter your password.',
    showPw: 'Show password',
    hidePw: 'Hide password',
    footerCopy: '© 2026 Blue Rose Tech',
    helpdesk: 'IT & HR helpdesk',
    privacy: 'Privacy',
    language: 'Language',
    themeLight: 'Use light theme',
    themeDark: 'Use dark theme',
  },
};

/* ── Panel merek (kiri, hanya desktop) ── */
function BrandPanel({ t }) {
  return (
    <div className="relative hidden flex-col justify-between bg-brand p-10 text-white lg:flex xl:p-14">
      <div className="flex items-center gap-3">
        <img src="/assets/logo.jpg" alt="" className="h-9 w-9 rounded-lg object-cover" />
        <span className="font-display text-base font-semibold">Blue Rose Tech</span>
      </div>
      <div className="max-w-md">
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">{t.headline}</h1>
        <p className="mt-4 text-base text-blue-100/90">{t.brandDesc}</p>
        <ul className="mt-8 space-y-3">
          {t.features.map((f) => (
            <li key={f} className="flex items-center gap-3 text-sm text-blue-50">
              <Check size={16} className="shrink-0 text-blue-200" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-blue-200/80">{t.footerCopy}</p>
    </div>
  );
}

/* ── Input kata sandi dengan tombol lihat ── */
export function PasswordInput({ id, placeholder, value, onChange, invalid, t, autoComplete = 'current-password' }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        className={cx(inputCls, 'h-11 pr-11', invalid && 'border-danger')}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t.hidePw : t.showPw}
        className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:text-fg"
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export const FieldError = ({ children }) =>
  children ? <p className="mt-1.5 text-xs text-danger" role="alert">{children}</p> : null;

/* ── Kerangka halaman autentikasi (login & reset) ── */
export function AuthLayout({ t, lang, setLang, isDark, toggleTheme, children }) {
  return (
    <div className="grid min-h-screen bg-surface text-fg lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <BrandPanel t={t} />
      <div className="flex min-h-screen flex-col px-5 py-5 sm:px-8">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 lg:invisible">
            <img src="/assets/logo.jpg" alt="" className="h-8 w-8 rounded-lg object-cover" />
            <span className="font-display text-sm font-semibold">Blue Rose Tech</span>
          </div>
          <div className="flex items-center gap-1">
            <IconButton label={isDark ? t.themeLight : t.themeDark} onClick={toggleTheme}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </IconButton>
            <label htmlFor="lang" className="sr-only">{t.language}</label>
            <select
              id="lang"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="h-9 rounded-lg border-0 bg-transparent pl-2 pr-7 text-sm text-muted hover:bg-subtle focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-fade-in">{children}</div>
        </main>

        <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-faint lg:justify-end">
          <span className="lg:hidden">{t.footerCopy}</span>
          <a href="#" className="hover:text-fg">{t.helpdesk}</a>
          <a href="#" className="hover:text-fg">{t.privacy}</a>
        </footer>
      </div>
    </div>
  );
}

/* ── Halaman Login ── */
export default function LoginPage({ isDark, toggleTheme, onLogin, onForgotPassword }) {
  const [lang, setLang] = useState('id');
  const [nip, setNip] = useState('');
  const [pw, setPw] = useState('');
  const [errors, setErrors] = useState({});
  const t = dict[lang];

  const handleSubmit = (e) => {
    e.preventDefault();
    const next = {};
    if (!nip.trim()) next.nip = t.errNip;
    if (!pw) next.pw = t.errPw;
    setErrors(next);
    if (!Object.keys(next).length) onLogin();
  };

  return (
    <AuthLayout t={t} lang={lang} setLang={setLang} isDark={isDark} toggleTheme={toggleTheme}>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{t.loginTitle}</h2>
      <p className="mt-1.5 text-sm text-muted">{t.loginSub}</p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
        <Field label={t.nipLabel} htmlFor="nipLogin">
          <input
            id="nipLogin"
            type="text"
            inputMode="numeric"
            autoComplete="username"
            maxLength={16}
            placeholder={t.nipPh}
            value={nip}
            onChange={(e) => setNip(e.target.value)}
            aria-invalid={!!errors.nip || undefined}
            className={cx(inputCls, 'h-11', errors.nip && 'border-danger')}
          />
          <FieldError>{errors.nip}</FieldError>
        </Field>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor="pwLogin" className="text-[13px] font-medium">{t.pwLabel}</label>
            <button type="button" onClick={onForgotPassword} className="text-[13px] font-medium text-accent-text hover:underline">
              {t.forgotPw}
            </button>
          </div>
          <PasswordInput id="pwLogin" value={pw} onChange={(e) => setPw(e.target.value)} invalid={!!errors.pw} t={t} />
          <FieldError>{errors.pw}</FieldError>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-4 w-4 rounded border-line-strong accent-[var(--accent)]" />
          {t.rememberMe}
        </label>

        <Button type="submit" size="lg" className="w-full">{t.loginBtn}</Button>
      </form>
    </AuthLayout>
  );
}
