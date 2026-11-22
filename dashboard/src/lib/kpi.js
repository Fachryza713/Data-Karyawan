import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export const PERIOD_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  aktif: { label: 'Aktif', tone: 'success' },
  selesai: { label: 'Selesai', tone: 'accent' },
};

/** Status template satu baris hr_kpi_positions: belum ada / valid / bobot belum 100. */
export function templateStatus(row) {
  if (!row.template_id || row.indicator_count === 0) return { key: 'none', label: 'Belum ada', tone: 'neutral' };
  if (row.is_valid) return { key: 'valid', label: 'Valid', tone: 'success' };
  return { key: 'invalid', label: 'Bobot belum 100', tone: 'warning' };
}

/** Jabatan yang punya karyawan aktif tetapi template-nya belum valid (penghalang aktivasi periode). */
export const missingTemplates = (positions) => positions.filter((p) => p.active_employees > 0 && !p.is_valid);

/** Rentang tanggal kuartal, "YYYY-MM-DD". */
export function quarterRange(year, quarter) {
  const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const end = new Date(Date.UTC(year, quarter * 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** Pesan error RPC yang aman ditampilkan. */
export function kpiError(error, fallback = 'Gagal memproses. Coba lagi.') {
  if (['P0001', 'P0002', '42501', '22023'].includes(error?.code) && error.message) return error.message;
  if (/fetch|network/i.test(error?.message ?? '')) return 'Tidak dapat terhubung ke server. Periksa koneksi internet.';
  return fallback;
}

/** Semua jabatan + jumlah karyawan aktif + status template (RPC hr_kpi_positions, khusus HR). */
export function useKpiPositions() {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.rpc('hr_kpi_positions');
    setState({ loading: false, error, rows: data ?? [] });
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Jabatan + template aktifnya + indikator (urut sort_order). reload() mengembalikan data yang dimuat. */
export function useKpiTemplate(positionId) {
  const [state, setState] = useState({ loading: true, error: null, position: null, template: null, indicators: [] });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const [pos, tpl] = await Promise.all([
      supabase.from('positions').select('id, name, division:divisions(name)').eq('id', positionId).maybeSingle(),
      supabase.from('kpi_templates')
        .select('id, name, updated_at, indicators:kpi_indicators(id, name, description, weight, target, sort_order)')
        .eq('position_id', positionId).eq('is_active', true).maybeSingle(),
    ]);
    const error = pos.error || tpl.error;
    const indicators = (tpl.data?.indicators ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    const next = { loading: false, error, position: pos.data, template: tpl.data, indicators };
    setState(next);
    return next;
  }, [positionId]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Indikator template aktif sebuah jabatan (untuk "Salin dari jabatan lain"). */
export async function fetchTemplateIndicators(positionId) {
  const { data, error } = await supabase.from('kpi_templates')
    .select('indicators:kpi_indicators(name, description, weight, target, sort_order)')
    .eq('position_id', positionId).eq('is_active', true).maybeSingle();
  if (error) return { error, rows: [] };
  return { error: null, rows: (data?.indicators ?? []).slice().sort((a, b) => a.sort_order - b.sort_order) };
}

/** Semua periode KPI, terbaru dulu. */
export function useKpiPeriods() {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.from('kpi_periods')
      .select('id, name, year, quarter, start_date, end_date, deadline, status, activated_at, closed_at')
      .order('start_date', { ascending: false });
    setState({ loading: false, error, rows: data ?? [] });
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}
