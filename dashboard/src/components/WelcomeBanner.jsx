import React from 'react';
import { ShieldCheck } from 'lucide-react';

export default function WelcomeBanner({ isDark }) {
  return (
    <div className={`rounded-2xl border p-6 flex items-center justify-between gap-6 transition-colors duration-300 ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}>
      {/* Kiri */}
      <div>
        <h2 className={`text-[22px] font-headline font-bold leading-tight ${isDark ? 'text-white' : 'text-neutral'}`}>
          👋 Selamat Pagi, Raditya Pratama
        </h2>
        <p className={`text-sm mt-1.5 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Senin, 24 Februari 2026 • Semangat memulai minggu kerja Anda dengan produktif dan terencana.
        </p>
      </div>

      {/* Kanan — Badge ID */}
      <div className={`flex-shrink-0 flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-colors duration-300 ${isDark ? 'bg-blue-950/40 border-blue-800/60' : 'bg-blue-50 border-blue-200'}`}>
        <ShieldCheck size={18} className={isDark ? 'text-blue-400' : 'text-secondary'} strokeWidth={2} />
        <span className={`text-sm font-semibold whitespace-nowrap ${isDark ? 'text-blue-300' : 'text-primary'}`}>
          ID Karyawan: BRT-2024-089
        </span>
      </div>
    </div>
  );
}
