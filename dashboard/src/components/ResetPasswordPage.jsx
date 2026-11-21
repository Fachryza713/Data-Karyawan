import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { dict as loginDict, AuthLayout, FieldError, FormNotice, Spinner, EMAIL_RE } from './LoginPage';
import { Button, Field, inputCls, cx } from './ui';
import { supabase } from '../lib/supabase';

const dict = {
  id: {
    ...loginDict.id,
    resetTitle: 'Lupa kata sandi',
    resetSub: 'Masukkan email kantor Anda. Kami akan mengirim link untuk membuat kata sandi baru.',
    resetBtn: 'Kirim link reset',
    sending: 'Mengirim…',
    backToLogin: 'Kembali ke halaman masuk',
    sentTitle: 'Periksa email Anda',
    sentBody: (email) =>
      `Jika ${email} terdaftar, link untuk membuat kata sandi baru sudah dikirim. Link berlaku 1 jam. Periksa juga folder spam.`,
    sendAgain: 'Kirim ulang',
    errSend: 'Link gagal dikirim. Coba lagi beberapa saat lagi.',
  },
  en: {
    ...loginDict.en,
    resetTitle: 'Forgot password',
    resetSub: 'Enter your work email. We will send you a link to create a new password.',
    resetBtn: 'Send reset link',
    sending: 'Sending…',
    backToLogin: 'Back to sign in',
    sentTitle: 'Check your email',
    sentBody: (email) =>
      `If ${email} is registered, a link to create a new password has been sent. The link is valid for 1 hour. Check your spam folder too.`,
    sendAgain: 'Send again',
    errSend: 'Could not send the link. Please try again shortly.',
  },
};

export default function ResetPasswordPage({ isDark, toggleTheme }) {
  const navigate = useNavigate();
  const [lang, setLang] = useState('id');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const t = dict[lang];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const trimmed = email.trim();
    const fieldErr = !trimmed ? t.errEmail : !EMAIL_RE.test(trimmed) ? t.errEmailFormat : null;
    setError(fieldErr);
    setServerError(null);
    if (fieldErr) return;

    setSubmitting(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    setSubmitting(false);

    // Email tidak terdaftar tidak menghasilkan error di Supabase, jadi respons sukses tidak membocorkan apa pun.
    if (err) {
      setServerError(err.status === 429 ? t.authErrors.rate_limit : t.errSend);
      return;
    }
    setSentTo(trimmed);
  };

  const backButton = (
    <button
      type="button"
      onClick={() => navigate('/login')}
      className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg"
    >
      <ArrowLeft size={16} aria-hidden="true" /> {t.backToLogin}
    </button>
  );

  if (sentTo) {
    return (
      <AuthLayout t={t} lang={lang} setLang={setLang} isDark={isDark} toggleTheme={toggleTheme}>
        {backButton}
        <MailCheck size={28} strokeWidth={1.6} className="text-accent-text" aria-hidden="true" />
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">{t.sentTitle}</h2>
        <p className="mt-1.5 text-sm text-muted" role="status">{t.sentBody(sentTo)}</p>
        <Button variant="secondary" size="lg" className="mt-8 w-full" onClick={() => setSentTo(null)}>
          {t.sendAgain}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout t={t} lang={lang} setLang={setLang} isDark={isDark} toggleTheme={toggleTheme}>
      {backButton}

      <h2 className="font-display text-2xl font-semibold tracking-tight">{t.resetTitle}</h2>
      <p className="mt-1.5 text-sm text-muted">{t.resetSub}</p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
        <FormNotice>{serverError}</FormNotice>

        <Field label={t.emailLabel} required htmlFor="emailReset">
          <input
            id="emailReset"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder={t.emailPh}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error || undefined}
            className={cx(inputCls, 'h-11', error && 'border-danger')}
          />
          <FieldError>{error}</FieldError>
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={submitting} aria-busy={submitting || undefined}>
          {submitting ? <><Spinner /> {t.sending}</> : t.resetBtn}
        </Button>
      </form>
    </AuthLayout>
  );
}
