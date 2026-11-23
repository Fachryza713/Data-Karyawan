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

/* ── Penilaian (kpi_reviews + kpi_scores) ── */

/** Status tampilan penilaian. Draft = skor sudah disimpan, belum final. */
export const REVIEW_STATUS = {
  belum: { label: 'Belum dinilai', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'warning' },
  final: { label: 'Final', tone: 'success' },
};

/** reviewer_id kosong berarti HR belum pernah menyimpan skor (lihat migrasi kpi_reviews). */
export const reviewStatusKey = (r) => (r.status === 'final' ? 'final' : r.reviewer_id ? 'draft' : 'belum');

export const GRADE_TONE = { A: 'success', B: 'accent', C: 'warning', D: 'danger' };
export const GRADE_SCALE = [
  { grade: 'A', range: '85–100' },
  { grade: 'B', range: '70–84' },
  { grade: 'C', range: '55–69' },
  { grade: 'D', range: '< 55' },
];

/** Grade dari skor akhir yang sudah dibulatkan (PRD 6.5, sama dengan public._kpi_grade). */
export function gradeOf(score) {
  if (score == null) return null;
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
}

/** Teks input skor ("87,5" atau "87.5") -> angka 0–100 maks. 2 desimal; selain itu null. */
export function parseScore(text) {
  const s = String(text ?? '').trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n <= 100 ? n : null;
}

/**
 * Σ skor × bobot / 100 untuk indikator yang skornya terisi, dibulatkan 1 desimal (setengah ke atas,
 * sama dengan round() Postgres). Dihitung dalam bilangan bulat agar tidak meleset karena float.
 * Hasil: { score, filled, count, complete }; score null jika belum ada yang terisi.
 */
export function scoreSummary(items) {
  let total = 0;
  let filled = 0;
  items.forEach((it) => {
    if (it.score == null) return;
    total += Math.round(Number(it.score) * 100) * it.weight;
    filled += 1;
  });
  return {
    score: filled ? Math.round(total / 1000) / 10 : null,
    filled,
    count: items.length,
    complete: items.length > 0 && filled === items.length,
  };
}

/** Kontribusi satu indikator ke skor akhir (skor × bobot / 100). */
export const contribution = (score, weight) => (score == null ? null : (Number(score) * weight) / 100);

const scoreFmt = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rawFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
/** Skor akhir: selalu 1 desimal ("86,5"). */
export const formatScore = (n) => (n == null ? '—' : scoreFmt.format(Number(n)));
/** Skor indikator / kontribusi: tanpa nol berlebih ("92", "87,5", "26,25"). */
export const formatPoints = (n) => (n == null ? '—' : rawFmt.format(Number(n)));

const byOrder = (a, b) => a.sort_order - b.sort_order;

const REVIEW_LIST_SELECT = `id, status, final_score, grade, reviewer_id, updated_at, finalized_at,
  employee:profiles!kpi_reviews_employee_id_fkey(id, full_name, nip, photo_url, is_active, division:divisions(id, name)),
  position:positions(name),
  reviewer:profiles!kpi_reviews_reviewer_id_fkey(full_name),
  scores:kpi_scores(score, weight)`;

/** Semua penilaian satu periode (khusus HR), urut nama karyawan. */
export function useKpiReviews(periodId) {
  const [state, setState] = useState({ loading: !!periodId, error: null, rows: [] });
  const load = useCallback(async () => {
    if (!periodId) {
      setState({ loading: false, error: null, rows: [] });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.from('kpi_reviews').select(REVIEW_LIST_SELECT).eq('period_id', periodId);
    const rows = (data ?? []).slice()
      .sort((a, b) => (a.employee?.full_name ?? '').localeCompare(b.employee?.full_name ?? '', 'id'));
    setState({ loading: false, error, rows });
  }, [periodId]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Satu penilaian + periode, karyawan, dan skor per indikator (khusus HR). reload() mengembalikan data. */
export function useKpiReview(reviewId) {
  const [state, setState] = useState({ loading: true, error: null, review: null });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.from('kpi_reviews')
      .select(`id, status, final_score, grade, note, reviewer_id, updated_at, finalized_at,
        period:kpi_periods(id, name, status, start_date, end_date, deadline),
        employee:profiles!kpi_reviews_employee_id_fkey(id, full_name, nip, photo_url, division:divisions(name)),
        position:positions(name),
        reviewer:profiles!kpi_reviews_reviewer_id_fkey(full_name),
        scores:kpi_scores(id, name, description, weight, target, score, note, sort_order)`)
      .eq('id', reviewId).maybeSingle();
    const review = data ? { ...data, scores: (data.scores ?? []).slice().sort(byOrder) } : null;
    const next = { loading: false, error, review };
    setState(next);
    return next;
  }, [reviewId]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
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
