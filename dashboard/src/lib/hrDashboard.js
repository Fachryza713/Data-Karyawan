import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { formatDate, formatRupiah } from './hr';
import { downloadCsv, formatDistance, MODE_LABEL } from './attendance';
import { periodLabel, RUN_STATUS } from './payroll';

/** Semua angka beranda HR dalam satu panggilan (RPC hr_dashboard, khusus HR). */
export function useHrDashboard() {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.rpc('hr_dashboard');
    setState((s) => ({ loading: false, error, data: error ? s.data : data }));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Selisih hari kalender a - b untuk tanggal "YYYY-MM-DD". */
const daysBetween = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

/** "hari ini" / "besok" / "3 hari lagi" / "lewat 5 hari". */
export function dueText(due, today) {
  const n = daysBetween(due, today);
  if (n === 0) return 'hari ini';
  if (n === 1) return 'besok';
  if (n > 1) return `${n} hari lagi`;
  return `lewat ${-n} hari`;
}

/**
 * Daftar "Perlu tindakan" dari hasil hr_dashboard(), urut tenggat terdekat.
 * Item dengan jumlah 0 tidak dimasukkan. `to` = sub-path di bawah /hr.
 */
export function buildTasks(d) {
  if (!d) return [];
  const today = d.today;
  const tasks = [];

  const pr = d.pending_requests;
  if (pr?.count > 0) {
    const kinds = [pr.leave && `${pr.leave} cuti/izin`, pr.remote && `${pr.remote} WFH/dinas`].filter(Boolean).join(' · ');
    tasks.push({
      key: 'requests',
      label: 'Pengajuan menunggu persetujuan',
      detail: `${kinds} · mulai terdekat ${formatDate(pr.nearest_start)} (${pr.nearest_name})`,
      count: pr.count,
      due: pr.nearest_start,
      tone: pr.nearest_start <= today ? 'danger' : 'warning',
      to: 'kehadiran',
    });
  }

  const out = d.outside_radius ?? [];
  if (out.length > 0) {
    const first = out[0];
    tasks.push({
      key: 'radius',
      label: 'Presensi di luar radius kantor hari ini',
      detail: `${first.name} · ${formatDistance(first.distance_m)} dari ${first.office}`
        + `${first.mode && first.mode !== 'office' ? ` (${MODE_LABEL[first.mode]})` : ''}`
        + `${out.length > 1 ? ` · +${out.length - 1} lainnya` : ''}`,
      count: out.length,
      due: today,
      tone: 'danger',
      to: 'kehadiran',
    });
  }

  const kpi = d.kpi;
  const notFinal = kpi ? kpi.total - kpi.done : 0;
  if (kpi?.status === 'aktif' && notFinal > 0) {
    tasks.push({
      key: 'kpi',
      label: `KPI ${kpi.name} belum dinilai`,
      detail: `Tenggat ${formatDate(kpi.deadline)}${kpi.draft ? ` · ${kpi.draft} masih draft` : ''}`,
      count: notFinal,
      due: kpi.deadline,
      tone: kpi.deadline < today ? 'danger' : 'neutral',
      to: 'kpi/penilaian',
    });
  }

  const run = d.payroll?.run;
  if (run?.status === 'draft') {
    tasks.push({
      key: 'payroll',
      label: `Payroll ${periodLabel(d.payroll.period)} masih draft`,
      detail: `${run.employee_count} slip · ${formatRupiah(run.total_net)} · finalisasi sebelum ${formatDate(d.payroll.period_end)}`,
      count: null,
      due: d.payroll.period_end,
      tone: 'accent',
      to: `penggajian/${d.payroll.period}`,
    });
  }

  return tasks.sort((a, b) => a.due.localeCompare(b.due));
}

/**
 * Unduh CSV rekap bulan berjalan (RPC hr_monthly_report): kehadiran per karyawan + payroll,
 * diakhiri baris total. Mengembalikan error Supabase atau null.
 */
export async function downloadMonthlyReport(period) {
  const { data, error } = await supabase.rpc('hr_monthly_report', { p_period: period });
  if (error) return error;
  const rows = data ?? [];
  const sum = (k) => rows.reduce((n, r) => n + Number(r[k] ?? 0), 0);
  const runStatus = rows.find((r) => r.payroll_status)?.payroll_status;
  const header = ['NIP', 'Nama', 'Divisi', 'Jabatan', 'Hadir', 'Terlambat', 'Cuti', 'Sakit/izin', 'Alpa',
    'Status payroll', 'Gaji bruto', 'Gaji neto'];
  const body = rows.map((r) => [
    r.nip ?? '', r.full_name, r.division_name ?? '', r.position_name ?? '',
    r.hadir, r.terlambat, r.cuti, r.sakit_izin, r.alpa,
    r.payroll_status ? RUN_STATUS[r.payroll_status]?.label ?? r.payroll_status : 'Belum ada',
    r.gross ?? '', r.net ?? '',
  ]);
  const slips = rows.filter((r) => r.net != null).length;
  const total = [
    '', `Total (${rows.length} karyawan, ${slips} slip)`, '', '',
    sum('hadir'), sum('terlambat'), sum('cuti'), sum('sakit_izin'), sum('alpa'),
    runStatus ? RUN_STATUS[runStatus]?.label ?? runStatus : 'Belum ada payroll',
    sum('gross'), sum('net'),
  ];
  downloadCsv(`laporan-bulanan-${period}.csv`, header, [...body, total]);
  return null;
}
