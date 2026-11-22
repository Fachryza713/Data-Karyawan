import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Status slip dari sisi karyawan (status run). */
export const SLIP_STATUS = {
  draft: { label: 'Belum terbit', tone: 'neutral' },
  final: { label: 'Terbit', tone: 'accent' },
  paid: { label: 'Ditransfer', tone: 'success' },
};

export const isPublished = (status) => status === 'final' || status === 'paid';

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
/** "22 November 2026" (WIB) dari timestamptz. */
export const dateJakarta = (ts) => (ts ? dateFmt.format(new Date(ts)) : '—');

/** "BCA •••• 8821". */
export const accountText = (bank, last4) => (bank && last4 ? `${bank} •••• ${last4}` : bank || '—');

/**
 * Periode yang punya slip untuk karyawan login (RPC my_payslip_periods), terbaru dulu.
 * Periode draft hanya berisi period + status (tanpa nominal dan id slip).
 */
export function useMyPayslipPeriods() {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.rpc('my_payslip_periods');
    setState({ loading: false, error, rows: data ?? [] });
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/**
 * Detail satu slip dari tabel payslips. RLS hanya mengembalikan slip milik sendiri
 * pada run final/paid; id lain atau run draft menghasilkan null.
 */
export function useMyPayslip(payslipId) {
  const [state, setState] = useState({ loading: !!payslipId, error: null, slip: null });
  useEffect(() => {
    if (!payslipId) {
      setState({ loading: false, error: null, slip: null });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true, error: null, slip: null });
    supabase.from('payslips')
      .select(`id, base_salary, allowance, bonus, gross, bpjs_kes, bpjs_jht, bpjs_jp, pph21, other_deductions, net,
        bank_name, bank_account_last4, run:payroll_runs(period, status, finalized_at, paid_at)`)
      .eq('id', payslipId)
      .maybeSingle()
      .then(({ data, error }) => { if (!cancelled) setState({ loading: false, error, slip: data }); });
    return () => { cancelled = true; };
  }, [payslipId]);
  return state;
}
