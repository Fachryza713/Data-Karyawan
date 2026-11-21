import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LinkIcon } from 'lucide-react';
import { dict as loginDict, AuthLayout, PasswordInput, FieldError, FormNotice, Spinner } from './LoginPage';
import { Button, Field } from './ui';
import { FullPageLoader } from './ProtectedRoute';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const MIN_LENGTH = 8;

const dict = {
  id: {
    ...loginDict.id,
    title: 'Buat kata sandi baru',
    sub: 'Kata sandi baru berlaku untuk portal karyawan dan portal HR.',
    newPwLabel: 'Kata sandi baru',
    pwHelp: `Minimal ${MIN_LENGTH} karakter.`,
    confirmPwLabel: 'Ulangi kata sandi baru',
    saveBtn: 'Simpan kata sandi',
    saving: 'Menyimpan…',
    errLength: `Kata sandi minimal ${MIN_LENGTH} karakter.`,
    errMatch: 'Kata sandi tidak sama.',
    errSame: 'Kata sandi baru harus berbeda dari kata sandi lama.',
    errWeak: 'Kata sandi terlalu lemah. Gunakan kombinasi huruf, angka, dan simbol.',
    errSave: 'Kata sandi gagal disimpan. Coba lagi.',
    success: 'Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru.',
    invalidTitle: 'Link tidak valid',
    invalidBody: 'Link reset kata sandi sudah kedaluwarsa atau pernah dipakai. Minta link baru dari halaman lupa kata sandi.',
    requestNew: 'Minta link baru',
  },
  en: {
    ...loginDict.en,
    title: 'Create a new password',
    sub: 'Your new password applies to both the employee and HR portals.',
    newPwLabel: 'New password',
    pwHelp: `At least ${MIN_LENGTH} characters.`,
    confirmPwLabel: 'Confirm new password',
    saveBtn: 'Save password',
    saving: 'Saving…',
    errLength: `Password must be at least ${MIN_LENGTH} characters.`,
    errMatch: 'Passwords do not match.',
    errSame: 'New password must differ from the old one.',
    errWeak: 'Password is too weak. Combine letters, numbers, and symbols.',
    errSave: 'Could not save the password. Please try again.',
    success: 'Password updated. Please sign in with your new password.',
    invalidTitle: 'Invalid link',
    invalidBody: 'This reset link has expired or was already used. Request a new one from the forgot password page.',
    requestNew: 'Request a new link',
  },
};

export default function UpdatePasswordPage({ isDark, toggleTheme }) {
  const { session, initializing, signOut, clearRecovery } = useAuth();
  const navigate = useNavigate();
  const [lang, setLang] = useState('id');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const t = dict[lang];

  if (initializing) return <FullPageLoader />;

  const layoutProps = { t, lang, setLang, isDark, toggleTheme };

  // Halaman ini hanya bisa dipakai lewat sesi dari link reset di email.
  if (!session) {
    return (
      <AuthLayout {...layoutProps}>
        <LinkIcon size={28} strokeWidth={1.6} className="text-danger" aria-hidden="true" />
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">{t.invalidTitle}</h2>
        <p className="mt-1.5 text-sm text-muted">{t.invalidBody}</p>
        <Button size="lg" className="mt-8 w-full" onClick={() => navigate('/reset-password')}>{t.requestNew}</Button>
      </AuthLayout>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const next = {};
    if (pw.length < MIN_LENGTH) next.pw = t.errLength;
    if (confirm !== pw) next.confirm = t.errMatch;
    setErrors(next);
    setServerError(null);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setSubmitting(false);
      setServerError(
        error.code === 'same_password' ? t.errSame : error.code === 'weak_password' ? t.errWeak : t.errSave,
      );
      return;
    }
    clearRecovery();
    await signOut();
    navigate('/login', { replace: true, state: { notice: t.success } });
  };

  return (
    <AuthLayout {...layoutProps}>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{t.title}</h2>
      <p className="mt-1.5 text-sm text-muted">{t.sub}</p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
        <FormNotice>{serverError}</FormNotice>

        <Field label={t.newPwLabel} required htmlFor="newPw" hint={errors.pw ? null : t.pwHelp}>
          <PasswordInput id="newPw" value={pw} onChange={(e) => setPw(e.target.value)} invalid={!!errors.pw} t={t} autoComplete="new-password" />
          <FieldError>{errors.pw}</FieldError>
        </Field>

        <Field label={t.confirmPwLabel} required htmlFor="confirmPw">
          <PasswordInput id="confirmPw" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!errors.confirm} t={t} autoComplete="new-password" />
          <FieldError>{errors.confirm}</FieldError>
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={submitting} aria-busy={submitting || undefined}>
          {submitting ? <><Spinner /> {t.saving}</> : t.saveBtn}
        </Button>
      </form>
    </AuthLayout>
  );
}
