import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  MapPin,
  LogIn,
  LogOut,
  CheckCircle2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Send,
  FileText,
  AlertCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';

const INITIAL_LOG = [
  { date: '2026-02-24', day: 'Senin', in: '08:15', out: null, status: 'hadir', today: true },
  { date: '2026-02-23', day: 'Minggu', in: null, out: null, status: 'libur' },
  { date: '2026-02-22', day: 'Sabtu', in: null, out: null, status: 'libur' },
  { date: '2026-02-21', day: 'Jumat', in: '08:20', out: '17:35', status: 'hadir' },
  { date: '2026-02-20', day: 'Kamis', in: '08:42', out: '17:45', status: 'terlambat', lateMin: 12 },
  { date: '2026-02-19', day: 'Rabu', in: null, out: null, status: 'cuti', note: 'Cuti Tahunan' },
  { date: '2026-02-18', day: 'Selasa', in: '08:10', out: '17:30', status: 'hadir' },
  { date: '2026-02-17', day: 'Senin', in: '08:38', out: '17:40', status: 'terlambat', lateMin: 8 },
];

const MONTHS = [
  { value: '2026-01', label: 'Januari 2026' },
  { value: '2026-02', label: 'Februari 2026' },
];

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AttendancePage({ isDark }) {
  const [now, setNow] = useState(new Date());
  const [inRadius, setInRadius] = useState(true);
  const [checkedIn, setCheckedIn] = useState(true);
  const [checkedOut, setCheckedOut] = useState(false);
  const [checkInTime, setCheckInTime] = useState('08:15');
  const [checkOutTime, setCheckOutTime] = useState(null);
  const [logData, setLogData] = useState(INITIAL_LOG);
  const [page, setPage] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState('2026-02');
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [leaveType, setLeaveType] = useState('cuti');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const totalPages = 3;
  const perPage = 8;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const handleCheckIn = () => {
    if (checkedIn) return;
    const t = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    setCheckedIn(true);
    setCheckInTime(t);
    setLogData((prev) => {
      const copy = [...prev];
      if (copy[0]?.today) copy[0] = { ...copy[0], in: t };
      return copy;
    });
    showToast(`Absen masuk tercatat pukul ${t} WIB`);
  };

  const handleCheckOut = () => {
    if (!checkedIn || checkedOut) return;
    const t = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    setCheckedOut(true);
    setCheckOutTime(t);
    setLogData((prev) => {
      const copy = [...prev];
      if (copy[0]?.today) copy[0] = { ...copy[0], out: t };
      return copy;
    });
    showToast(`Absen pulang tercatat pukul ${t} WIB`);
  };

  const handleSubmitLeave = () => {
    const typeLabels = { cuti: 'Cuti Tahunan', sakit: 'Sakit', izin: 'Izin Khusus' };
    const newRow = {
      date: leaveStart || '2026-02-25',
      day: 'Selasa',
      in: null,
      out: null,
      status: 'cuti',
      note: typeLabels[leaveType] || 'Cuti Tahunan',
    };
    setLogData((prev) => [newRow, ...prev]);
    setShowModal(false);
    setLeaveType('cuti');
    setLeaveStart('');
    setLeaveEnd('');
    setLeaveReason('');
    showToast('Pengajuan cuti / izin berhasil dikirim!');
  };

  const card = isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200';
  const sub = isDark ? 'text-slate-400' : 'text-slate-500';
  const label = isDark ? 'text-slate-200' : 'text-neutral';
  const inputCls = isDark
    ? 'bg-slate-800/90 border-slate-700 text-white placeholder:text-slate-500'
    : 'bg-slate-50 border-slate-200 text-neutral placeholder:text-slate-400';

  const displayedLog = logData.slice((page - 1) * perPage, page * perPage);

  const statusBadge = (row) => {
    if (row.status === 'hadir') {
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${isDark ? 'bg-emerald-950/50 text-emerald-300' : 'bg-emerald-50 text-emerald-700'}`}>
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
          Tepat Waktu
        </span>
      );
    }
    if (row.status === 'terlambat') {
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${isDark ? 'bg-amber-950/50 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
          Terlambat ({row.lateMin}m)
        </span>
      );
    }
    if (row.status === 'cuti') {
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
          <CalendarDays size={12} />
          {row.note || 'Cuti Tahunan'}
        </span>
      );
    }
    if (row.status === 'libur') {
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
          Hari Libur / Akhir Pekan
        </span>
      );
    }
    return null;
  };

  return (
    <>
      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className={`text-[22px] font-headline font-bold leading-tight ${isDark ? 'text-white' : 'text-neutral'}`}>
          Kehadiran &amp; Cuti
        </h1>
        <p className={`text-sm mt-1 ${sub}`}>
          Catat presensi harian Anda dan pantau rekapitulasi log kehadiran bulanan secara lengkap
        </p>
      </div>

      {/* ══ KARTU 1 — Presensi Harian ══ */}
      <div className={`rounded-2xl border transition-colors duration-300 ${card}`}>
        {/* Header Kartu */}
        <div className={`px-6 py-4 flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? 'bg-blue-950/50' : 'bg-blue-50'}`}>
              <Clock size={18} className={isDark ? 'text-blue-400' : 'text-secondary'} />
            </div>
            <h3 className={`font-headline font-semibold text-[15px] ${isDark ? 'text-white' : 'text-neutral'}`}>
              Presensi Harian
            </h3>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
            <Clock size={12} />
            Shift Reguler: 08:30 - 17:30 WIB
          </span>
        </div>

        {/* Konten Tengah */}
        <div className="px-6 py-8 flex flex-col items-center">
          {/* Jam Digital */}
          <div className={`text-[52px] font-mono font-extrabold tracking-tight leading-none ${isDark ? 'text-white' : 'text-neutral'}`}>
            {timeStr}
            <span className={`text-lg ml-2 font-semibold tracking-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>WIB</span>
          </div>

          {/* Geolocation */}
          <div className="mt-4 flex items-center gap-2">
            <MapPin size={15} className="text-emerald-500" />
            <span className={`text-[13px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Head Office Jakarta (WFO) • <span className="text-emerald-500 font-medium">Geolocation Terverifikasi</span>
            </span>
          </div>

          {/* Tombol simulasi radius */}
          <button
            onClick={() => setInRadius((p) => !p)}
            className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium border transition-colors ${
              inRadius
                ? (isDark ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-400' : 'border-emerald-200 bg-emerald-50 text-emerald-600')
                : (isDark ? 'border-red-800/60 bg-red-950/30 text-red-400' : 'border-red-200 bg-red-50 text-red-600')
            }`}
          >
            {inRadius ? <Wifi size={11} /> : <WifiOff size={11} />}
            {inRadius ? 'Di Dalam Radius Kantor' : 'Di Luar Radius — Tombol Terkunci'}
          </button>

          {/* Tombol Aksi */}
          <div className="flex items-center gap-4 mt-7">
            <button
              onClick={handleCheckIn}
              disabled={checkedIn || !inRadius}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold transition-all shadow-md ${
                checkedIn || !inRadius
                  ? (isDark ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none' : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none')
                  : 'bg-[#10B981] hover:bg-emerald-600 text-white shadow-emerald-500/20'
              }`}
            >
              <LogIn size={18} />
              Absen Masuk
            </button>
            <button
              onClick={handleCheckOut}
              disabled={!checkedIn || checkedOut || !inRadius}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold transition-all shadow-md ${
                !checkedIn || checkedOut || !inRadius
                  ? (isDark ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none' : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none')
                  : 'bg-[#EF4444] hover:bg-red-600 text-white shadow-red-500/20'
              }`}
            >
              <LogOut size={18} />
              Absen Pulang
            </button>
          </div>
        </div>

        {/* Info Bar Bawah */}
        <div className={`mx-6 mb-6 px-5 py-3 rounded-xl flex items-center justify-center gap-2 ${isDark ? 'bg-slate-800/60' : 'bg-slate-50'}`}>
          <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
          <span className={`text-[13px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Terakhir presensi masuk: Hari ini{' '}
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-neutral'}`}>{checkInTime} WIB</span>
            {' '}(
            <span className="text-emerald-500 font-medium">Tepat Waktu</span>
            )
            {checkedOut && checkOutTime && (
              <span> • Pulang: <span className={`font-semibold ${isDark ? 'text-white' : 'text-neutral'}`}>{checkOutTime} WIB</span></span>
            )}
          </span>
        </div>
      </div>

      {/* ══ KARTU 2 — Log Kehadiran Bulanan ══ */}
      <div className={`rounded-2xl border transition-colors duration-300 mt-6 ${card}`}>
        {/* Header */}
        <div className={`px-6 py-5 flex items-start justify-between gap-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <div>
            <h3 className={`font-headline font-semibold text-[15px] ${isDark ? 'text-white' : 'text-neutral'}`}>
              Log Kehadiran Bulanan
            </h3>
            <p className={`text-[12px] mt-1 ${sub}`}>
              Rekapitulasi catatan presensi Anda selama 1 bulan penuh
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Dropdown Bulan */}
            <div className="relative">
              <CalendarDays size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className={`pl-8 pr-4 py-2 rounded-xl text-[13px] font-medium border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                  isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            {/* Tombol Ajukan Cuti */}
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-semibold rounded-xl transition-colors shadow-md shadow-blue-500/20"
            >
              <Plus size={15} />
              Ajukan Cuti / Izin
            </button>
          </div>
        </div>

        {/* Tabel */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className={isDark ? 'bg-slate-800/50' : 'bg-slate-50/80'}>
                <th className={`text-left font-semibold px-6 py-3 ${label}`}>Tanggal</th>
                <th className={`text-left font-semibold px-6 py-3 ${label}`}>Jam Masuk</th>
                <th className={`text-left font-semibold px-6 py-3 ${label}`}>Jam Keluar</th>
                <th className={`text-left font-semibold px-6 py-3 ${label}`}>Status Kehadiran</th>
              </tr>
            </thead>
            <tbody>
              {displayedLog.map((row, i) => (
                <tr
                  key={`${row.date}-${i}`}
                  className={`border-t transition-colors ${isDark ? 'border-slate-800 hover:bg-slate-800/30' : 'border-slate-100 hover:bg-slate-50/60'}`}
                >
                  {/* Tanggal */}
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className={isDark ? 'text-slate-200' : 'text-neutral'}>
                        {fmtDate(row.date)} ({row.day})
                      </span>
                      {row.today && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                          Hari Ini
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Jam Masuk */}
                  <td className="px-6 py-3.5">
                    {row.in ? (
                      <span className={`font-medium ${
                        row.status === 'terlambat'
                          ? (isDark ? 'text-amber-400 font-bold' : 'text-amber-600 font-bold')
                          : (isDark ? 'text-slate-200' : 'text-neutral')
                      }`}>
                        {row.in} WIB
                      </span>
                    ) : (
                      <span className={isDark ? 'text-slate-600' : 'text-slate-300'}>-</span>
                    )}
                  </td>
                  {/* Jam Keluar */}
                  <td className="px-6 py-3.5">
                    {row.out ? (
                      <span className={isDark ? 'text-slate-200' : 'text-neutral'}>{row.out} WIB</span>
                    ) : row.today && checkedIn && !checkedOut ? (
                      <span className={isDark ? 'text-slate-500 italic' : 'text-slate-400 italic'}>17:35 WIB (Estimasi)</span>
                    ) : (
                      <span className={isDark ? 'text-slate-600' : 'text-slate-300'}>-</span>
                    )}
                  </td>
                  {/* Status */}
                  <td className="px-6 py-3.5">{statusBadge(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <div className={`px-6 py-4 flex items-center justify-between border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <span className={`text-[12px] ${sub}`}>
            Menampilkan {displayedLog.length > 0 ? ((page - 1) * perPage + 1) : 0}–{Math.min(page * perPage, logData.length)} dari {logData.length > 20 ? logData.length : 20} hari operasional pada bulan Februari 2026
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                page === 1
                  ? (isDark ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 cursor-not-allowed')
                  : (isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100')
              }`}
            >
              <ChevronLeft size={14} className="inline -mt-0.5" /> Sebelumnya
            </button>
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`w-8 h-8 rounded-lg text-[12px] font-semibold transition-colors ${
                  page === n
                    ? 'bg-[#1E3A8A] text-white shadow-sm'
                    : (isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100')
                }`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                page === totalPages
                  ? (isDark ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 cursor-not-allowed')
                  : (isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100')
              }`}
            >
              Selanjutnya <ChevronRight size={14} className="inline -mt-0.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ══ MODAL — Ajukan Cuti / Izin ══ */}
      {showModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center" onClick={() => setShowModal(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-modal-in" />
          <div
            className={`relative z-10 w-full max-w-lg rounded-2xl border shadow-2xl animate-modal-in ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`px-6 py-5 flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? 'bg-blue-950/50' : 'bg-blue-50'}`}>
                  <FileText size={18} className={isDark ? 'text-blue-400' : 'text-secondary'} />
                </div>
                <div>
                  <h3 className={`font-headline font-semibold text-[15px] ${isDark ? 'text-white' : 'text-neutral'}`}>
                    Ajukan Cuti / Izin
                  </h3>
                  <p className={`text-[11px] mt-0.5 ${sub}`}>Isi formulir pengajuan di bawah ini</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Jenis */}
              <div>
                <label className={`text-[13px] font-semibold block mb-1.5 ${label}`}>Jenis Pengajuan</label>
                <div className="flex gap-2">
                  {[
                    { id: 'cuti', text: 'Cuti Tahunan' },
                    { id: 'sakit', text: 'Sakit' },
                    { id: 'izin', text: 'Izin Khusus' },
                  ].map((opt) => {
                    const sel = leaveType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setLeaveType(opt.id)}
                        className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium border-2 transition-all ${
                          sel
                            ? (isDark ? 'border-blue-500 bg-blue-950/40 text-blue-300' : 'border-blue-500 bg-blue-50 text-blue-700')
                            : (isDark ? 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300')
                        }`}
                      >
                        {opt.text}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tanggal */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`text-[13px] font-semibold block mb-1.5 ${label}`}>Tanggal Mulai</label>
                  <input
                    type="date"
                    value={leaveStart}
                    onChange={(e) => setLeaveStart(e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${inputCls}`}
                  />
                </div>
                <div>
                  <label className={`text-[13px] font-semibold block mb-1.5 ${label}`}>Tanggal Selesai</label>
                  <input
                    type="date"
                    value={leaveEnd}
                    onChange={(e) => setLeaveEnd(e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${inputCls}`}
                  />
                </div>
              </div>

              {/* Alasan */}
              <div>
                <label className={`text-[13px] font-semibold block mb-1.5 ${label}`}>Alasan / Keterangan</label>
                <textarea
                  rows={3}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Tuliskan alasan pengajuan cuti / izin Anda..."
                  className={`w-full px-4 py-2.5 rounded-xl text-sm border resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${inputCls}`}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className={`px-6 py-4 flex items-center justify-end gap-3 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <button
                onClick={() => setShowModal(false)}
                className={`px-5 py-2.5 rounded-xl text-[13px] font-semibold border transition-colors ${isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                Batal
              </button>
              <button
                onClick={handleSubmitLeave}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white text-[13px] font-semibold rounded-xl transition-colors shadow-md shadow-blue-500/20"
              >
                <Send size={14} />
                Kirim Pengajuan
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
            {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span className="text-[13px] font-medium">{toast.msg}</span>
          </div>
        </div>
      )}
    </>
  );
}

