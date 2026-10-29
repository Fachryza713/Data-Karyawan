import React from 'react';
import { FileText, Lock } from 'lucide-react';

export default function SalaryCard({ setActiveMenu, isDark }) {
  return (
    <div className={`rounded-2xl border flex flex-col transition-colors duration-300 ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}>
      {/* Header */}
      <div className={`px-5 py-4 flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-950/50' : 'bg-blue-50'}`}>
            <FileText size={17} className={isDark ? 'text-blue-400' : 'text-secondary'} />
          </div>
          <h3 className={`font-headline font-semibold text-sm ${isDark ? 'text-white' : 'text-neutral'}`}>Informasi Slip Gaji</h3>
        </div>
        <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-full ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
          Informasi Penggajian
        </span>
      </div>

      {/* Konten */}
      <div className="p-5 flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 ring-4 ${isDark ? 'bg-blue-950/50 ring-blue-950/30' : 'bg-blue-50 ring-blue-50/50'}`}>
            <FileText size={24} className={isDark ? 'text-blue-400' : 'text-secondary'} />
          </div>

          <span className={`inline-block px-3 py-1 text-[11px] font-semibold rounded-full mb-3 ${isDark ? 'bg-blue-950/50 text-blue-300' : 'bg-blue-50 text-secondary'}`}>
            Periode Februari 2026
          </span>

          <h4 className={`font-headline font-bold text-base mb-2 leading-snug ${isDark ? 'text-white' : 'text-neutral'}`}>
            Slip Gaji Bulan Ini Belum Diterbitkan
          </h4>

          <p className="text-[13px] text-slate-400 leading-relaxed mb-5">
            Penggajian reguler dijadwalkan terbit pada hari kerja terakhir setiap akhir bulan oleh Tim Finance.
          </p>

          <button
            onClick={() => setActiveMenu('gaji')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary hover:bg-blue-700 text-white text-[13px] font-semibold rounded-xl transition-colors shadow-md shadow-secondary/20"
          >
            Klik untuk memeriksa riwayat di halaman Gaji &amp; Manfaat →
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className={`px-5 py-3 border-t flex items-center gap-1.5 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
        <Lock size={13} className="text-slate-400" />
        <span className="text-[11px] text-slate-400 font-medium">Enkripsi privasi data payroll tingkat perusahaan</span>
      </div>
    </div>
  );
}
