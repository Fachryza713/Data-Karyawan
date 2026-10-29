import React from 'react';
import { Home, User, Clock, Wallet, HelpCircle, LogOut, Flower2 } from 'lucide-react';

const menuItems = [
  { id: 'beranda', label: 'Beranda', icon: Home },
  { id: 'profil', label: 'Profil & Identitas', icon: User },
  { id: 'kehadiran', label: 'Kehadiran & Cuti', icon: Clock },
  { id: 'gaji', label: 'Gaji & Manfaat', icon: Wallet },
];

export default function Sidebar({ activeMenu, setActiveMenu, isDark }) {
  return (
    <aside className={`flex flex-col justify-between h-screen sticky top-0 w-[272px] min-w-[272px] border-r transition-colors duration-300 ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}>
      {/* ── Bagian Atas ── */}
      <div>
        {/* Logo */}
        <div className="px-5 pt-6 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
            <Flower2 size={22} className="text-white" />
          </div>
          <div>
            <h1 className={`font-headline font-bold text-[15px] leading-tight ${isDark ? 'text-white' : 'text-neutral'}`}>
              Blue Rose Tech
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Portal Karyawan Mandiri</p>
          </div>
        </div>

        {/* Navigasi */}
        <nav className="px-3 mt-1 space-y-0.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeMenu === item.id;

            let btnClass;
            if (isActive) {
              btnClass = isDark
                ? 'bg-blue-950/50 text-blue-300 font-semibold shadow-sm'
                : 'bg-[#EFF6FF] text-primary font-semibold shadow-sm';
            } else {
              btnClass = isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700';
            }

            return (
              <button
                key={item.id}
                onClick={() => setActiveMenu(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 ${btnClass}`}
              >
                <Icon size={19} strokeWidth={isActive ? 2.2 : 1.8} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Bagian Bawah ── */}
      <div className={`mt-auto border-t p-3 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
        <button className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
          <HelpCircle size={19} strokeWidth={1.8} />
          Bantuan &amp; Dukungan
        </button>
        <button className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 ${isDark ? 'text-red-400 hover:bg-red-950/30' : 'text-red-500 hover:bg-red-50'}`}>
          <LogOut size={19} strokeWidth={1.8} />
          Keluar
        </button>
      </div>
    </aside>
  );
}
