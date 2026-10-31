import React, { useState, useRef } from 'react';
import {
  User,
  Camera,
  Trash2,
  Lock,
  CalendarDays,
  Phone,
  Mail,
  ShieldCheck,
  CheckCircle2,
  Info,
  History,
  Save,
  X,
} from 'lucide-react';

export default function ProfilePage({ isDark, profilePhoto, setProfilePhoto, userName, setUserName }) {
  const fileRef = useRef(null);
  const [formName, setFormName] = useState(userName);
  const [birthDate] = useState('14 Mei 1998');
  const [gender, setGender] = useState('male');
  const [phone, setPhone] = useState('+62 812-3456-7890');
  const [email, setEmail] = useState('raditya.pratama@bluerosetech.co.id');
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Ukuran file melebihi 2MB.', 'error');
      return;
    }
    const url = URL.createObjectURL(file);
    setProfilePhoto(url);
  };

  const handleRemovePhoto = () => setProfilePhoto(null);

  const handleSave = () => {
    setUserName(formName);
    showToast('Profil berhasil disimpan!');
  };

  const cardClass = isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200';
  const labelClass = isDark ? 'text-slate-200' : 'text-neutral';
  const subClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const inputClass = isDark
    ? 'bg-slate-800/90 border-slate-700 text-white placeholder:text-slate-500'
    : 'bg-slate-50 border-slate-200 text-neutral placeholder:text-slate-400';
  const disabledInputClass = isDark
    ? 'bg-slate-800/50 border-slate-700 text-slate-400'
    : 'bg-slate-100 border-slate-200 text-slate-500';

  return (
    <>
      {/* Header Halaman */}
      <div className="mb-6">
        <h1 className={`text-[22px] font-headline font-bold leading-tight ${isDark ? 'text-white' : 'text-neutral'}`}>
          Profil &amp; Identitas Karyawan
        </h1>
        <p className={`text-sm mt-1 ${subClass}`}>
          Kelola foto profil dan informasi identitas dasar kepegawaian Anda.
        </p>
      </div>

      {/* Grid 2 Kartu */}
      <div className="flex gap-6" style={{ alignItems: 'flex-start' }}>

        {/* ═══ KARTU KIRI — Foto Profil ═══ */}
        <div className={`rounded-2xl border p-6 transition-colors duration-300 ${cardClass}`} style={{ width: '32%', minWidth: 280, flexShrink: 0 }}>
          <div className="flex flex-col items-center">
            {/* Lingkaran Avatar */}
            <div className="relative mb-4">
              <div className={`w-36 h-36 rounded-full border-4 flex items-center justify-center overflow-hidden ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-100'}`}>
                {profilePhoto ? (
                  <img src={profilePhoto} alt="Foto Profil" className="w-full h-full object-cover" />
                ) : (
                  <User size={56} className={isDark ? 'text-slate-500' : 'text-slate-400'} strokeWidth={1.2} />
                )}
              </div>
              {/* Badge Di Kantor */}
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 bg-emerald-500 text-white text-[11px] font-bold rounded-full shadow-md whitespace-nowrap">
                <span className="w-1.5 h-1.5 bg-white rounded-full" />
                Di Kantor
              </span>
            </div>

            {/* Nama & NIP */}
            <h3 className={`text-base font-headline font-bold mt-3 ${isDark ? 'text-white' : 'text-neutral'}`}>
              {userName}
            </h3>
            <span className={`mt-1.5 inline-flex px-3 py-1 rounded-full text-[11px] font-semibold ${isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-primary'}`}>
              NIP: BRT-2023-0884
            </span>
            <p className={`text-[12px] text-center mt-3 leading-relaxed max-w-[220px] ${subClass}`}>
              Foto ini akan ditampilkan pada profil pojok kanan atas dan direktori internal perusahaan.
            </p>

            {/* Tombol Aksi */}
            <div className="w-full mt-5 space-y-2.5">
              <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png" hidden onChange={handleFileChange} />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-semibold rounded-xl transition-colors shadow-md shadow-blue-500/20"
              >
                <Camera size={16} />
                Ubah / Unggah Foto Baru
              </button>
              <button
                onClick={handleRemovePhoto}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold rounded-xl transition-colors border ${isDark ? 'border-red-800/60 text-red-400 hover:bg-red-950/30' : 'border-red-200 text-red-600 hover:bg-red-50'}`}
              >
                <Trash2 size={15} />
                Hapus Foto
              </button>
            </div>
          </div>

          {/* Footer Kartu */}
          <div className={`mt-5 pt-4 border-t flex items-center gap-2 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
            <Info size={14} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
            <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Format JPG, JPEG, atau PNG (Maks. 2MB)
            </span>
          </div>
        </div>

        {/* ═══ KARTU KANAN — Form Data Diri ═══ */}
        <div className={`flex-1 rounded-2xl border transition-colors duration-300 flex flex-col ${cardClass}`}>
          {/* Header */}
          <div className={`px-6 py-5 border-b flex items-start justify-between gap-4 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
            <div>
              <h3 className={`font-headline font-semibold text-[15px] ${isDark ? 'text-white' : 'text-neutral'}`}>
                Informasi Data Diri &amp; Penempatan
              </h3>
              <p className={`text-[12px] mt-1 ${subClass}`}>
                Perbarui informasi kontak pribadi Anda. Data organisasi hanya dapat diubah oleh administrator HR.
              </p>
            </div>
            <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border ${isDark ? 'bg-emerald-950/40 border-emerald-800/60 text-tertiary' : 'bg-emerald-50 border-emerald-200 text-tertiary'}`}>
              <ShieldCheck size={14} />
              Terverifikasi HR
            </span>
          </div>

          {/* Form Fields */}
          <div className="px-6 py-5 flex-1 space-y-5">
            {/* Baris 1: Nama Lengkap */}
            <div>
              <label className={`text-[13px] font-semibold ${labelClass}`}>
                Nama Lengkap <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <User size={17} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${inputClass}`}
                />
              </div>
            </div>

            {/* Baris 2: Divisi & Jabatan (Read Only) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={`text-[13px] font-semibold ${labelClass}`}>Divisi</label>
                  <span className={`text-[10px] font-medium flex items-center gap-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    <Lock size={10} /> Diatur oleh HR
                  </span>
                </div>
                <div className="relative">
                  <input type="text" value="Teknologi Informasi" readOnly className={`w-full pl-4 pr-10 py-2.5 rounded-xl text-sm border cursor-not-allowed ${disabledInputClass}`} />
                  <Lock size={15} className={`absolute right-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={`text-[13px] font-semibold ${labelClass}`}>Jabatan</label>
                  <span className={`text-[10px] font-medium flex items-center gap-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    <Lock size={10} /> Diatur oleh HR
                  </span>
                </div>
                <div className="relative">
                  <input type="text" value="Frontend Developer" readOnly className={`w-full pl-4 pr-10 py-2.5 rounded-xl text-sm border cursor-not-allowed ${disabledInputClass}`} />
                  <Lock size={15} className={`absolute right-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
                </div>
              </div>
            </div>

            {/* Baris 3: Tanggal Lahir & Jenis Kelamin */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-[13px] font-semibold mb-1.5 block ${labelClass}`}>Tanggal Lahir</label>
                <div className="relative">
                  <CalendarDays size={17} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <input type="text" defaultValue={birthDate} className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${inputClass}`} />
                </div>
              </div>
              <div>
                <label className={`text-[13px] font-semibold mb-1.5 block ${labelClass}`}>Jenis Kelamin</label>
                <div className="flex gap-3 mt-0.5">
                  {[
                    { value: 'male', label: 'Laki-laki' },
                    { value: 'female', label: 'Perempuan' },
                  ].map((opt) => {
                    const selected = gender === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setGender(opt.value)}
                        className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium border-2 transition-all ${
                          selected
                            ? 'border-blue-500 bg-blue-50/80 text-blue-700 ' + (isDark ? '!bg-blue-950/40 !text-blue-300 !border-blue-500' : '')
                            : isDark
                              ? 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}
                        style={selected && isDark ? { background: 'rgba(30,58,138,0.3)', color: '#93c5fd', borderColor: '#3b82f6' } : undefined}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Baris 4: Telepon & Email */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-[13px] font-semibold mb-1.5 block ${labelClass}`}>Nomor Telepon</label>
                <div className="relative">
                  <Phone size={17} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${inputClass}`} />
                </div>
              </div>
              <div>
                <label className={`text-[13px] font-semibold mb-1.5 block ${labelClass}`}>Alamat Email Kantor</label>
                <div className="relative">
                  <Mail size={17} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${inputClass}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Footer Kartu Kanan */}
          <div className={`px-6 py-4 border-t flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
            <span className={`flex items-center gap-1.5 text-[12px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <History size={14} />
              Terakhir diperbarui: 12 Januari 2026
            </span>
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1E3A8A] hover:bg-blue-900 text-white text-[13px] font-semibold rounded-xl transition-colors shadow-md shadow-primary/20"
            >
              <CheckCircle2 size={16} />
              Simpan Perubahan Profil
            </button>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[100] animate-modal-in">
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border ${
            toast.type === 'error'
              ? (isDark ? 'bg-red-950 border-red-800 text-red-200' : 'bg-white border-red-200 text-red-700')
              : (isDark ? 'bg-emerald-950 border-emerald-800 text-emerald-200' : 'bg-white border-emerald-200 text-emerald-700')
          }`}>
            {toast.type === 'error' ? <X size={18} /> : <CheckCircle2 size={18} />}
            <span className="text-[13px] font-medium">{toast.msg}</span>
          </div>
        </div>
      )}
    </>
  );
}

