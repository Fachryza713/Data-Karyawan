import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import WelcomeBanner from './components/WelcomeBanner';
import AttendanceCard from './components/AttendanceCard';
import LeaveQuotaCard from './components/LeaveQuotaCard';
import SalaryCard from './components/SalaryCard';
import BenefitsCard from './components/BenefitsCard';

export default function App() {
  const [activeMenu, setActiveMenu] = useState('beranda');
  const [isDark, setIsDark] = useState(false);

  return (
    <div className={`flex min-h-screen font-body transition-colors duration-300 ${isDark ? 'bg-[#0B1120] text-slate-100' : 'bg-slate-50 text-[#0F172A]'}`}>
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} isDark={isDark} />

      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <TopHeader isDark={isDark} setIsDark={setIsDark} />

        <main className="flex-1 p-6 overflow-y-auto">
          <WelcomeBanner isDark={isDark} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <AttendanceCard setActiveMenu={setActiveMenu} isDark={isDark} />
            <LeaveQuotaCard setActiveMenu={setActiveMenu} isDark={isDark} />
            <SalaryCard setActiveMenu={setActiveMenu} isDark={isDark} />
            <BenefitsCard isDark={isDark} />
          </div>
        </main>
      </div>
    </div>
  );
}
