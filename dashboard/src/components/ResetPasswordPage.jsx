import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { dict as loginDict, AuthLayout, PasswordInput, FieldError } from './LoginPage';
import { Button, Field, inputCls, cx } from './ui';

const dict = {
  id: {
    ...loginDict.id,
    resetTitle: 'Atur ulang kata sandi',
    resetSub: 'Masukkan NIP dan buat kata sandi baru.',
    newPwLabel: 'Kata sandi baru',
    pwHelp: 'Minimal 8 karakter, berisi huruf dan angka.',
    confirmPwLabel: 'Ulangi kata sandi baru',
    resetBtn: 'Simpan kata sandi',
    backToLogin: 'Kembali ke halaman masuk',
    errPwRule: 'Minimal 8 karakter dengan huruf dan angka.',
    errMatch: 'Kata sandi tidak sama.',
  },
  en: {
    ...loginDict.en,
    resetTitle: 'Reset your password',
    resetSub: 'Enter your employee ID and choose a new password.',
    newPwLabel: 'New password',
    pwHelp: 'At least 8 characters, with letters and numbers.',
    confirmPwLabel: 'Confirm new password',
    resetBtn: 'Save password',
    backToLogin: 'Back to sign in',
    errPwRule: 'At least 8 characters with letters and numbers.',
    errMatch: 'Passwords do not match.',
  },
};

export default function ResetPasswordPage({ isDark, toggleTheme, onReset, onBackToLogin }) {
  const [lang, setLang] = useState('id');
  const [nip, setNip] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const t = dict[lang];

  const handleSubmit = (e) => {
    e.preventDefault();
    const next = {};
    if (!nip.trim()) next.nip = t.errNip;
    if (pw.length < 8 || !/[a-z]/i.test(pw) || !/\d/.test(pw)) next.pw = t.errPwRule;
    if (confirm !== pw) next.confirm = t.errMatch;
    setErrors(next);
    if (!Object.keys(next).length) onReset();
  };

  return (
    <AuthLayout t={t} lang={lang} setLang={setLang} isDark={isDark} toggleTheme={toggleTheme}>
      <button
        type="button"
        onClick={onBackToLogin}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg"
      >
        <ArrowLeft size={16} aria-hidden="true" /> {t.backToLogin}
      </button>

      <h2 className="font-display text-2xl font-semibold tracking-tight">{t.resetTitle}</h2>
      <p className="mt-1.5 text-sm text-muted">{t.resetSub}</p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
        <Field label={t.nipLabel} required htmlFor="nipReset">
          <input
            id="nipReset"
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

        <Field label={t.newPwLabel} required htmlFor="newPw" hint={errors.pw ? null : t.pwHelp}>
          <PasswordInput id="newPw" value={pw} onChange={(e) => setPw(e.target.value)} invalid={!!errors.pw} t={t} autoComplete="new-password" />
          <FieldError>{errors.pw}</FieldError>
        </Field>

        <Field label={t.confirmPwLabel} required htmlFor="confirmPw">
          <PasswordInput id="confirmPw" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!errors.confirm} t={t} autoComplete="new-password" />
          <FieldError>{errors.confirm}</FieldError>
        </Field>

        <Button type="submit" size="lg" className="w-full">{t.resetBtn}</Button>
      </form>
    </AuthLayout>
  );
}
