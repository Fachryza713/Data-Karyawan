import React from 'react';
import { CalendarDays } from 'lucide-react';

export default function LeaveQuotaCard({ setActiveMenu, isDark }) {
  const total = 12;
  const used = 4;
  const remaining = total - used;
  const pct = ((used / total) * 100).toFixed(1);

  return (
    <div className={`rounded-2xl border flex flex-col transition-colors duration-300 ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}>
      {/* Header */}
      <div className={`px-5 py-4 flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-950/50' : 'bg-blue-50'}`}>
            <CalendarDays size={17} className={isDark ? 'text-blue-400' : 'text-secondary'} />
          </div>
          <h3 className={`font-headline font-semibold text-sm ${isDark ? 'text-white' : 'text-neutral'}`}>Kuota Cuti Tahunan</h3>
        </div>
        <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-full ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
          Periode 2026
        </span>
      </div>

      {/* Konten */}
      <div className="p-5 flex-1">
        {/* Angka besar */}
        <div className="flex items-end justify-between mb-5">
          <div>
            <p className="text-[11px] text-slate-400 font-medium mb-1 uppercase tracking-wider">Sisa Saldo Cuti</p>
            <p className={`text-3xl font-headline font-extrabold leading-none ${isDark ? 'text-blue-400' : 'text-primary'}`}>
              {remaining}{' '}
              <span className={`text-base font-semibold ${isDark ? 'text-blue-400/70' : 'text-primary/70'}`}>Hari</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-400 font-medium mb-1 uppercase tracking-wider">Total Plafon</p>
            <p className={`text-lg font-headline font-bold leading-none ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>
              {total} Hari <span className="text-sm font-medium text-slate-400">/ Tahun</span>
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className={`w-full h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
            <div
              className="h-full bg-gradient-to-r from-secondary to-blue-400 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
            Terpakai {used} dari {total} hari ({pct}%)
          </p>
        </div>

        {/* Kotak info status */}
        <div className={`px-4 py-3 rounded-xl border flex items-center gap-2 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
          <span className="w-2 h-2 bg-tertiary rounded-full flex-shrink-0" />
          <span className={`text-[13px] font-semibold ${isDark ? 'text-slate-100' : 'text-neutral'}`}>Status Aktif</span>
          <span className="text-[13px] text-slate-400">• Berlaku s/d 31 Des 2026</span>
        </div>
      </div>

      {/* Footer */}
      <div className={`px-5 py-3 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
        <button
          onClick={() => setActiveMenu('kehadiran')}
          className={`text-[13px] font-semibold hover:underline transition-colors ${isDark ? 'text-blue-400' : 'text-secondary'}`}
        >
          Ajukan Permohonan Cuti Baru →
        </button>
      </div>
    </div>
  );
}
