import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sun, Moon, Eye, EyeOff, Check, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button, IconButton, Field, inputCls, cx } from './ui';
import { useAuth, roleHome } from '../context/AuthContext';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const dict = {
  id: {
    headline: 'Satu tempat untuk urusan kepegawaian Anda.',
    brandDesc: 'Absensi, pengajuan cuti, dan slip gaji — tanpa formulir kertas.',
    features: ['Absen masuk & pulang berbasis lokasi', 'Ajukan dan pantau cuti', 'Unduh slip gaji bulanan'],
    loginTitle: 'Masuk',
    loginSub: 'Gunakan email kantor dan kata sandi Anda.',
    emailLabel: 'Email kantor',
    emailPh: 'nama@bluerose.test',
    pwLabel: 'Kata sandi',
    loginBtn: 'Masuk',
    loggingIn: 'Memeriksa…',
    forgotPw: 'Lupa kata sandi?',
    errEmail: 'Masukkan email kantor Anda.',
    errEmailFormat: 'Format email tidak valid.',
    errPw: 'Masukkan kata sandi.',
    authErrors: {
      invalid: 'Email atau password salah.',
      rate_limit: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.',
      network: 'Tidak dapat terhubung ke server. Periksa koneksi Anda.',
      no_profile: 'Akun Anda belum terdaftar sebagai karyawan. Hubungi HR.',
      inactive: 'Akun Anda sudah dinonaktifkan. Hubungi HR bila ini keliru.',
    },
    showPw: 'Tampilkan kata sandi',
    hidePw: 'Sembunyikan kata sandi',
    footerCopy: `© ${new Date().getFullYear()} Blue Rose Tech`,
    language: 'Bahasa',
    themeLight: 'Gunakan tema terang',
    themeDark: 'Gunakan tema gelap',
  },
  en: {
    headline: 'One place for everything about your employment.',
    brandDesc: 'Attendance, leave requests, and payslips — no paper forms.',
    features: ['Location-based check-in & check-out', 'Request and track leave', 'Download monthly payslips'],
    loginTitle: 'Sign in',
    loginSub: 'Use your work email and password.',
    emailLabel: 'Work email',
    emailPh: 'name@bluerose.test',
    pwLabel: 'Password',
    loginBtn: 'Sign in',
    loggingIn: 'Checking…',
    forgotPw: 'Forgot password?',
    errEmail: 'Enter your work email.',
    errEmailFormat: 'Invalid email format.',
    errPw: 'Enter your password.',
    authErrors: {
      invalid: 'Incorrect email or password.',
      rate_limit: 'Too many attempts. Try again in a few minutes.',
      network: 'Cannot reach the server. Check your connection.',
      no_profile: 'Your account is not registered as an employee. Contact HR.',
      inactive: 'Your account has been deactivated. Contact HR if this is a mistake.',
    },
    showPw: 'Show password',
    hidePw: 'Hide password',
    footerCopy: `© ${new Date().getFullYear()} Blue Rose Tech`,
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

/* Pesan di atas form: error server atau info sukses. */
export function FormNotice({ tone = 'danger', children }) {
  if (!children) return null;
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(
        'flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm',
        tone === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
      )}
    >
      <Icon size={18} className="mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export const Spinner = () => <Loader2 size={16} className="animate-spin" aria-hidden="true" />;

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
        </footer>
      </div>
    </div>
  );
}

/* ── Halaman Login ── */
export default function LoginPage({ isDark, toggleTheme }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [lang, setLang] = useState('id');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [errors, setErrors] = useState({});
  const [authError, setAuthError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const t = dict[lang];
  const notice = location.state?.notice;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const next = {};
    const trimmed = email.trim();
    if (!trimmed) next.email = t.errEmail;
    else if (!EMAIL_RE.test(trimmed)) next.email = t.errEmailFormat;
    if (!pw) next.pw = t.errPw;
    setErrors(next);
    setAuthError(null);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    const { profile, error } = await signIn(trimmed, pw);
    setSubmitting(false);
    if (error) {
      setAuthError(error);
      return;
    }
    const home = roleHome(profile.role);
    const from = location.state?.from;
    navigate(from?.startsWith(home) ? from : home, { replace: true });
  };

  return (
    <AuthLayout t={t} lang={lang} setLang={setLang} isDark={isDark} toggleTheme={toggleTheme}>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{t.loginTitle}</h2>
      <p className="mt-1.5 text-sm text-muted">{t.loginSub}</p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
        {authError ? (
          <FormNotice>{t.authErrors[authError] ?? t.authErrors.invalid}</FormNotice>
        ) : (
          notice && <FormNotice tone="success">{notice}</FormNotice>
        )}

        <Field label={t.emailLabel} htmlFor="emailLogin">
          <input
            id="emailLogin"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder={t.emailPh}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email || undefined}
            className={cx(inputCls, 'h-11', errors.email && 'border-danger')}
          />
          <FieldError>{errors.email}</FieldError>
        </Field>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor="pwLogin" className="text-[13px] font-medium">{t.pwLabel}</label>
            <button
              type="button"
              onClick={() => navigate('/reset-password')}
              className="text-[13px] font-medium text-accent-text hover:underline"
            >
              {t.forgotPw}
            </button>
          </div>
          <PasswordInput id="pwLogin" value={pw} onChange={(e) => setPw(e.target.value)} invalid={!!errors.pw} t={t} />
          <FieldError>{errors.pw}</FieldError>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={submitting} aria-busy={submitting || undefined}>
          {submitting ? <><Spinner /> {t.loggingIn}</> : t.loginBtn}
        </Button>
      </form>
    </AuthLayout>
  );
}
