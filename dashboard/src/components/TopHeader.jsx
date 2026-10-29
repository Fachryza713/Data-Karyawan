import React from 'react';
import { Search, Calendar, Bell, Sun, Moon } from 'lucide-react';

export default function TopHeader({ isDark, setIsDark }) {
  return (
    <header className={`px-6 py-3.5 flex items-center justify-between gap-6 transition-colors duration-300 border-b ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}>
      {/* Kiri — Pencarian */}
      <div className="relative w-full max-w-[420px]">
        <Search
          size={17}
          className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
        />
        <input
          type="text"
          placeholder="Cari kebijakan, formulir cuti, berkas..."
          className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all ${
            isDark
              ? 'bg-slate-800 border border-slate-700 text-slate-200 placeholder:text-slate-500'
              : 'bg-slate-50 border border-slate-200 text-slate-700 placeholder:text-slate-400'
          }`}
        />
      </div>

      {/* Kanan — Ikon & Profil */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Toggle Tema */}
        <button
          onClick={() => setIsDark((prev) => !prev)}
          className={`p-2 rounded-lg transition-colors duration-200 ${isDark ? 'hover:bg-slate-800 text-blue-300' : 'hover:bg-slate-100 text-amber-500'}`}
          title={isDark ? 'Beralih ke Tema Terang' : 'Beralih ke Tema Gelap'}
        >
          {isDark ? (
            <Moon size={20} strokeWidth={1.7} />
          ) : (
            <Sun size={20} strokeWidth={1.7} />
          )}
        </button>

        {/* Kalender */}
        <button className={`p-2 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-300' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}>
          <Calendar size={20} strokeWidth={1.7} />
        </button>

        {/* Notifikasi */}
        <button className={`relative p-2 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-300' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}>
          <Bell size={20} strokeWidth={1.7} />
          <span className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ${isDark ? 'ring-[#0F172A]' : 'ring-white'}`} />
        </button>

        {/* Pemisah vertikal */}
        <div className={`w-px h-9 mx-1 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />

        {/* Profil */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end">
              <p className={`text-sm font-semibold leading-tight ${isDark ? 'text-white' : 'text-neutral'}`}>
                Raditya Pratama
              </p>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] text-tertiary font-semibold ${isDark ? 'bg-emerald-950/50' : 'bg-emerald-50'}`}>
                <span className="w-1.5 h-1.5 bg-tertiary rounded-full animate-pulse" />
                Di Kantor
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Divisi: Teknologi Informasi | Jabatan: Frontend Developer
            </p>
          </div>
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center text-white font-headline font-bold text-sm shadow-md shadow-secondary/20 ring-2 ${isDark ? 'ring-slate-800' : 'ring-white'}`}>
            RP
          </div>
        </div>
      </div>
    </header>
  );
}
