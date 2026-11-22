import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, AlertCircle, CheckCircle2, Lock, BadgeCheck } from 'lucide-react';
import { PageHeader, Card, Badge, Button, Modal, Field, Avatar, Eyebrow, useToast, inputCls, cx } from '../ui';
import { FieldError } from '../LoginPage';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/hr';
import { dateTimeJakarta } from '../../lib/leave';
import {
  REVIEW_STATUS, GRADE_TONE, GRADE_SCALE, reviewStatusKey, parseScore, scoreSummary, contribution,
  formatScore, formatPoints, gradeOf, kpiError, useKpiReview,
} from '../../lib/kpi';

const MAX_NOTE = 1000;
const MAX_ITEM_NOTE = 500;

const toItem = (s) => ({
  id: s.id, name: s.name, description: s.description ?? '', weight: s.weight, target: s.target ?? '',
  score: s.score == null ? '' : formatPoints(s.score), note: s.note ?? '',
});
/** Isi form yang dibandingkan untuk menandai perubahan belum disimpan. */
const snapshot = (note, items) => JSON.stringify({
  note: note.trim(),
  items: items.map((i) => [i.id, parseScore(i.score) ?? i.score.trim(), i.note.trim()]),
});

function validate(note, items) {
  const errors = {};
  if (note.trim().length > MAX_NOTE) errors.note = `Catatan maksimal ${MAX_NOTE} karakter.`;
  items.forEach((i) => {
    if (!i.score.trim()) errors[i.id] = 'Skor wajib diisi.';
    else if (parseScore(i.score) == null) errors[i.id] = 'Skor 0–100, maksimal 2 desimal.';
  });
  return errors;
}

