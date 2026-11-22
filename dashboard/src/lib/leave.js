import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../context/AuthContext';
import { isoJakarta } from './attendance';

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

export const REQUEST_STATUS = {
  menunggu: { label: 'Menunggu', tone: 'warning' },
  disetujui: { label: 'Disetujui', tone: 'success' },
  ditolak: { label: 'Ditolak', tone: 'danger' },
  dibatalkan: { label: 'Dibatalkan', tone: 'neutral' },
};

export const KIND_LABEL = { leave: 'Cuti', wfh: 'WFH', dinas: 'Dinas luar' };

export const currentYear = () => Number(isoJakarta().slice(0, 4));

const dateTimeFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
});
/** "22 Nov 2026 09.12" (WIB) dari timestamptz. */
export const dateTimeJakarta = (ts) => (ts ? dateTimeFmt.format(new Date(ts)) : '—');

/** Pesan error RPC yang aman ditampilkan (pesan server sudah Bahasa Indonesia). */
export function rpcMessage(error, fallback = 'Gagal memproses. Coba lagi.') {
  if (['P0001', 'P0002', '42501', '22023'].includes(error?.code) && error.message) return error.message;
  if (/fetch|network/i.test(error?.message ?? '')) return 'Tidak dapat terhubung ke server. Periksa koneksi internet.';
  return fallback;
}

export function useLeaveTypes() {
  const [types, setTypes] = useState([]);
  useEffect(() => {
    supabase.from('leave_types')
      .select('id, code, name, annual_quota, deducts_quota, requires_attachment_after_days')
      .order('name')
      .then(({ data }) => setTypes(data ?? []));
  }, []);
  return types;
}

/**
 * Saldo cuti tahunan tahun berjalan: quota, used, pending (menunggu), available.
 * Pending = hari kerja pengajuan cuti tahunan yang masih menunggu (ikut memesan kuota di server).
 */
export function useLeaveBalance(year = currentYear()) {
  const { profile } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, balance: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const [bal, pend] = await Promise.all([
      supabase.from('leave_balances').select('quota, used').eq('employee_id', profile.id).eq('year', year).maybeSingle(),
      supabase.from('requests')
        .select('working_days, leave_type:leave_types!inner(code)')
        .eq('employee_id', profile.id).eq('status', 'menunggu').eq('leave_type.code', 'tahunan')
        .gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`),
    ]);
    const error = bal.error || pend.error;
    if (error || !bal.data) {
      setState({ loading: false, error, balance: null });
      return;
    }
    const pending = (pend.data ?? []).reduce((n, r) => n + r.working_days, 0);
    const { quota, used } = bal.data;
    setState({
      loading: false,
      error: null,
      balance: { year, quota, used, pending, remaining: quota - used, available: Math.max(quota - used - pending, 0) },
    });
  }, [profile.id, year]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function useMyRequests() {
  const { profile } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.from('requests')
      .select('id, kind, start_date, end_date, working_days, reason, destination, attachment_path, status, review_note, reviewed_at, created_at, leave_type:leave_types(code, name)')
      .eq('employee_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setState({ loading: false, error, rows: data ?? [] });
  }, [profile.id]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/**
 * Jumlah pengajuan menunggu yang bisa diproses HR yang login (badge sidebar).
 * Pengajuan milik sendiri tidak dihitung karena review_request menolaknya.
 */
export function usePendingRequestCount() {
  const { profile } = useAuth();
  const [count, setCount] = useState(null);
  const load = useCallback(async () => {
    const { count: n, error } = await supabase.from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'menunggu')
      .neq('employee_id', profile.id);
    if (!error) setCount(n ?? 0);
  }, [profile.id]);
  useEffect(() => { load(); }, [load]);
  return { count, reload: load };
}

/** URL sementara (5 menit) untuk membuka lampiran privat. */
export async function attachmentUrl(path) {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}
