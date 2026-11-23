import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Lock, Loader2 } from 'lucide-react';
import { PageHeader, Card, CardHeader, Button, Field, Segmented, Avatar, Badge, useToast, inputCls, cx } from './ui';
import { FieldError } from './LoginPage';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { GENDER_OPTIONS, formatDate } from '../lib/hr';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' };
const PHONE_RE = /^\+?[0-9][0-9 -]{7,19}$/;

const updatedFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
});

const toForm = (p) => ({
  full_name: p.full_name ?? '',
  phone: p.phone ?? '',
  gender: p.gender ?? '',
  birth_date: p.birth_date ?? '',
});

/* Simpan field pribadi lewat RPC (satu-satunya jalan karyawan mengubah profiles). */
function saveMyProfile(values, photoUrl) {
  return supabase.rpc('update_my_profile', {
    p_full_name: values.full_name.trim(),
    p_phone: values.phone.trim() || null,
    p_gender: values.gender || null,
    p_birth_date: values.birth_date || null,
    p_photo_url: photoUrl || null,
  });
}

const Locked = () => (
  <Badge className="gap-1"><Lock size={11} aria-hidden="true" /> Diatur HR</Badge>
);

/* Field organisasi selalu read-only. Karyawan melihat badge "Diatur HR"; HR mendapat tautan
   `editHref` ke halaman detail dirinya di modul Data karyawan. */