function IndicatorRow({ item, index, error, readOnly, onChange }) {
  const id = (f) => `score-${item.id}-${f}`;
  const value = parseScore(item.score);
  const part = contribution(value, item.weight);
  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="num inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-subtle text-xs font-semibold text-muted">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{item.name}</p>
              {item.description && <p className="mt-0.5 text-[13px] text-muted">{item.description}</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-subtle px-2 py-0.5 text-muted">Bobot <span className="num font-medium text-fg">{item.weight}%</span></span>
                <span className="rounded-md bg-subtle px-2 py-0.5 text-muted">Target <span className="font-medium text-fg">{item.target || '—'}</span></span>
              </div>
            </div>
            <div className="shrink-0 sm:w-36">
              <label htmlFor={id('score')} className="mb-1.5 block text-[13px] font-medium">
                Skor{!readOnly && <span className="text-danger"> *</span>}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={id('score')}
                  value={item.score}
                  inputMode="decimal"
                  maxLength={6}
                  readOnly={readOnly}
                  placeholder="0–100"
                  onChange={(e) => onChange(item.id, 'score', e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))}
                  aria-invalid={!!error || undefined}
                  aria-describedby={id('part')}
                  className={cx(inputCls, 'num w-24 text-right', error && 'border-danger')}
                />
                <span className="text-sm text-faint">/ 100</span>
              </div>
              <p id={id('part')} className="mt-1 text-xs text-faint">
                Kontribusi <span className="num font-medium text-muted">{part == null ? '—' : formatPoints(Math.round(part * 100) / 100)}</span>
              </p>
              <FieldError>{error}</FieldError>
            </div>
          </div>
          <div className="mt-3">
            {readOnly ? (
              item.note && <p className="rounded-lg bg-subtle px-3 py-2 text-[13px] text-muted">{item.note}</p>
            ) : (
              <Field label="Catatan indikator" htmlFor={id('note')} aside={`${item.note.length}/${MAX_ITEM_NOTE}`}>
                <textarea
                  id={id('note')} rows={2} value={item.note} maxLength={MAX_ITEM_NOTE}
                  onChange={(e) => onChange(item.id, 'note', e.target.value)}
                  placeholder="Opsional: dasar penilaian, capaian, atau masukan"
                  className={cx(inputCls, 'h-auto resize-none py-2')}
                />
              </Field>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function ScoreBar({ summary }) {
  const grade = summary.complete ? gradeOf(summary.score) : null;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-5" aria-live="polite">
      <div>
        <Eyebrow>Skor akhir</Eyebrow>
        <p className="font-display text-2xl font-semibold tracking-tight">
          <span className="num">{formatScore(summary.score)}</span>
          <span className="text-sm font-medium text-faint"> / 100</span>
        </p>
      </div>
      <div>
        <Eyebrow>Grade</Eyebrow>
        <p className="mt-1">
          {grade ? <Badge tone={GRADE_TONE[grade]} className="num px-2.5 text-sm">{grade}</Badge> : <span className="text-sm text-faint">—</span>}
        </p>
      </div>
      <p className="hidden text-xs text-muted md:block">
        <span className="num">{summary.filled}/{summary.count}</span> indikator terisi
        {!summary.complete && <><br />Grade muncul setelah semua skor terisi.</>}
      </p>
    </div>
  );
}

export default function KpiReviewForm() {
  const { reviewId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const data = useKpiReview(reviewId);
  const [toast, toastNode] = useToast();
  const [items, setItems] = useState([]);
  const [note, setNote] = useState('');
  const [initial, setInitial] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [loadedFor, setLoadedFor] = useState(null); // reviewId yang form-nya sudah diisi

  const review = data.review;
  const listUrl = location.state?.from ?? '/hr/kpi/penilaian';

  const applyData = (r) => {
    const list = r.scores.map(toItem);
    const n = r.note ?? '';
    setItems(list);
    setNote(n);
    setInitial(snapshot(n, list));
    setErrors({});
  };

  // Isi form sekali per penilaian. Pemuatan ulang (mis. efek ganda StrictMode) tidak boleh
  // menimpa ketikan HR; setelah simpan/finalisasi form diisi ulang secara eksplisit.
  useEffect(() => {
    if (data.loading || !review || loadedFor === reviewId) return;
    applyData(review);
    setLoadedFor(reviewId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.loading, review, reviewId, loadedFor]);

  const parsed = useMemo(() => items.map((i) => ({ weight: i.weight, score: parseScore(i.score) })), [items]);
  const summary = useMemo(() => scoreSummary(parsed), [parsed]);
  const readOnly = !review || review.status === 'final' || review.period?.status !== 'aktif';
  const dirty = !readOnly && initial !== null && snapshot(note, items) !== initial;

  useEffect(() => {
    if (!dirty) return undefined;
    const onBefore = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [dirty]);

  const goBack = () => {
    if (dirty && !window.confirm('Penilaian belum disimpan. Tinggalkan halaman?')) return;
    navigate(listUrl);
  };

  const change = (id, field, value) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
    if (field === 'score') setErrors((e) => (e[id] || e.form ? { ...e, [id]: null, form: null } : e));
  };

  /** Simpan skor ke database. Mengembalikan pesan error atau null. */
  const persist = async () => {
    const { error } = await supabase.rpc('save_kpi_scores', {
      p_review_id: reviewId,
      p_scores: items.map((i) => ({ id: i.id, score: parseScore(i.score), note: i.note.trim() })),
      p_note: note.trim(),
    });
    return error ? kpiError(error, 'Penilaian gagal disimpan. Coba lagi.') : null;
  };

  const refill = async () => {
    const fresh = await data.reload();
    if (fresh?.review && !fresh.error) applyData(fresh.review);
  };

  const checkForm = () => {
    const e = validate(note, items);
    setErrors(e);
    return !Object.values(e).some(Boolean);
  };

  const save = async () => {
    if (busy || !checkForm()) return;
    setBusy(true);
    const msg = await persist();
    if (msg) {
      setErrors({ form: msg });
      setBusy(false);
      return;
    }
    await refill();
    setBusy(false);
    toast('Draft penilaian disimpan.');
  };

  const openFinalize = () => {
    if (busy || !checkForm()) return;
    setConfirmError(null);
    setConfirm(true);
  };

  const finalize = async () => {
    if (busy) return;
    setBusy(true);
    setConfirmError(null);
    // Skor di form selalu disimpan dulu agar yang difinalkan sama dengan yang tampil.
    if (dirty || !review.reviewer_id) {
      const msg = await persist();
      if (msg) {
        setConfirmError(msg);
        setBusy(false);
        return;
      }
    }
    const { data: row, error } = await supabase.rpc('finalize_kpi_review', { p_review_id: reviewId });
    if (error) {
      setConfirmError(kpiError(error, 'Finalisasi gagal. Coba lagi.'));
      await refill();
      setBusy(false);
      return;
    }
    setConfirm(false);
    await refill();
    setBusy(false);
    toast(`Penilaian final: ${formatScore(row.final_score)} (grade ${row.grade}). Hasil kini terlihat oleh karyawan.`);
  };

  const back = (
    <button type="button" onClick={goBack} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg">
      <ArrowLeft size={16} aria-hidden="true" /> Daftar penilaian
    </button>
  );

  if ((data.loading && !review) || (review && loadedFor !== reviewId)) {
    return (
      <>
        {back}
        <Card className="px-6 py-16 text-center text-sm text-muted">
          <Loader2 size={18} className="mr-2 inline animate-spin" aria-hidden="true" />Memuat penilaian…
        </Card>
      </>
    );
  }
  if (!review) {
    return (
      <>
        {back}
        <Card className="px-6 py-16 text-center">
          <p className="text-sm text-danger">
            <AlertCircle size={16} className="mr-1.5 inline" aria-hidden="true" />
            {data.error ? kpiError(data.error, 'Penilaian gagal dimuat.') : 'Penilaian tidak ditemukan.'}
          </p>
        </Card>
      </>
    );
  }

  const statusKey = reviewStatusKey(review);
  const rs = REVIEW_STATUS[statusKey];
  const emp = review.employee;
  const finalGrade = summary.complete ? gradeOf(summary.score) : null;

  return (
    <>
      {back}
      <PageHeader
        title={`Penilaian KPI ${review.period?.name ?? ''}`}
        description={`Tenggat ${formatDate(review.period?.deadline)}`}
        actions={<Badge tone={rs.tone} dot={statusKey !== 'belum'}>{rs.label}</Badge>}
      />

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Avatar name={emp?.full_name ?? ''} src={emp?.photo_url} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{emp?.full_name ?? 'Karyawan'}</p>
          <p className="text-[13px] text-muted">
            <span className="num">{emp?.nip ?? '—'}</span> · {review.position?.name ?? '—'} · {emp?.division?.name ?? '—'}
          </p>
        </div>
        <p className="text-xs text-faint sm:text-right">
          Skala grade: {GRADE_SCALE.map((g) => `${g.grade} ${g.range}`).join(' · ')}
        </p>
      </Card>

      {review.status === 'final' ? (
        <p className="mt-5 flex items-start gap-2 rounded-lg bg-success-soft px-4 py-3 text-[13px] text-success">
          <BadgeCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          Final sejak <span className="num">{dateTimeJakarta(review.finalized_at)}</span> oleh {review.reviewer?.full_name ?? 'HR'}.
          Skor tidak bisa diubah dan hasil terlihat oleh karyawan.
        </p>
      ) : readOnly && (
        <p className="mt-5 flex items-start gap-2 rounded-lg bg-subtle px-4 py-3 text-[13px] text-muted">
          <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          Periode {review.period?.name} sudah tidak aktif. Penilaian ini tidak bisa diubah lagi.
        </p>
      )}

      <h2 className="mt-5 text-[15px] font-semibold">
        Indikator <span className="num font-normal text-faint">{items.length}</span>
      </h2>
      <ol className="mt-3 space-y-3">
        {items.map((item, idx) => (
          <IndicatorRow key={item.id} item={item} index={idx} error={errors[item.id]} readOnly={readOnly} onChange={change} />
        ))}
      </ol>

      <Card className="mt-5 p-5">
        {readOnly ? (
          <>
            <h2 className="text-[15px] font-semibold">Catatan HR</h2>
            <p className={cx('mt-1.5 whitespace-pre-line text-sm', note ? 'text-fg' : 'text-faint')}>{note || 'Tidak ada catatan.'}</p>
          </>
        ) : (
          <Field label="Catatan HR untuk karyawan" htmlFor="review-note" aside={`${note.length}/${MAX_NOTE}`} hint="Terlihat oleh karyawan setelah penilaian final.">
            <textarea
              id="review-note" rows={3} value={note} maxLength={MAX_NOTE}
              onChange={(e) => { setNote(e.target.value); setErrors((x) => ({ ...x, note: null, form: null })); }}
              placeholder="Ringkasan kinerja, kekuatan, dan area yang perlu ditingkatkan"
              className={cx(inputCls, 'h-auto resize-none py-2', errors.note && 'border-danger')}
            />
            <FieldError>{errors.note}</FieldError>
          </Field>
        )}
      </Card>

      {/* Bar bawah: skor akhir & grade dihitung langsung + aksi */}
      <div className="sticky bottom-0 z-10 mt-5 border-t border-line bg-canvas/95 py-3 backdrop-blur">
        {errors.form && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errors.form}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <ScoreBar summary={summary} />
          {!readOnly && (
            <div className="flex shrink-0 items-center justify-end gap-2">
              {dirty && <span className="text-xs text-faint">Belum disimpan</span>}
              <Button variant="secondary" onClick={save} disabled={busy || !dirty} aria-busy={busy || undefined}>
                {busy && !confirm ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                Simpan draft
              </Button>
              <Button onClick={openFinalize} disabled={busy || !summary.complete} title={summary.complete ? undefined : 'Isi skor semua indikator terlebih dahulu'}>
                <CheckCircle2 size={16} aria-hidden="true" /> Finalisasi
              </Button>
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <Modal
          size="sm"
          title="Finalisasi penilaian"
          description={`${emp?.full_name ?? 'Karyawan'} · ${review.period?.name ?? ''}`}
          onClose={busy ? () => {} : () => setConfirm(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>Batal</Button>
              <Button onClick={finalize} disabled={busy} aria-busy={busy || undefined}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
                Finalkan
              </Button>
            </>
          }
        >
          {confirmError && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{confirmError}</p>}
          <div className="flex items-center gap-4 rounded-lg bg-subtle px-4 py-3">
            <div>
              <Eyebrow>Skor akhir</Eyebrow>
              <p className="num font-display text-xl font-semibold">{formatScore(summary.score)}</p>
            </div>
            {finalGrade && <Badge tone={GRADE_TONE[finalGrade]} className="num px-2.5 text-sm">Grade {finalGrade}</Badge>}
          </div>
          <div className="mt-3 space-y-2 text-sm text-muted">
            <p>Setelah final, skor dan catatan tidak bisa diubah.</p>
            <p>Hasil langsung terlihat oleh karyawan di menu Kinerja.</p>
          </div>
        </Modal>
      )}
      {toastNode}
    </>
  );
}
