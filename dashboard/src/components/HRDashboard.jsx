import React, { useState, useRef } from 'react';
import {
  Home, Users, Clock, Wallet, TrendingUp, Settings, MapPin, LogOut, Search, Sun, Moon,
  Calendar, Bell, ShieldCheck, Download, Plus, CalendarDays, Radar, ArrowRight,
  CheckCircle2, AlertTriangle, ImagePlus, Construction,
} from 'lucide-react';
import HRAttendancePage from './HRAttendancePage';

const hrMenu = [
  { id: 'beranda', label: 'Beranda HR', icon: Home },
  { id: 'karyawan', label: 'Data Karyawan', icon: Users },
  { id: 'kehadiran', label: 'Kehadiran & Cuti', icon: Clock },
  { id: 'penggajian', label: 'Penggajian & Manfaat', icon: Wallet },
  { id: 'kpi', label: 'Evaluasi Kinerja (KPI)', icon: TrendingUp },
];

/* ───────────────────────── Sidebar ───────────────────────── */
function HRSidebar({ activeHrTab, setActiveHrTab, isDark, onLogout }) {
  const logoCandidates = ['/Aset/Blue Rose.jpg', '/assets/logo.jpg'];
  const [logoIdx, setLogoIdx] = useState(0);
  const [logoSrc, setLogoSrc] = useState(logoCandidates[0]);
  const [logoError, setLogoError] = useState(false);
  const fileRef = useRef(null);

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoSrc(URL.createObjectURL(file));
    setLogoError(false);
  };

  return (
    <aside className={`flex flex-col justify-between h-screen sticky top-0 w-[272px] min-w-[272px] border-r transition-colors duration-300 ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}>
      <div>
        <div className="px-5 pt-6 pb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Klik untuk mengunggah logo"
            className={`w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/20 ${logoError ? (isDark ? 'bg-blue-950/50 border border-dashed border-blue-700' : 'bg-blue-50 border border-dashed border-blue-300') : ''}`}
          >
            {logoError ? (
              <ImagePlus size={18} className={isDark ? 'text-blue-400' : 'text-secondary'} />
            ) : (
              <img src={logoSrc} alt="Blue Rose Tech" className="w-full h-full object-cover" onError={() => {
                if (logoIdx + 1 < logoCandidates.length) { setLogoIdx(logoIdx + 1); setLogoSrc(logoCandidates[logoIdx + 1]); }
                else setLogoError(true);
              }} />
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <div>
            <h1 className={`font-headline font-bold text-[15px] leading-tight ${isDark ? 'text-white' : 'text-neutral'}`}>Blue Rose Tech</h1>
            <p className="text-[11px] text-slate-400 font-medium">HR &amp; Admin Portal</p>
          </div>
        </div>

        <div className="px-5 pb-4">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-semibold ${isDark ? 'bg-blue-950/40 border-blue-800/60 text-blue-300' : 'bg-[#EFF6FF] border-blue-200 text-primary'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            Admin Mode
          </span>
        </div>

        <nav className="px-3 space-y-0.5">
          {hrMenu.map((item) => {
            const Icon = item.icon;
            const active = activeHrTab === item.id;
            const cls = active
              ? isDark
                ? 'bg-blue-950/50 text-blue-300 font-semibold before:bg-blue-400'
                : 'bg-[#EFF6FF] text-primary font-semibold before:bg-primary'
              : isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 before:bg-transparent'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 before:bg-transparent';
            return (
              <button
                key={item.id}
                onClick={() => setActiveHrTab(item.id)}
                className={`relative w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full ${cls}`}
              >
                <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className={`mt-auto border-t p-4 space-y-1 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
        <button className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
            <Settings size={16} />
          </div>
          <div>
            <p className="text-[13px] font-medium leading-tight">Pengaturan Sistem</p>
            <p className="flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={11} /> Geofencing Kantor</p>
          </div>
        </button>
        <button
          onClick={onLogout}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${isDark ? 'text-red-400 hover:bg-red-950/30' : 'text-red-500 hover:bg-red-50'}`}
        >
          <LogOut size={19} strokeWidth={1.8} />
          Keluar
        </button>
      </div>
    </aside>
  );
}

/* ───────────────────────── Top Navbar ───────────────────────── */
function HRTopHeader({ isDark, setIsDark }) {
  const iconBtn = `relative w-10 h-10 rounded-xl border flex items-center justify-center transition-colors ${isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`;
  return (
    <header className={`sticky top-0 z-20 px-6 py-3.5 flex items-center justify-between gap-4 border-b transition-colors duration-300 ${isDark ? 'bg-[#0F172A]/95 border-slate-800' : 'bg-white/95 border-slate-200'} backdrop-blur`}>
      <div className="relative flex-1 max-w-xl">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Cari nama karyawan, NIP, divisi, atau pengajuan cuti..."
          className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-[13px] outline-none transition-colors focus:ring-2 focus:ring-secondary/30 ${isDark ? 'bg-slate-800/60 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-slate-50 border-slate-200 text-neutral placeholder:text-slate-400'}`}
        />
      </div>

      <div className="flex items-center gap-2.5">
        <button onClick={() => setIsDark((v) => !v)} className={iconBtn} title={isDark ? 'Mode Terang' : 'Mode Gelap'}>
          {isDark ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className={iconBtn}><Calendar size={18} /></button>
        <button className={iconBtn}>
          <Bell size={18} />
          <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
        </button>

        <div className={`flex items-center gap-3 pl-3 ml-1 border-l ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-secondary text-white font-headline font-bold text-sm flex items-center justify-center">DS</div>
            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full bg-tertiary ring-2 ${isDark ? 'ring-[#0F172A]' : 'ring-white'}`} />
          </div>
          <div className="hidden md:block">
            <div className="flex items-center gap-2">
              <p className={`text-[13px] font-semibold ${isDark ? 'text-white' : 'text-neutral'}`}>Dian Sastro</p>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-[#EFF6FF] text-secondary'}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" /> HR Manager
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Divisi: Human Capital | Jabatan: HR Talent Lead</p>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ───────────────────────── Beranda HR ───────────────────────── */
function HRHome({ isDark, go }) {
  const card = `rounded-2xl border transition-colors duration-300 ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`;
  const clickCard = `${card} flex flex-col justify-start text-left p-5 cursor-pointer hover:shadow-md ${isDark ? 'hover:border-slate-600' : 'hover:border-blue-200'}`;
  const divider = isDark ? 'border-slate-800' : 'border-slate-100';
  const title = isDark ? 'text-white' : 'text-neutral';
  const link = `text-[12px] font-semibold ${isDark ? 'text-blue-400' : 'text-secondary'}`;
  const badge = (tone) => {
    const map = {
      green: isDark ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600',
      yellow: isDark ? 'bg-amber-950/40 text-amber-400' : 'bg-amber-50 text-amber-600',
      orange: isDark ? 'bg-orange-950/40 text-orange-400' : 'bg-orange-50 text-orange-600',
      blue: isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-secondary',
    };
    return `inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${map[tone]}`;
  };
  const dot = (c) => <span className={`w-1.5 h-1.5 rounded-full ${c}`} />;
  const metricLabel = 'text-[12px] font-medium text-slate-400';
  const metricValue = `font-headline font-extrabold text-xl 2xl:text-2xl whitespace-nowrap mt-1.5 mb-3 ${title}`;

  return (
    <div className="space-y-6">
      {/* Banner header */}
      <div className={`${card} p-6 flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <h1 className={`flex items-center gap-2.5 font-headline font-extrabold text-2xl ${title}`}>
            <ShieldCheck size={26} className={isDark ? 'text-blue-400' : 'text-secondary'} />
            Dashboard Manajemen HR
          </h1>
          <p className="text-[13px] text-slate-400 mt-1.5 max-w-2xl">
            Pantau operasional kehadiran, persetujuan cuti, penggajian, dan evaluasi KPI karyawan Blue Rose Tech secara real-time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors ${isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            <Download size={16} /> Unduh Laporan Bulanan
          </button>
          <button onClick={() => go('karyawan')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-semibold shadow-md shadow-secondary/20 transition-colors">
            <Plus size={16} /> Tambah Karyawan Baru
          </button>
        </div>
      </div>

      {/* Baris 1: metrik */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <button onClick={() => go('karyawan')} className={clickCard}>
          <p className={metricLabel}>Total Karyawan Aktif</p>
          <p className={metricValue}>128 Karyawan</p>
          <span className={`${badge('green')} self-start`}>6 Divisi • 18 Jabatan Terdaftar</span>
        </button>

        <button onClick={() => go('kehadiran')} className={clickCard}>
          <p className={metricLabel}>Kehadiran Hari Ini</p>
          <p className={metricValue}>118 Hadir (92%)</p>
          <div className="flex flex-wrap gap-1.5">
            <span className={badge('green')}>112 Tepat Waktu</span>
            <span className={badge('yellow')}>6 Terlambat</span>
            <span className={badge('blue')}>4 Cuti/Izin</span>
          </div>
        </button>

        <button onClick={() => go('kehadiran')} className={clickCard}>
          <p className={metricLabel}>Permohonan Cuti Pending</p>
          <p className={metricValue}>5 Pengajuan</p>
          <div className="flex items-center justify-between gap-2">
            <span className={badge('orange')}>{dot('bg-orange-500')} Perlu Tindakan HR</span>
            <span className={`${link} whitespace-nowrap`}>Verifikasi →</span>
          </div>
        </button>

        <button onClick={() => go('penggajian')} className={clickCard}>
          <p className={metricLabel}>Status Payroll</p>
          <div className="flex items-center justify-between mt-2.5 mb-2">
            <span className={`text-[14px] font-bold whitespace-nowrap ${title}`}>Periode Feb 2026</span>
            <span className={`text-[13px] font-bold whitespace-nowrap ${isDark ? 'text-blue-300' : 'text-primary'}`}>85% Selesai</span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
            <div className={`h-full rounded-full ${isDark ? 'bg-blue-500' : 'bg-primary'}`} style={{ width: '85%' }} />
          </div>
          <div className="flex items-center justify-between gap-2 mt-2.5 text-[11px] whitespace-nowrap">
            <span className="text-slate-400">Jadwal rilis: 27 Feb 2026</span>
            <span className="font-semibold text-tertiary">Review Siap</span>
          </div>
        </button>
      </div>

      {/* Baris 2: notifikasi */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cuti */}
        <div className={`${card} flex flex-col`}>
          <div className={`px-5 py-4 flex items-center justify-between gap-3 border-b ${divider}`}>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-orange-950/40 text-orange-400' : 'bg-orange-50 text-orange-500'}`}><CalendarDays size={18} /></div>
              <div>
                <h3 className={`font-headline font-semibold text-sm ${title}`}>Menunggu Persetujuan Cuti / Sakit</h3>
                <p className="text-[11px] text-slate-400">Verifikasi cepat permohonan aktif tim</p>
              </div>
            </div>
            <span className={badge('orange')}>5 Pending</span>
          </div>
          <div className="p-5 flex-1">
            <button
              onClick={() => go('kehadiran')}
              className={`w-full text-left flex gap-3 p-4 rounded-xl border transition-colors ${isDark ? 'bg-orange-950/20 border-orange-900/50 hover:bg-orange-950/30' : 'bg-orange-50/60 border-orange-100 hover:bg-orange-50'}`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-orange-950/50 text-orange-400' : 'bg-orange-100 text-orange-500'}`}><Bell size={17} /></div>
              <div>
                <p className={`text-[13px] leading-relaxed ${isDark ? 'text-slate-200' : 'text-neutral'}`}>
                  Ada <b>5 pengajuan cuti &amp; izin sakit</b> baru hari ini yang membutuhkan persetujuan Anda sebelum batas waktu pukul 17:00 WIB.
                </p>
                <p className={`${link} mt-2`}>Klik untuk tinjau &amp; setujui di halaman Kehadiran &amp; Cuti →</p>
              </div>
            </button>
          </div>
          <div className={`px-5 py-3 border-t flex items-center justify-between text-[11px] ${divider}`}>
            <span className="text-slate-400">Batas verifikasi reguler: Hari ini 17:00 WIB</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-tertiary">{dot('bg-tertiary')} Sistem Siap</span>
          </div>
        </div>

        {/* Presensi */}
        <div className={`${card} flex flex-col`}>
          <div className={`px-5 py-4 flex items-center justify-between gap-3 border-b ${divider}`}>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}><Radar size={18} /></div>
              <div>
                <h3 className={`font-headline font-semibold text-sm ${title}`}>Status Presensi Harian (Real-time)</h3>
                <p className="text-[11px] text-slate-400">Sinkronisasi biometrik &amp; geofencing otomatis</p>
              </div>
            </div>
            <span className={badge('green')}>{dot('bg-tertiary')} Online GPS</span>
          </div>
          <div className="p-5 flex-1 space-y-3">
            <button
              onClick={() => go('kehadiran')}
              className={`w-full text-left flex items-center gap-3 p-4 rounded-xl border transition-colors ${isDark ? 'bg-emerald-950/20 border-emerald-900/50 hover:bg-emerald-950/30' : 'bg-emerald-50/60 border-emerald-100 hover:bg-emerald-50'}`}
            >
              <CheckCircle2 size={20} className="text-tertiary flex-shrink-0" />
              <p className={`flex-1 text-[13px] ${isDark ? 'text-slate-200' : 'text-neutral'}`}>
                <b>112 Karyawan</b> hadir tepat waktu di dalam radius GPS Head Office Jakarta.
              </p>
              <ArrowRight size={16} className="text-slate-400 flex-shrink-0" />
            </button>
            <button
              onClick={() => go('kehadiran')}
              className={`w-full text-left flex gap-3 p-4 rounded-xl border transition-colors ${isDark ? 'bg-amber-950/20 border-amber-900/50 hover:bg-amber-950/30' : 'bg-amber-50/60 border-amber-100 hover:bg-amber-50'}`}
            >
              <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className={`text-[13px] ${isDark ? 'text-slate-200' : 'text-neutral'}`}>
                  <b>Perhatian:</b> 6 Karyawan tercatat terlambat &amp; 1 presensi di luar radius kantor.
                </p>
                <p className={`${link} mt-1.5`}>Klik untuk melihat detail di halaman Kehadiran &amp; Cuti →</p>
              </div>
            </button>
          </div>
          <div className={`px-5 py-3 border-t flex items-center justify-between text-[11px] ${divider}`}>
            <span className="text-slate-400">Total data masuk: 118 presensi aktif</span>
            <button onClick={() => go('kehadiran')} className={`font-semibold hover:underline ${isDark ? 'text-blue-400' : 'text-secondary'}`}>Rekap Selengkapnya →</button>
          </div>
        </div>
      </div>

      {/* Baris 3: KPI */}
      <div className={card}>
        <div className={`px-5 py-4 flex items-center justify-between gap-3 border-b ${divider}`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-950/50 text-blue-400' : 'bg-blue-50 text-secondary'}`}><TrendingUp size={18} /></div>
            <div>
              <h3 className={`font-headline font-semibold text-sm ${title}`}>Rekapitulasi Skor Kinerja &amp; Evaluasi KPI Karyawan (Kuartal I – 2026)</h3>
              <p className="text-[11px] text-slate-400">Ringkasan komprehensif siklus evaluasi kinerja dan alokasi bonus triwulan tim</p>
            </div>
          </div>
          <span className={badge('blue')}>{dot('bg-secondary')} Siklus Aktif</span>
        </div>
        <div className="p-5">
          <div className={`rounded-xl border p-5 flex flex-col lg:flex-row lg:items-center gap-5 ${isDark ? 'bg-blue-950/20 border-blue-900/50' : 'bg-[#EFF6FF]/60 border-blue-100'}`}>
            <div className="lg:w-[70%]">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-blue-400' : 'text-secondary'}`}>STATUS EVALUASI BERJALAN</p>
              <h4 className={`font-headline font-bold text-[15px] leading-snug mt-1.5 ${title}`}>
                Progress Penilaian Kuartal I: 108 dari 128 Karyawan Selesai Dinilai (Rata-rata Skor Korporat: 88/100 – Grade A)
              </h4>
              <p className="text-[12px] text-slate-400 mt-1.5">
                Terdapat 20 karyawan yang menunggu input evaluasi KPI dan persetujuan kelayakan bonus kuartal ini.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className={`flex-1 h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                  <div className="h-full rounded-full bg-gradient-to-r from-secondary to-primary" style={{ width: '84%' }} />
                </div>
                <span className={`text-[11px] font-bold whitespace-nowrap ${isDark ? 'text-blue-300' : 'text-primary'}`}>84% Selesai Dinilai</span>
              </div>
            </div>
            <div className="lg:w-[30%] flex flex-col items-stretch lg:items-end gap-2">
              <button onClick={() => go('kpi')} className="w-full px-5 py-3 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-semibold shadow-md shadow-secondary/20 transition-colors">
                Kelola &amp; Lihat Detail di Halaman KPI →
              </button>
              <p className="text-[11px] text-slate-400 text-center lg:text-right w-full">Batas akhir pengisian KPI: 31 Maret 2026</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Placeholder tab lain ───────────────── */
function HRPlaceholder({ isDark, label, go }) {
  return (
    <div className={`rounded-2xl border p-12 flex flex-col items-center text-center ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}>
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${isDark ? 'bg-blue-950/50 text-blue-400' : 'bg-blue-50 text-secondary'}`}>
        <Construction size={24} />
      </div>
      <h2 className={`font-headline font-bold text-lg ${isDark ? 'text-white' : 'text-neutral'}`}>{label}</h2>
      <p className="text-[13px] text-slate-400 mt-1.5 max-w-md">Modul ini sedang dalam tahap pengembangan dan akan segera tersedia di Portal HR &amp; Admin.</p>
      <button onClick={() => go('beranda')} className="mt-5 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-semibold">
        ← Kembali ke Beranda HR
      </button>
    </div>
  );
}

/* ───────────────────────── Root ───────────────────────── */
export default function HRDashboard({ onLogout }) {
  const [isDark, setIsDark] = useState(false);
  const [activeHrTab, setActiveHrTab] = useState('beranda');
  const current = hrMenu.find((m) => m.id === activeHrTab);

  return (
    <div className={`flex min-h-screen font-body transition-colors duration-300 ${isDark ? 'dark bg-[#0B1120] text-slate-100' : 'bg-slate-50 text-neutral'}`} style={{ colorScheme: isDark ? 'dark' : 'light' }}>
      <HRSidebar activeHrTab={activeHrTab} setActiveHrTab={setActiveHrTab} isDark={isDark} onLogout={onLogout} />
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <HRTopHeader isDark={isDark} setIsDark={setIsDark} />
        <main className="flex-1 p-6">
          {activeHrTab === 'beranda' ? (
            <HRHome isDark={isDark} go={setActiveHrTab} />
          ) : activeHrTab === 'kehadiran' ? (
            <HRAttendancePage isDark={isDark} />
          ) : (
            <HRPlaceholder isDark={isDark} label={current.label} go={setActiveHrTab} />
          )}
        </main>
        <footer className={`px-6 py-4 border-t flex flex-wrap items-center justify-between gap-3 text-[11px] ${isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
          <p>© 2026 Blue Rose Tech. Hak Cipta Dilindungi Undang-Undang. Portal Manajemen HR &amp; Admin Enterprise.</p>
          <div className="flex flex-wrap items-center gap-4">
            <a href="#" className="hover:underline">Kebijakan Privasi</a>
            <a href="#" className="hover:underline">Buku Pedoman HR</a>
            <a href="#" className="hover:underline">Bantuan IT &amp; Server</a>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold ${isDark ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> Sistem Normal (Latency 24ms)
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
