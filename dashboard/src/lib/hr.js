import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export const NIP_RE = /^BRT-\d{4}-\d{4}$/;
export const PAGE_SIZE = 25;

export const GENDER_OPTIONS = [
  { value: 'laki_laki', label: 'Laki-laki' },
  { value: 'perempuan', label: 'Perempuan' },
];
export const EMPLOYMENT_OPTIONS = [
  { value: 'tetap', label: 'Tetap' },
  { value: 'kontrak', label: 'Kontrak' },
];
export const labelOf = (options, value) => options.find((o) => o.value === value)?.label ?? '—';

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
export const formatRupiah = (n) => (n == null || n === '' ? '—' : rupiah.format(Number(n)));

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
export const formatDate = (d) => (d ? dateFmt.format(new Date(`${String(d).slice(0, 10)}T00:00:00`)) : '—');

/** Tanggal hari ini (YYYY-MM-DD) di zona Asia/Jakarta. */
export const todayWIB = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

/** Hanya digit, maksimal n karakter. */
export const digitsOnly = (v, n) => v.replace(/\D/g, '').slice(0, n);

/** Hapus karakter yang punya arti khusus di filter PostgREST `or(...)`. */
export const sanitizeSearch = (q) => q.replace(/[,()*%\\]/g, ' ').trim();

/**
 * Panggil Edge Function HR. Melempar Error dengan .code dan .field (untuk ditempel ke input form).
 */
export async function invokeHrFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data;

  let info = null;
  try {
    info = (await error.context?.json?.())?.error ?? null;
  } catch { /* respons bukan JSON */ }
  const err = new Error(info?.message ?? 'Tidak dapat terhubung ke server. Coba lagi.');
  err.code = info?.code ?? 'network';
  err.field = info?.field ?? null;
  throw err;
}

/** Master data untuk form & filter: divisi, jabatan, kantor, shift. */
export function useMasterData() {
  const [state, setState] = useState({ loading: true, error: null, divisions: [], positions: [], offices: [], shifts: [] });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const [d, p, o, s] = await Promise.all([
      supabase.from('divisions').select('id, name').order('name'),
      supabase.from('positions').select('id, name, division_id').order('name'),
      supabase.from('offices').select('id, name').order('name'),
      supabase.from('shifts').select('id, name, start_time, end_time').order('name'),
    ]);
    const error = d.error || p.error || o.error || s.error;
    setState({
      loading: false,
      error,
      divisions: d.data ?? [],
      positions: p.data ?? [],
      offices: o.data ?? [],
      shifts: s.data ?? [],
    });
  }, []);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Saran NIP berikutnya untuk tahun tertentu: BRT-YYYY-(max+1). */
export async function suggestNip(year) {
  const { data, error } = await supabase
    .from('profiles')
    .select('nip')
    .like('nip', `BRT-${year}-%`)
    .order('nip', { ascending: false })
    .limit(1);
  if (error) throw error;
  const last = data?.[0]?.nip ? Number(data[0].nip.slice(-4)) : 0;
  return `BRT-${year}-${String(last + 1).padStart(4, '0')}`;
}

/** Cek NIP/email sudah dipakai (selain karyawan excludeId). */
export async function checkUnique({ nip, email, excludeId }) {
  const filters = [];
  if (nip) filters.push(`nip.eq.${nip}`);
  if (email) filters.push(`email.eq.${email}`);
  if (!filters.length) return {};
  let q = supabase.from('profiles').select('id, nip, email').or(filters.join(','));
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q;
  if (error) throw error;
  return {
    nip: nip && data.some((r) => r.nip === nip) ? 'NIP sudah dipakai karyawan lain.' : null,
    email: email && data.some((r) => r.email === email) ? 'Email sudah terdaftar.' : null,
  };
}
