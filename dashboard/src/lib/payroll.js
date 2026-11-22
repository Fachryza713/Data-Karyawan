import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { isoJakarta } from './attendance';

export const RUN_STATUS = {
  draft: { label: 'Draft', tone: 'warning' },
  final: { label: 'Final', tone: 'accent' },
  paid: { label: 'Dibayar', tone: 'success' },
};

/** Komponen kontribusi BPJS bagian perusahaan (kunci di payslips.employer_contributions). */
export const EMPLOYER_PARTS = [
  { key: 'bpjs_kes', label: 'BPJS Kesehatan' },
  { key: 'jht', label: 'JHT' },
  { key: 'jp', label: 'Jaminan Pensiun' },
  { key: 'jkk', label: 'JKK' },
  { key: 'jkm', label: 'JKM' },
];

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const periodFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', timeZone: 'UTC' });
const toDate = (period) => new Date(`${period}-01T00:00:00Z`);

/** "2026-11" -> "November 2026". */
export const periodLabel = (period) => (period ? periodFmt.format(toDate(period)) : '—');
/** "2026-11" -> "November". */
export const periodMonth = (period) => (period ? monthFmt.format(toDate(period)) : '');

/** Periode bulan ini (WIB), "YYYY-MM". */
export const currentPeriod = () => isoJakarta().slice(0, 7);

/** Angka dengan pemisah ribuan tanpa "Rp" (untuk input). */
export const groupDigits = (n) => (n === '' || n == null ? '' : Number(n).toLocaleString('id-ID'));
/** "1.500.000" -> 1500000; kosong -> 0. */
export const parseDigits = (s) => Number(String(s).replace(/\D/g, '') || 0);

export const bpjsEmployee = (s) => Number(s.bpjs_kes) + Number(s.bpjs_jht) + Number(s.bpjs_jp);

/** Pesan error RPC yang aman ditampilkan. */
export function payrollError(error, fallback = 'Gagal memproses payroll. Coba lagi.') {
  if (['P0001', 'P0002', '42501', '22023'].includes(error?.code) && error.message) return error.message;
  if (/fetch|network/i.test(error?.message ?? '')) return 'Tidak dapat terhubung ke server. Periksa koneksi internet.';
  return fallback;
}

/** Daftar run beserta total (RPC hr_payroll_runs, khusus HR). */
export function usePayrollRuns() {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.rpc('hr_payroll_runs');
    setState({ loading: false, error, rows: data ?? [] });
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Satu run (berdasarkan periode) + seluruh slipnya, diurutkan nama karyawan. */
export function usePayrollRun(period) {
  const [state, setState] = useState({ loading: true, error: null, run: null, slips: [] });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data: run, error } = await supabase.from('payroll_runs')
      .select('id, period, status, finalized_at, paid_at, created_at')
      .eq('period', period).maybeSingle();
    if (error || !run) {
      setState({ loading: false, error, run: null, slips: [] });
      return;
    }
    const { data: slips, error: slipErr } = await supabase.from('payslips')
      .select(`id, employee_id, base_salary, allowance, bonus, gross, bpjs_kes, bpjs_jht, bpjs_jp, pph21,
        other_deductions, net, employer_contributions, note, updated_at,
        employee:profiles!payslips_employee_id_fkey(full_name, nip, photo_url, division:divisions(name))`)
      .eq('run_id', run.id);
    const sorted = (slips ?? []).slice()
      .sort((a, b) => (a.employee?.full_name ?? '').localeCompare(b.employee?.full_name ?? '', 'id'));
    setState({ loading: false, error: slipErr, run, slips: sorted });
  }, [period]);

  useEffect(() => { load(); }, [load]);

  /**
   * Ganti satu slip setelah update_payslip_manual (tanpa memuat ulang semuanya).
   * Respons yang lebih lama dari data yang sudah tampil diabaikan (dua simpanan beruntun).
   */
  const replaceSlip = useCallback((row) => {
    setState((s) => ({
      ...s,
      slips: s.slips.map((x) => (
        x.id === row.id && !(Date.parse(row.updated_at) < Date.parse(x.updated_at)) ? { ...x, ...row } : x
      )),
    }));
  }, []);
  const setRun = useCallback((run) => setState((s) => ({ ...s, run: { ...s.run, ...run } })), []);

  return { ...state, reload: load, replaceSlip, setRun };
}

/** Jumlahkan kolom slip + kontribusi perusahaan. */
export function sumSlips(slips) {
  const t = {
    base_salary: 0, allowance: 0, bonus: 0, gross: 0, bpjs_kes: 0, bpjs_jht: 0, bpjs_jp: 0,
    bpjs: 0, pph21: 0, other_deductions: 0, net: 0, employer: { total: 0 },
  };
  EMPLOYER_PARTS.forEach((p) => { t.employer[p.key] = 0; });
  slips.forEach((s) => {
    ['base_salary', 'allowance', 'bonus', 'gross', 'bpjs_kes', 'bpjs_jht', 'bpjs_jp', 'pph21', 'other_deductions', 'net']
      .forEach((k) => { t[k] += Number(s[k] ?? 0); });
    t.bpjs += bpjsEmployee(s);
    const ec = s.employer_contributions ?? {};
    EMPLOYER_PARTS.forEach((p) => { t.employer[p.key] += Number(ec[p.key] ?? 0); });
    t.employer.total += Number(ec.total ?? 0);
  });
  return t;
}
