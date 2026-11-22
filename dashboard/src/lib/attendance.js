import { supabase } from './supabase';

const TZ = 'Asia/Jakarta';

export const MODE_LABEL = { office: 'Kantor', wfh: 'WFH', dinas: 'Dinas luar' };

/** Kategori log HR (log_status dari hr_attendance_log). */
export const LOG_STATUS = {
  tepat_waktu: { label: 'Tepat waktu', tone: 'success' },
  terlambat: { label: 'Terlambat', tone: 'warning' },
  cuti_sakit: { label: 'Cuti/sakit', tone: 'accent' },
  luar_radius: { label: 'Di luar radius', tone: 'danger' },
  belum_absen: { label: 'Belum absen', tone: 'neutral' },
  alpa: { label: 'Alpa', tone: 'danger' },
};

/** Label status mentah kolom attendances.status. */
export const STATUS_LABEL = {
  tepat_waktu: 'Tepat waktu',
  terlambat: 'Terlambat',
  pulang_cepat: 'Pulang cepat',
  cuti: 'Cuti',
  sakit: 'Sakit',
  izin: 'Izin',
  alpa: 'Alpa',
};

/** YYYY-MM-DD untuk Date di WIB. */
export const isoJakarta = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Tambah n hari ke tanggal YYYY-MM-DD (aritmetika UTC, bebas DST). */
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekdayName = (iso) =>
  new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export const isWeekendIso = (iso) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

/** Panggil RPC set-returning dan ambil semua baris (PostgREST membatasi 1000 per respons). */
export async function rpcAll(fn, args, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.rpc(fn, args).range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...data);
    if (data.length < pageSize) return { data: rows, error: null };
  }
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Unduh CSV (dengan BOM agar Excel membaca UTF-8). */
export function downloadCsv(filename, header, rows) {
  const text = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const mapsUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

/** "1,2 km" / "85 m". */
export function formatDistance(m) {
  if (m === null || m === undefined) return null;
  return m >= 1000 ? `${(m / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km` : `${m} m`;
}
