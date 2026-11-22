import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Card, Button } from './ui';
import WelcomeBanner from './WelcomeBanner';
import AttendanceCard from './AttendanceCard';
import LeaveQuotaCard from './LeaveQuotaCard';
import SalaryCard from './SalaryCard';
import KpiSummaryCard from './KpiSummaryCard';
import BenefitsCard from './BenefitsCard';
import { useAuth } from '../context/AuthContext';
import { useMyDashboard } from '../lib/dashboard';

/* Beranda karyawan: semua kartu diisi dari satu panggilan my_dashboard(). */
export default function EmployeeHome({ setActiveMenu }) {
  const { profile } = useAuth();
  const dash = useMyDashboard();
  const d = dash.data;
  const loading = dash.loading && !d;

  if (dash.error && !d) {
    return (
      <>
        <WelcomeBanner profile={profile} />
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <AlertCircle size={28} strokeWidth={1.6} className="text-danger" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold">Beranda gagal dimuat</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">Periksa koneksi internet, lalu coba lagi.</p>
          <Button variant="secondary" className="mt-5" onClick={dash.reload}>Coba lagi</Button>
        </Card>
      </>
    );
  }

  return (
    <>
      <WelcomeBanner profile={profile} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3" aria-busy={loading || undefined}>
        <AttendanceCard dash={dash} setActiveMenu={setActiveMenu} className="lg:col-span-2" />
        <LeaveQuotaCard
          leave={d?.leave ?? null}
          pendingRequests={d?.pending_requests ?? 0}
          loading={loading}
          setActiveMenu={setActiveMenu}
        />
        <SalaryCard
          payslip={d?.payslip ?? null}
          processing={d?.payslip_processing ?? null}
          loading={loading}
          setActiveMenu={setActiveMenu}
        />
        <KpiSummaryCard
          kpi={d?.kpi ?? null}
          activePeriod={d?.kpi_active_period ?? null}
          loading={loading}
          setActiveMenu={setActiveMenu}
        />
        <BenefitsCard
          benefits={d?.benefits ?? []}
          activeCount={d?.benefits_active ?? 0}
          loading={loading}
          setActiveMenu={setActiveMenu}
        />
      </div>
    </>
  );
}
