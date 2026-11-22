import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../context/AuthContext';
import { useGeolocation } from './useGeolocation';

const TZ = 'Asia/Jakarta';

/** Tanggal hari ini di WIB, format YYYY-MM-DD. */
export const todayJakarta = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Jam HH:MM (WIB) dari timestamptz. */
export const timeJakarta = (ts) =>
  (ts ? new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts)) : null);

/** Tanggal panjang WIB, mis. "Senin, 24 Februari 2026". */
export const longDateJakarta = (d = new Date()) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);

export const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

/** Error RPC: pesan dari server (sudah Bahasa Indonesia) atau pesan jaringan. */
function rpcMessage(error) {
  if (['P0001', '42501', '22023'].includes(error?.code) && error.message) return error.message;
  if (/fetch|network/i.test(error?.message ?? '')) return 'Tidak dapat terhubung ke server. Periksa koneksi internet, lalu coba lagi.';
  return 'Absen gagal diproses. Coba lagi.';
}

/**
 * Status presensi hari ini untuk karyawan yang login + aksi absen masuk/pulang.
 * phase: 'idle' | 'locating' | 'sending'. Aksi diabaikan selama phase bukan 'idle' (cegah klik ganda).
 * remote: izin WFH/dinas luar yang disetujui untuk hari ini ({ kind, destination, ... }) atau null.
 *
 * preset (opsional, dipakai beranda): data yang sudah dimuat pemanggil, mis. dari my_dashboard(),
 * berbentuk { loading, error, office, shift, today, remote, reload }. Bila ada, hook tidak memuat
 * sendiri dan reload() memanggil preset.reload. Objek preset harus stabil (useMemo).
 */
const fromPreset = (p) => ({
  loading: p.loading, loadError: p.error ?? null, office: p.office, shift: p.shift, today: p.today, remote: p.remote,
});

export function useTodayAttendance(preset = null) {
  const { profile } = useAuth();
  const { getPosition } = useGeolocation();
  const [state, setState] = useState(() => (preset
    ? fromPreset(preset)
    : { loading: true, loadError: null, office: null, shift: null, today: null, remote: null }));
  const [phase, setPhase] = useState('idle');
  const [action, setAction] = useState(null); // 'clock_in' | 'clock_out' saat sedang diproses
  const [error, setError] = useState(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setState((s) => ({ ...s, loading: true, loadError: null }));
    const date = todayJakarta();
    const [office, shift, today, remote] = await Promise.all([
      profile.office_id
        ? supabase.from('offices').select('id, name, radius_m').eq('id', profile.office_id).maybeSingle()
        : { data: null },
      profile.shift_id
        ? supabase.from('shifts').select('id, name, start_time, end_time, late_tolerance_min').eq('id', profile.shift_id).maybeSingle()
        : { data: null },
      supabase.from('attendances')
        .select('id, date, clock_in_at, clock_out_at, clock_in_distance_m, clock_out_distance_m, status, late_minutes, mode')
        .eq('employee_id', profile.id).eq('date', date).maybeSingle(),
      // Izin WFH/dinas disetujui yang mencakup hari ini (urutan sama dengan approved_remote_kind di server).
      supabase.from('requests')
        .select('id, kind, destination, start_date, end_date')
        .eq('employee_id', profile.id).in('kind', ['wfh', 'dinas']).eq('status', 'disetujui')
        .lte('start_date', date).gte('end_date', date)
        .order('reviewed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const loadError = office.error || shift.error || today.error || null;
    // Info izin hanya penanda di UI; gagal dimuat tidak memblokir absen (server tetap memeriksa izin).
    setState({
      loading: false, loadError, office: office.data, shift: shift.data, today: today.data, remote: remote.data ?? null,
    });
  }, [profile]);

  useEffect(() => {
    if (preset) setState(fromPreset(preset));
    else load();
  }, [load, preset]);

  const run = useCallback(async (fn) => {
    if (busy.current) return null;
    busy.current = true;
    setError(null);
    setAction(fn);
    try {
      setPhase('locating');
      let pos;
      try {
        pos = await getPosition();
      } catch (e) {
        setError(e.message);
        return null;
      }
      setPhase('sending');
      const { data, error: err } = await supabase.rpc(fn, { p_lat: pos.lat, p_lng: pos.lng, p_accuracy: pos.accuracy });
      if (err) {
        setError(rpcMessage(err));
        return null;
      }
      setState((s) => ({ ...s, today: data }));
      return data;
    } finally {
      busy.current = false;
      setPhase('idle');
      setAction(null);
    }
  }, [getPosition]);

  const clockIn = useCallback(() => run('clock_in'), [run]);
  const clockOut = useCallback(() => run('clock_out'), [run]);

  const { today, office, shift } = state;
  const checkedIn = !!today?.clock_in_at;
  const checkedOut = !!today?.clock_out_at;
  const configured = !!office && !!shift;
  // Baris tanpa clock_in (cuti/sakit/izin/alpa) menutup absen hari ini.
  const closed = !!today && !checkedIn;

  return {
    ...state,
    reload: preset?.reload ?? load,
    phase,
    action,
    error,
    clearError: () => setError(null),
    clockIn,
    clockOut,
    checkedIn,
    checkedOut,
    configured,
    canClockIn: configured && !today && phase === 'idle',
    canClockOut: configured && checkedIn && !checkedOut && phase === 'idle' && !closed,
  };
}

/** Badge sisi "Masuk": pulang_cepat tetap menampilkan tepat waktu/terlambat dari late_minutes. */
export function clockInBadge(row) {
  if (!row?.clock_in_at) return null;
  if (row.status === 'pulang_cepat') {
    return row.late_minutes > 0
      ? { tone: 'warning', label: `Terlambat ${row.late_minutes} mnt` }
      : { tone: 'success', label: 'Tepat waktu' };
  }
  return attendanceBadge(row);
}

/** Label + tone badge untuk status presensi. */
export function attendanceBadge(row) {
  if (!row) return null;
  switch (row.status) {
    case 'tepat_waktu': return { tone: 'success', label: 'Tepat waktu' };
    case 'terlambat': return { tone: 'warning', label: `Terlambat ${row.late_minutes} mnt` };
    case 'pulang_cepat': return { tone: 'warning', label: 'Pulang cepat' };
    case 'cuti': return { tone: 'accent', label: 'Cuti' };
    case 'sakit': return { tone: 'accent', label: 'Sakit' };
    case 'izin': return { tone: 'accent', label: 'Izin' };
    case 'alpa': return { tone: 'danger', label: 'Alpa' };
    default: return null;
  }
}
