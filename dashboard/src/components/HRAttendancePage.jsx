import React, { useState } from 'react';
import {
  CheckCircle2, Clock, CalendarDays, MapPin, ClipboardList, Radar,
  Download, Settings, ChevronLeft, ChevronRight, RefreshCw,
  Check, X, Paperclip, FileText, AlertTriangle, Timer,
} from 'lucide-react';

/* ── data awal ── */
const INITIAL_REQUESTS = [
  {
    id: 1,
    name: 'Raditya Pratama',
    nip: 'BRT-2023-0884',
    initials: 'RP',
    color: 'bg-blue-500',
    division: 'Teknologi Informasi',
    position: 'Frontend Developer',
    type: 'cuti',
    typeLabel: '✈️ Cuti Tahunan',
    days: 2,
    dates: '26 - 27 Feb 2026',
    reason: 'Acara keluarga dan perpanjangan dokumen pribadi di luar kota.',
    attachment: null,
    quota: '8 Hari',
    submitted: '24 Feb 2026, 09:12 WIB',
    category: null,
    status: 'pending',
  },
  {
    id: 2,
    name: 'Sarah Anindita',
    nip: 'BRT-2022-019',
    initials: 'SA',
    color: 'bg-rose-500',
    division: 'Human Capital',
    position: 'People Ops Lead',
    type: 'sakit',
    typeLabel: '🏥 Izin Sakit',
    days: 1,
    dates: '24 Feb 2026',
    reason: 'Demam tinggi dan flu, surat keterangan dokter terlampir.',
    attachment: 'Surat Dokter.pdf',
    quota: null,
    submitted: '24 Feb 2026, 07:45 WIB',
    category: 'Izin Medis Rawat Jalan',
    status: 'pending',
  },
  {
    id: 3,
    name: 'Dimas Pratama',
    nip: 'BRT-2024-002',
    initials: 'DP',
    color: 'bg-violet-500',
    division: 'Pemasaran & Komunikasi',
    position: 'Digital Growth Specialist',
    type: 'cuti',
    typeLabel: '🎓 Izin Khusus',
    days: 1,
    dates: '28 Feb 2026',
    reason: 'Mengurus administrasi wisuda universitas.',
    attachment: null,
    quota: null,
    submitted: '23 Feb 2026, 16:30 WIB',
    category: 'Izin Khusus Sesuai PKB',
    status: 'pending',
  },
  {
    id: 4,
    name: 'Rina Kusuma',
    nip: 'BRT-2023-055',
    initials: 'RK',
    color: 'bg-teal-500',
    division: 'Operasional',
    position: 'Supply Chain Analyst',
    type: 'cuti',
    typeLabel: '✈️ Cuti Tahunan',
    days: 3,
    dates: '3 - 5 Mar 2026',
    reason: 'Liburan keluarga ke Bali.',
    attachment: null,
    quota: '10 Hari',
    submitted: '22 Feb 2026, 14:20 WIB',
    category: null,
    status: 'pending',
  },
  {
    id: 5,
    name: 'Arief Hidayat',
    nip: 'BRT-2021-033',
    initials: 'AH',
    color: 'bg-amber-500',
    division: 'Keuangan',
    position: 'Tax Specialist',
    type: 'sakit',
    typeLabel: '🏥 Izin Sakit',
    days: 2,
    dates: '24 - 25 Feb 2026',
    reason: 'Rawat jalan pasca operasi gigi bungsu.',
    attachment: 'Rujukan RS.pdf',
    quota: null,
    submitted: '23 Feb 2026, 20:05 WIB',
    category: 'Izin Medis Rawat Jalan',
    status: 'pending',
  },
];

const ATTENDANCE_LOG = [
  { name: 'Raditya Pratama', nip: 'BRT-2023-0884', initials: 'RP', color: 'bg-blue-500', division: 'Teknologi Informasi', position: 'Frontend Developer', in: '08:15', out: '17:35', gps: 'HQ Jakarta', radius: '15m', status: 'hadir' },
  { name: 'Budi Santoso', nip: 'BRT-2021-045', initials: 'BS', color: 'bg-emerald-500', division: 'Keuangan', position: 'Finance Controller', in: '08:24', out: '17:30', gps: 'HQ Jakarta', radius: '22m', status: 'hadir' },
  { name: 'Citra Dewi', nip: 'BRT-2023-112', initials: 'CD', color: 'bg-pink-500', division: 'Produk & Desain', position: 'UI/UX Specialist', in: '08:42', out: '17:40', gps: 'HQ Jakarta', radius: '10m', status: 'terlambat', lateMin: 12 },
  { name: 'Eko Prasetyo', nip: 'BRT-2022-078', initials: 'EP', color: 'bg-orange-500', division: 'Teknologi Informasi', position: 'Backend Engineer', in: '08:45', out: null, gps: null, radius: '3.2 km', status: 'luar-radius' },
  { name: 'Nadia Putri', nip: 'BRT-2023-091', initials: 'NP', color: 'bg-violet-500', division: 'Operasional', position: 'Project Coordinator', in: null, out: null, gps: null, radius: null, status: 'cuti' },
];

