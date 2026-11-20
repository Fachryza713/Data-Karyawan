import React, { useState, useRef } from 'react';
import { Upload, Lock } from 'lucide-react';
import { PageHeader, Card, CardHeader, Button, Field, Segmented, Avatar, useToast, inputCls } from './ui';

const GENDERS = [
  { value: 'male', label: 'Laki-laki' },
  { value: 'female', label: 'Perempuan' },
];

export default function ProfilePage({ profilePhoto, setProfilePhoto, userName, setUserName }) {
  const fileRef = useRef(null);
  const [formName, setFormName] = useState(userName);
  const [birthDate, setBirthDate] = useState('1998-05-14');
  const [gender, setGender] = useState('male');
  const [phone, setPhone] = useState('+62 812-3456-7890');
  const [email, setEmail] = useState('raditya.pratama@bluerosetech.co.id');
  const [toast, toastNode] = useToast();

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast('Ukuran file melebihi 2 MB.', 'error');
      return;
    }
    setProfilePhoto(URL.createObjectURL(file));
    toast('Foto profil diperbarui.');
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast('Nama lengkap wajib diisi.', 'error');
      return;
    }
    setUserName(formName.trim());
    toast('Perubahan profil disimpan.');
  };

  const Locked = () => (
    <span className="inline-flex items-center gap-1"><Lock size={11} aria-hidden="true" /> Diatur HR</span>
  );

  return (
    <>
      <PageHeader title="Profil" description="Foto dan data diri yang tampil di direktori internal." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        {/* Foto profil */}
        <Card className="self-start p-5">
          <div className="flex items-center gap-4 lg:flex-col lg:text-center">
            <Avatar name={userName} src={profilePhoto} size={96} className="text-3xl" />
            <div className="min-w-0">
              <p className="font-display text-base font-semibold">{userName}</p>
              <p className="num text-[13px] text-muted">BRT-2023-0884</p>
              <p className="text-[13px] text-muted">Frontend Developer</p>
            </div>
          </div>

          <input ref={fileRef} type="file" accept="image/jpeg,image/png" hidden onChange={handleFileChange} />
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => fileRef.current?.click()}>
              <Upload size={16} aria-hidden="true" /> Ganti foto
            </Button>
            {profilePhoto && (
              <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setProfilePhoto(null)}>
                Hapus
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-faint">JPG atau PNG, maksimal 2 MB.</p>
        </Card>

        {/* Data diri */}
        <Card as="form" onSubmit={handleSave}>
          <CardHeader
            title="Data diri"
            description="Data organisasi hanya dapat diubah oleh HR."
          />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nama lengkap" required htmlFor="name">
                <input id="name" type="text" autoComplete="name" value={formName} onChange={(e) => setFormName(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Divisi" htmlFor="division" aside={<Locked />}>
              <input id="division" type="text" value="Teknologi Informasi" readOnly className={inputCls} />
            </Field>
            <Field label="Jabatan" htmlFor="position" aside={<Locked />}>
              <input id="position" type="text" value="Frontend Developer" readOnly className={inputCls} />
            </Field>
            <Field label="Tanggal lahir" htmlFor="dob">
              <input id="dob" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Jenis kelamin">
              <Segmented name="Jenis kelamin" options={GENDERS} value={gender} onChange={setGender} />
            </Field>
            <Field label="Nomor telepon" htmlFor="phone">
              <input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Email kantor" htmlFor="email">
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-faint">Terakhir diperbarui 12 Januari 2026</span>
            <Button type="submit">Simpan perubahan</Button>
          </div>
        </Card>
      </div>
      {toastNode}
    </>
  );
}
