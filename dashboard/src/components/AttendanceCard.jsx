import React, { useState, useEffect } from 'react';
import { Clock, ChevronRight, Fingerprint } from 'lucide-react';

export default function AttendanceCard({ setActiveMenu, isDark }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const goToKehadiran = () => setActiveMenu('kehadiran');

  return (
    <div className={`rounded-2xl border flex flex-col transition-colors duration-300 ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}>
      {/* Header */}
      <div className={`px-5 py-4 flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-950/50' : 'bg-blue-50'}`}>
            <Clock size={17} className={isDark ? 'text-blue-400' : 'text-secondary'} />
          </div>
          <h3 className={`font-headline font-semibold text-sm ${isDark ? 'text-white' : 'text-neutral'}`}>
            Status &amp; Notifikasi Kehadiran
          </h3>
        </div>

        {/* Badge jam digital */}
        <div className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-blue-50/90 border-blue-100'}`}>
          <span className="w-1.5 h-1.5 bg-tertiary rounded-full animate-pulse" />
          <span className={`text-xs font-mono font-semibold tracking-wide ${isDark ? 'text-blue-100' : 'text-[#1E3A8A]'}`}>
            {timeStr} WIB
          </span>
          <span className={`text-[10px] ml-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>• Head Office Jakarta</span>
        </div>
      </div>

      {/* Konten — 2 kotak notifikasi */}
      <div className="p-5 flex-1 space-y-3">
        {/* Kotak Hijau */}
        <button
          onClick={goToKehadiran}
          className={`w-full text-left p-4 rounded-xl transition-all duration-150 group cursor-pointer border ${
            isDark
              ? 'bg-emerald-950/40 border-emerald-800/60 hover:bg-emerald-950/60 hover:border-emerald-700'
              : 'bg-emerald-50/70 border-emerald-200/80 hover:bg-emerald-50 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-tertiary text-[11px] font-bold rounded-full tracking-wide ${isDark ? 'bg-tertiary/20' : 'bg-tertiary/10'}`}>
              Hari Ini • Shift Pagi
            </span>
            <ChevronRight size={16} className="text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <p className={`text-[13px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Presensi Masuk tercatat pukul{' '}
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-neutral'}`}>08:15 WIB</span>{' '}
            <span className="text-tertiary font-medium">(Tepat Waktu)</span>. Klik di sini untuk melakukan{' '}
            <span className="text-tertiary font-semibold">Presensi Pulang</span> di halaman Kehadiran &amp; Cuti →
          </p>
        </button>

        {/* Kotak Biru */}
        <button
          onClick={goToKehadiran}
          className={`w-full text-left p-4 rounded-xl transition-all duration-150 group cursor-pointer border ${
            isDark
              ? 'bg-blue-950/40 border-blue-800/60 hover:bg-blue-950/60 hover:border-blue-700'
              : 'bg-blue-50/70 border-blue-200/80 hover:bg-blue-50 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full tracking-wide ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-secondary/10 text-secondary'}`}>
              Ringkasan Kehadiran
            </span>
            <ChevronRight size={16} className="text-blue-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <p className={`text-[13px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Rekap bulan berjalan:{' '}
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-neutral'}`}>19 Hadir</span>,{' '}
            <span className={`font-semibold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>1 Terlambat</span>,{' '}
            <span className={`font-semibold ${isDark ? 'text-blue-300' : 'text-secondary'}`}>1 Cuti</span>. Klik untuk melihat
            tabel log kehadiran lengkap →
          </p>
        </button>
      </div>

      {/* Footer */}
      <div className={`px-5 py-3 border-t flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Fingerprint size={13} />
          Sinkronisasi otomatis GPS &amp; Biometrik
        </span>
        <button className={`text-[11px] font-semibold hover:underline ${isDark ? 'text-blue-400' : 'text-secondary'}`}>
          Buka Pengaturan Presensi ↗
        </button>
      </div>
    </div>
  );
}