const DIVISIONS = ['Semua Divisi', 'Teknologi Informasi', 'Keuangan', 'Produk & Desain', 'Operasional', 'Human Capital', 'Pemasaran & Komunikasi'];
const STATUSES = ['Semua Status', 'Tepat Waktu', 'Terlambat', 'Di Luar Radius', 'Cuti'];

export default function HRAttendancePage({ isDark }) {
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [filterTab, setFilterTab] = useState('semua');
  const [page, setPage] = useState(1);
  const [divisionFilter, setDivisionFilter] = useState('Semua Divisi');
  const [statusFilter, setStatusFilter] = useState('Semua Status');
  const [toast, setToast] = useState(null);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showExtra, setShowExtra] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAction = (id, action) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: action } : r))
    );
    showToast(
      action === 'approved'
        ? 'Permohonan cuti / izin telah disetujui.'
        : 'Permohonan cuti / izin telah ditolak.',
      action === 'approved' ? 'success' : 'error'
    );
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const cutiCount = requests.filter((r) => r.status === 'pending' && r.type === 'cuti').length;
  const sakitCount = requests.filter((r) => r.status === 'pending' && r.type === 'sakit').length;

  const filteredRequests = requests.filter((r) => {
    if (r.status !== 'pending') return false;
    if (filterTab === 'cuti') return r.type === 'cuti';
    if (filterTab === 'sakit') return r.type === 'sakit';
    return true;
  });

  const visibleRequests = showExtra ? filteredRequests : filteredRequests.slice(0, 3);
  const hiddenCount = filteredRequests.length - 3;

  const card = isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200';
  const sub = isDark ? 'text-slate-400' : 'text-slate-500';
  const title = isDark ? 'text-white' : 'text-neutral';
  const divider = isDark ? 'border-slate-800' : 'border-slate-100';

  const badge = (tone) => {
    const map = {
      green: isDark ? 'bg-emerald-950/50 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
      yellow: isDark ? 'bg-amber-950/50 text-amber-300' : 'bg-amber-50 text-amber-700',
      blue: isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-blue-700',
      red: isDark ? 'bg-red-950/50 text-red-300' : 'bg-red-50 text-red-700',
      orange: isDark ? 'bg-orange-950/50 text-orange-300' : 'bg-orange-50 text-orange-600',
      gray: isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600',
      purple: isDark ? 'bg-violet-950/50 text-violet-300' : 'bg-violet-50 text-violet-700',
    };
    return `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${map[tone] || map.gray}`;
  };

  const statusBadgeLog = (row) => {
    if (row.status === 'hadir')
      return <span className={badge('green')}><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />Tepat Waktu</span>;
    if (row.status === 'terlambat')
      return <span className={badge('yellow')}><span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />Terlambat ({row.lateMin}m)</span>;
    if (row.status === 'luar-radius')
      return <span className={badge('red')}><span className="w-1.5 h-1.5 bg-red-500 rounded-full" />Di Luar Radius</span>;
    if (row.status === 'cuti')
      return <span className={badge('blue')}><CalendarDays size={12} />Cuti Tahunan</span>;
    return null;
  };

  const typeColor = (r) => {
    if (r.typeLabel.includes('Sakit')) return 'yellow';
    if (r.typeLabel.includes('Khusus') || r.typeLabel.includes('🎓')) return 'purple';
    return 'blue';
  };

  return (
    <>
      {/* ── Header ── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={`flex items-center gap-2.5 text-[22px] font-headline font-bold leading-tight ${title}`}>
            Manajemen Kehadiran & Persetujuan Cuti
            <CheckCircle2 size={22} className={isDark ? 'text-blue-400' : 'text-secondary'} />
          </h1>
          <p className={`text-sm mt-1 ${sub}`}>
            Verifikasi permohonan cuti/sakit karyawan dan pantau log presensi harian seluruh divisi secara real-time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors ${isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            <Clock size={15} />
            Atur Shift & Jam Kerja
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-semibold shadow-md shadow-secondary/20 transition-colors">
            <Download size={15} />
            Ekspor Rekap Absensi (CSV/PDF)
          </button>
        </div>
      </div>

      {/* ── 4 Kartu Metrik ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'HADIR TEPAT WAKTU', value: '112 Karyawan', icon: CheckCircle2, iconColor: 'text-emerald-500', bg: isDark ? 'bg-emerald-950/30' : 'bg-emerald-50', badgeTone: 'green', badgeText: '87.5% Tepat Waktu' },
          { label: 'TERLAMBAT MASUK', value: '6 Karyawan', icon: Timer, iconColor: 'text-amber-500', bg: isDark ? 'bg-amber-950/30' : 'bg-amber-50', badgeTone: 'yellow', badgeText: 'Rata-rata 12 menit' },
          { label: 'SEDANG CUTI / SAKIT', value: '4 Karyawan', icon: CalendarDays, iconColor: 'text-blue-500', bg: isDark ? 'bg-blue-950/30' : 'bg-blue-50', badgeTone: 'blue', badgeText: 'Disetujui Aktif' },
          { label: 'DI LUAR RADIUS GPS', value: '1 Karyawan', icon: MapPin, iconColor: 'text-red-500', bg: isDark ? 'bg-red-950/30' : 'bg-red-50', badgeTone: 'red', badgeText: 'Butuh Klarifikasi' },
        ].map((m, i) => {
          const Icon = m.icon;
          return (
            <div key={i} className={`rounded-2xl border p-5 flex items-start justify-between transition-colors duration-300 ${card}`}>
              <div>
                <p className={`text-[11px] font-bold tracking-wider ${sub}`}>{m.label}</p>
                <p className={`font-headline font-extrabold text-xl mt-2 mb-3 ${title}`}>{m.value}</p>
                <span className={badge(m.badgeTone)}><span className={`w-1.5 h-1.5 rounded-full ${m.iconColor.replace('text-', 'bg-')}`} />{m.badgeText}</span>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${m.bg}`}>
                <Icon size={20} className={m.iconColor} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Kartu Antrean Persetujuan ── */}
      <div className={`rounded-2xl border transition-colors duration-300 mb-6 ${card}`}>
        {/* Header */}
        <div className={`px-6 py-5 flex flex-wrap items-start justify-between gap-4 border-b ${divider}`}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-orange-950/40' : 'bg-orange-50'}`}>
              <ClipboardList size={20} className={isDark ? 'text-orange-400' : 'text-orange-500'} />
            </div>
            <div>
              <h3 className={`font-headline font-semibold text-[15px] ${title}`}>Menunggu Persetujuan Cuti / Sakit</h3>
              <p className={`text-[12px] mt-0.5 ${sub}`}>Tinjau dan berikan konfirmasi persetujuan untuk pengajuan izin dan cuti tim aktif.</p>
            </div>
            <span className={badge('orange')}>{pendingCount} Permohonan Pending</span>
          </div>
          {/* Filter tabs */}
          <div className="flex items-center gap-1">
            {[
              { id: 'semua', label: `Semua (${pendingCount})` },
              { id: 'cuti', label: `Cuti Tahunan (${cutiCount})` },
              { id: 'sakit', label: `Sakit & Bukti Medis (${sakitCount})` },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setFilterTab(t.id)}
                className={`px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  filterTab === t.id
                    ? (isDark ? 'bg-blue-950/50 text-blue-300 font-semibold' : 'bg-[#EFF6FF] text-primary font-semibold')
                    : (isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-50')
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Items */}
        <div className="divide-y divide-inherit">
          {visibleRequests.length === 0 && (
            <div className="px-6 py-10 text-center">
              <p className={`text-[13px] ${sub}`}>Tidak ada permohonan pending saat ini.</p>
            </div>
          )}
          {visibleRequests.map((r) => (
            <div key={r.id} className={`px-6 py-5 flex gap-4 ${isDark ? 'divide-slate-800' : 'divide-slate-100'}`}>
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-full ${r.color} text-white font-headline font-bold text-sm flex items-center justify-center flex-shrink-0 mt-0.5`}>
                {r.initials}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-semibold text-[14px] ${title}`}>{r.name}</span>
                  <span className={`text-[11px] ${sub}`}>({r.nip})</span>
                </div>
                <p className={`text-[12px] mt-0.5 ${sub}`}>{r.division} • {r.position}</p>

                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <span className={badge(typeColor(r))}>{r.typeLabel} ({r.days} Hari)</span>
                  <span className={badge('gray')}>{r.dates}</span>
                </div>

                <div className={`mt-2.5 px-3.5 py-2.5 rounded-xl text-[12px] leading-relaxed ${isDark ? 'bg-slate-800/60 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
                  {r.reason}
                  {r.attachment && (
                    <button
                      onClick={() => setShowDocModal(true)}
                      className={`ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${isDark ? 'bg-blue-950/40 text-blue-300 hover:bg-blue-950/60' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                    >
                      <Paperclip size={11} />
                      Lihat {r.attachment}
                    </button>
                  )}
                </div>

                <p className={`text-[11px] mt-2 ${sub}`}>
                  {r.quota ? `Sisa kuota cuti: ${r.quota} • ` : r.category ? `Kategori: ${r.category} • ` : ''}
                  Diajukan: {r.submitted}
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 flex-shrink-0 mt-0.5">
                {r.status === 'pending' ? (
                  <>
                    <button
                      onClick={() => handleAction(r.id, 'approved')}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#10B981] hover:bg-emerald-600 text-white text-[12px] font-semibold rounded-xl transition-colors shadow-sm"
                    >
                      <Check size={14} />
                      Setujui
                    </button>
                    <button
                      onClick={() => handleAction(r.id, 'rejected')}
                      className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold rounded-xl border transition-colors ${isDark ? 'border-red-800/60 text-red-400 hover:bg-red-950/30' : 'border-red-200 text-red-600 hover:bg-red-50'}`}
                    >
                      <X size={14} />
                      Tolak
                    </button>
                  </>
                ) : (
                  <span className={badge(r.status === 'approved' ? 'green' : 'red')}>
                    {r.status === 'approved' ? '✓ Telah Disetujui' : '✕ Ditolak'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className={`px-6 py-3.5 border-t flex items-center justify-between ${divider}`}>
          <span className={`flex items-center gap-1.5 text-[11px] ${sub}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Sistem Persetujuan Otomatis Siap (Batas Verifikasi Harian: 17:00 WIB)
          </span>
          {hiddenCount > 0 && !showExtra && (
            <button onClick={() => setShowExtra(true)} className={`text-[12px] font-semibold hover:underline ${isDark ? 'text-blue-400' : 'text-secondary'}`}>
              Lihat {hiddenCount} Permohonan Lainnya di Antrean →
            </button>
          )}
        </div>
      </div>

      {/* ── Tabel Log Presensi ── */}
      <div className={`rounded-2xl border transition-colors duration-300 ${card}`}>
        {/* Header */}
        <div className={`px-6 py-5 flex flex-wrap items-start justify-between gap-4 border-b ${divider}`}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-emerald-950/40' : 'bg-emerald-50'}`}>
              <Radar size={20} className={isDark ? 'text-emerald-400' : 'text-emerald-600'} />
            </div>
            <div>
              <h3 className={`font-headline font-semibold text-[15px] ${title}`}>Log Presensi Harian Seluruh Karyawan</h3>
              <p className={`text-[12px] mt-0.5 ${sub}`}>Sinkronisasi otomatis GPS Geofencing Head Office Jakarta</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
              <CalendarDays size={14} />
              Senin, 24 Feb 2026
            </div>
            <select
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
              className={`px-3 py-2 rounded-xl border text-[12px] font-medium appearance-none cursor-pointer focus:outline-none ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
            >
              {DIVISIONS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`px-3 py-2 rounded-xl border text-[12px] font-medium appearance-none cursor-pointer focus:outline-none ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
            >
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-800' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className={isDark ? 'bg-slate-800/50' : 'bg-slate-50/80'}>
                <th className={`text-left font-semibold px-6 py-3 text-[11px] tracking-wider uppercase ${sub}`}>Nama Karyawan & NIP</th>
                <th className={`text-left font-semibold px-6 py-3 text-[11px] tracking-wider uppercase ${sub}`}>Divisi & Jabatan</th>
                <th className={`text-left font-semibold px-6 py-3 text-[11px] tracking-wider uppercase ${sub}`}>Jam Masuk</th>
                <th className={`text-left font-semibold px-6 py-3 text-[11px] tracking-wider uppercase ${sub}`}>Jam Pulang</th>
                <th className={`text-left font-semibold px-6 py-3 text-[11px] tracking-wider uppercase ${sub}`}>Titik Lokasi GPS</th>
                <th className={`text-left font-semibold px-6 py-3 text-[11px] tracking-wider uppercase ${sub}`}>Status Kehadiran</th>
              </tr>
            </thead>
            <tbody>
              {ATTENDANCE_LOG.map((row, i) => (
                <tr key={i} className={`border-t transition-colors ${isDark ? 'border-slate-800 hover:bg-slate-800/30' : 'border-slate-100 hover:bg-slate-50/60'}`}>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${row.color} text-white font-headline font-bold text-[11px] flex items-center justify-center flex-shrink-0`}>
                        {row.initials}
                      </div>
                      <div>
                        <p className={`font-medium ${title}`}>{row.name}</p>
                        <p className={`text-[11px] ${sub}`}>{row.nip}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <p className={isDark ? 'text-slate-200' : 'text-neutral'}>{row.division}</p>
                    <p className={`text-[11px] ${sub}`}>{row.position}</p>
                  </td>
                  <td className="px-6 py-3.5">
                    {row.in ? (
                      row.status === 'terlambat' ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-bold ${isDark ? 'bg-amber-950/40 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                          {row.in} WIB
                        </span>
                      ) : (
                        <span className={isDark ? 'text-slate-200' : 'text-neutral'}>{row.in} WIB</span>
                      )
                    ) : (
                      <span className={sub}>-</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    {row.out ? (
                      <span className={isDark ? 'text-slate-200' : 'text-neutral'}>{row.out} WIB</span>
                    ) : (
                      <span className={sub}>-</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    {row.status === 'luar-radius' ? (
                      <span className={`font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                        <AlertTriangle size={13} className="inline -mt-0.5 mr-1" />
                        Luar Radius ({row.radius})
                      </span>
                    ) : row.gps ? (
                      <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                        <MapPin size={13} className="inline -mt-0.5 mr-1 text-emerald-500" />
                        {row.gps} (Radius {row.radius})
                      </span>
                    ) : (
                      <span className={sub}>-</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5">{statusBadgeLog(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <div className={`px-6 py-4 flex items-center justify-between border-t ${divider}`}>
          <span className={`text-[12px] ${sub}`}>Menampilkan 5 dari 128 data presensi karyawan</span>
          <div className="flex items-center gap-1">
            <button disabled className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${isDark ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 cursor-not-allowed'}`}>
              <ChevronLeft size={14} className="inline -mt-0.5" /> Sebelumnya
            </button>
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`w-8 h-8 rounded-lg text-[12px] font-semibold transition-colors ${
                  page === n ? 'bg-[#1E3A8A] text-white shadow-sm' : (isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100')
                }`}
              >
                {n}
              </button>
            ))}
            <button className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>
              Selanjutnya <ChevronRight size={14} className="inline -mt-0.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal Surat Dokter ── */}
      {showDocModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center" onClick={() => setShowDocModal(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-modal-in" />
          <div
            className={`relative z-10 w-full max-w-md rounded-2xl border shadow-2xl animate-modal-in ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-6 py-5 flex items-center justify-between border-b ${divider}`}>
              <div className="flex items-center gap-2.5">
                <FileText size={18} className={isDark ? 'text-blue-400' : 'text-secondary'} />
                <h3 className={`font-headline font-semibold text-[15px] ${title}`}>Preview Surat Dokter</h3>
              </div>
              <button onClick={() => setShowDocModal(false)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-8 flex flex-col items-center text-center">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${isDark ? 'bg-blue-950/50' : 'bg-blue-50'}`}>
                <FileText size={28} className={isDark ? 'text-blue-400' : 'text-secondary'} />
              </div>
              <p className={`font-semibold text-[14px] ${title}`}>Surat Dokter.pdf</p>
              <p className={`text-[12px] mt-1.5 ${sub}`}>Surat keterangan sakit dari dr. Andini, Sp.PD — RS Pertamina Jaya</p>
              <p className={`text-[12px] mt-1 ${sub}`}>Tanggal: 23 Februari 2026 • Diagnosis: ISPA (Infeksi Saluran Pernapasan Atas)</p>
              <p className={`text-[12px] mt-1 ${sub}`}>Rekomendasi istirahat: 1 hari kerja</p>
            </div>
            <div className={`px-6 py-4 border-t flex justify-end ${divider}`}>
              <button onClick={() => setShowDocModal(false)} className="px-5 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-semibold rounded-xl transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
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