function ReadOnlyField({ id, label, value, editHref }) {
  const aside = editHref ? (
    <Link to={editHref} aria-label={`Ubah ${label} di Data karyawan`} className="font-medium text-accent-text hover:underline">
      Ubah di Data karyawan
    </Link>
  ) : (
    <Locked />
  );
  return (
    <Field label={label} htmlFor={id} aside={aside}>
      <input id={id} type="text" value={value || '—'} readOnly className={inputCls} />
    </Field>
  );
}

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const fileRef = useRef(null);
  const [values, setValues] = useState(() => toForm(profile));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [toast, toastNode] = useToast();
  const isHr = profile.role === 'hr';
  const orgEditHref = isHr ? `/hr/karyawan/${profile.id}` : null;

  // Sinkron saat profil di context berubah (setelah simpan / ganti foto), kecuali form sedang diedit.
  const lastSaved = useRef(toForm(profile));
  useEffect(() => {
    const prev = lastSaved.current;
    const next = toForm(profile);
    lastSaved.current = next;
    setValues((v) => (Object.keys(prev).every((k) => v[k] === prev[k]) ? next : v));
  }, [profile]);

  const initial = toForm(profile);
  const dirty = Object.keys(initial).some((k) => values[k] !== initial[k]);

  const set = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: null } : e));
  };

  const validate = () => {
    const e = {};
    const name = values.full_name.trim();
    if (!name) e.full_name = 'Nama lengkap wajib diisi.';
    else if (name.length > 100) e.full_name = 'Maksimal 100 karakter.';
    if (values.phone.trim() && !PHONE_RE.test(values.phone.trim())) e.phone = 'Contoh format: +62 812-3456-7890.';
    if (values.birth_date && values.birth_date >= new Date().toISOString().slice(0, 10)) e.birth_date = 'Tanggal lahir tidak valid.';
    return e;
  };

  const handleSave = async (ev) => {
    ev.preventDefault();
    if (saving || !dirty) return;
    const next = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean)) {
      toast('Periksa kembali isian yang ditandai.', 'error');
      return;
    }
    setSaving(true);
    const { error } = await saveMyProfile(values, profile.photo_url);
    if (error) {
      setSaving(false);
      toast(error.code === '22023' ? error.message : 'Perubahan gagal disimpan. Coba lagi.', 'error');
      return;
    }
    await refreshProfile().catch(() => {});
    setSaving(false);
    toast('Perubahan profil disimpan.');
  };

  // Foto disimpan bersama data pribadi yang sudah tersimpan (bukan isian form yang belum disimpan).
  const savePhoto = async (photoUrl) => {
    const { error } = await saveMyProfile(toForm(profile), photoUrl);
    if (error) throw error;
    await refreshProfile().catch(() => {});
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ext = PHOTO_TYPES[file.type];
    if (!ext) {
      toast('Format foto harus JPG atau PNG.', 'error');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast('Ukuran file melebihi 2 MB.', 'error');
      return;
    }

    setPhotoBusy(true);
    try {
      const path = `${profile.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (upErr) throw upErr;

      // Hapus file dengan ekstensi lain supaya hanya ada satu avatar per user.
      const other = ext === 'jpg' ? 'png' : 'jpg';
      await supabase.storage.from('avatars').remove([`${profile.id}/avatar.${other}`]);

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      await savePhoto(`${data.publicUrl}?v=${Date.now()}`); // ?v= memaksa browser memuat foto baru
      toast('Foto profil diperbarui.');
    } catch (err) {
      const tooBig = err?.statusCode === '413' || /size/i.test(err?.message ?? '');
      toast(tooBig ? 'Ukuran file melebihi 2 MB.' : 'Foto gagal diunggah. Coba lagi.', 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoBusy(true);
    try {
      await supabase.storage.from('avatars').remove([`${profile.id}/avatar.jpg`, `${profile.id}/avatar.png`]);
      await savePhoto(null);
      toast('Foto profil dihapus.');
    } catch {
      toast('Foto gagal dihapus. Coba lagi.', 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Profil" description="Foto dan data diri yang tampil di direktori internal." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        {/* Foto profil */}
        <Card className="self-start p-5">
          <div className="flex items-center gap-4 lg:flex-col lg:text-center">
            <Avatar name={profile.full_name} src={profile.photo_url} size={96} className="text-3xl" />
            <div className="min-w-0">
              <p className="font-display text-base font-semibold">{profile.full_name}</p>
              <p className="num text-[13px] text-muted">{profile.nip ?? '—'}</p>
              <p className="text-[13px] text-muted">{profile.position?.name ?? '—'}</p>
            </div>
          </div>

          <input ref={fileRef} type="file" accept="image/jpeg,image/png" hidden onChange={handleFileChange} />
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
              {photoBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
              {photoBusy ? 'Memproses…' : 'Ganti foto'}
            </Button>
            {profile.photo_url && (
              <Button
                variant="ghost"
                className="text-danger hover:bg-danger-soft hover:text-danger"
                onClick={handleRemovePhoto}
                disabled={photoBusy}
              >
                Hapus
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-faint">JPG atau PNG, maksimal 2 MB.</p>
        </Card>

        {/* Data diri */}
        <Card as="form" onSubmit={handleSave} noValidate>
          <CardHeader
            title="Data diri"
            description={isHr ? 'Data organisasi diubah lewat modul Data karyawan.' : 'Data organisasi hanya dapat diubah oleh HR.'}
          />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nama lengkap" required htmlFor="name">
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  maxLength={100}
                  value={values.full_name}
                  onChange={(e) => set('full_name', e.target.value)}
                  aria-invalid={!!errors.full_name || undefined}
                  className={cx(inputCls, errors.full_name && 'border-danger')}
                />
                <FieldError>{errors.full_name}</FieldError>
              </Field>
            </div>
            <Field label="Tanggal lahir" htmlFor="dob">
              <input
                id="dob"
                type="date"
                value={values.birth_date}
                onChange={(e) => set('birth_date', e.target.value)}
                aria-invalid={!!errors.birth_date || undefined}
                className={cx(inputCls, errors.birth_date && 'border-danger')}
              />
              <FieldError>{errors.birth_date}</FieldError>
            </Field>
            <Field label="Jenis kelamin">
              <Segmented name="Jenis kelamin" options={GENDER_OPTIONS} value={values.gender} onChange={(v) => set('gender', v)} />
            </Field>
            <Field label="Nomor telepon" htmlFor="phone">
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+62 812-3456-7890"
                value={values.phone}
                onChange={(e) => set('phone', e.target.value)}
                aria-invalid={!!errors.phone || undefined}
                className={cx(inputCls, errors.phone && 'border-danger')}
              />
              <FieldError>{errors.phone}</FieldError>
            </Field>
            <ReadOnlyField id="email" label="Email kantor" value={profile.email} editHref={orgEditHref} />
            <ReadOnlyField id="nip" label="NIP" value={profile.nip} editHref={orgEditHref} />
            <ReadOnlyField
              id="join"
              label="Tanggal masuk"
              value={profile.join_date ? formatDate(profile.join_date) : ''}
              editHref={orgEditHref}
            />
            <ReadOnlyField id="division" label="Divisi" value={profile.division?.name} editHref={orgEditHref} />
            <ReadOnlyField id="position" label="Jabatan" value={profile.position?.name} editHref={orgEditHref} />
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-faint">
              Terakhir diperbarui {profile.updated_at ? updatedFmt.format(new Date(profile.updated_at)) : '—'}
            </span>
            <div className="flex gap-2">
              {dirty && (
                <Button variant="ghost" onClick={() => { setValues(initial); setErrors({}); }} disabled={saving}>
                  Batal
                </Button>
              )}
              <Button type="submit" disabled={!dirty || saving} aria-busy={saving || undefined}>
                {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {saving ? 'Menyimpan…' : 'Simpan perubahan'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
      {toastNode}
    </>
  );
}
