import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, TrendingUp, TrendingDown, Minus, ClipboardList, FileX, Hourglass } from 'lucide-react';
import { PageHeader, Card, CardHeader, Badge, Button, Eyebrow, cx } from './ui';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/hr';
import { dateJakarta } from '../lib/payslip';
import {
  GRADE_TONE, GRADE_SCALE, contribution, formatScore, formatPoints, useMyKpiResults,
} from '../lib/kpi';

/** Kunci periode di URL: ?periode=2026-Q1. */
const periodKey = (p) => `${p.year}-Q${p.quarter}`;

function EmptyPanel({ icon: Icon, title, children, action }) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Icon size={28} strokeWidth={1.6} className="text-faint" aria-hidden="true" />
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action}
    </Card>
  );
}

/** Selisih skor dengan periode final sebelumnya. */
function Trend({ current, previous }) {
  if (!previous) return null;
  const diff = Math.round((Number(current.final_score) - Number(previous.final_score)) * 10) / 10;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const tone = diff > 0 ? 'text-success' : diff < 0 ? 'text-danger' : 'text-muted';
  return (
    <p className={cx('mt-1 inline-flex items-center gap-1 text-[13px]', tone)}>
      <Icon size={14} aria-hidden="true" />
      <span className="num">{diff > 0 ? '+' : ''}{formatScore(diff)}</span>
      <span className="text-muted">dibanding {previous.period.name}</span>
    </p>
  );
}

function ResultDetail({ result, previous }) {
  const p = result.period;
  return (
    <Card>
      <CardHeader
        title={`Hasil KPI ${p.name}`}
        description={`${formatDate(p.start_date)} – ${formatDate(p.end_date)} · ${result.position?.name ?? 'Jabatan tidak tercatat'}`}
        action={<Badge tone={GRADE_TONE[result.grade]} className="num">Grade {result.grade}</Badge>}
      />
      <div className="p-5">
        <div className="flex flex-col gap-4 rounded-lg bg-subtle p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>Skor akhir</Eyebrow>
            <p className="mt-1 font-display text-3xl font-semibold tracking-tight">
              <span className="num">{formatScore(result.final_score)}</span>
              <span className="text-base font-medium text-faint"> / 100</span>
            </p>
            <Trend current={result} previous={previous} />
          </div>
          <div className="sm:text-right">
            <p className="text-[13px] text-muted">Difinalkan HR <span className="num">{dateJakarta(result.finalized_at)}</span></p>
            <p className="mt-1 text-xs text-faint">{GRADE_SCALE.map((g) => `${g.grade} ${g.range}`).join(' · ')}</p>
          </div>
        </div>

        <h3 className="mt-6 border-b border-line pb-2 text-xs font-medium text-faint">Skor per indikator</h3>
        <ol className="divide-y divide-line">
          {result.scores.map((s, i) => {
            const part = contribution(s.score, s.weight);
            return (
              <li key={s.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      <span className="num mr-2 text-faint">{i + 1}.</span>{s.name}
                    </p>
                    {s.description && <p className="mt-0.5 text-[13px] text-muted">{s.description}</p>}
                    <p className="mt-1 text-xs text-faint">
                      Target {s.target || '—'} · Bobot <span className="num">{s.weight}%</span> · Kontribusi{' '}
                      <span className="num">{formatPoints(Math.round(part * 100) / 100)}</span>
                    </p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="num font-display text-xl font-semibold">{formatPoints(s.score)}</span>
                    <span className="text-xs text-faint"> / 100</span>
                  </p>
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle"
                  role="img" aria-label={`Skor ${s.name} ${formatPoints(s.score)} dari 100`}
                >
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Number(s.score)}%` }} />
                </div>
                {s.note && <p className="mt-2 rounded-lg bg-subtle px-3 py-2 text-[13px] text-muted">{s.note}</p>}
              </li>
            );
          })}
        </ol>

        <div className="mt-2 flex items-center justify-between rounded-lg border border-line px-4 py-3">
          <span className="text-sm font-semibold">Skor akhir</span>
          <span className="num text-sm font-semibold">{formatScore(result.final_score)} · Grade {result.grade}</span>
        </div>

        <h3 className="mt-6 text-xs font-medium text-faint">Catatan HR</h3>
        <p className={cx('mt-1.5 whitespace-pre-line text-sm', result.note ? 'text-fg' : 'text-faint')}>
          {result.note || 'Tidak ada catatan.'}
        </p>
      </div>
    </Card>
  );
}

export default function PerformancePage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const results = useMyKpiResults(profile.id);
  const { rows, activePeriod } = results;

  const requested = params.get('periode');
  const index = requested ? rows.findIndex((r) => periodKey(r.period) === requested) : 0;
  const current = index >= 0 ? rows[index] : null;
  const previous = index >= 0 ? rows[index + 1] : null;
  const select = (p) => setParams({ periode: periodKey(p) }, { replace: true });
  const waiting = activePeriod && !rows.some((r) => r.period.id === activePeriod.id);

  let panel;
  if (results.loading && rows.length === 0) {
    panel = (
      <Card className="px-6 py-14 text-center text-sm text-muted">
        <Loader2 size={18} className="mr-2 inline animate-spin" aria-hidden="true" />Memuat hasil KPI…
      </Card>
    );
  } else if (results.error) {
    panel = (
      <EmptyPanel icon={FileX} title="Hasil KPI gagal dimuat" action={<Button variant="secondary" className="mt-4" onClick={results.reload}>Coba lagi</Button>} />
    );
  } else if (rows.length === 0) {
    panel = (
      <EmptyPanel icon={ClipboardList} title="Belum ada hasil KPI">
        Hasil penilaian tampil di sini setelah HR memfinalkan penilaian kuartal Anda.
      </EmptyPanel>
    );
  } else if (!current) {
    panel = (
      <EmptyPanel
        icon={FileX}
        title="Hasil tidak tersedia"
        action={<Button variant="secondary" className="mt-4" onClick={() => setParams({}, { replace: true })}>Lihat hasil terbaru</Button>}
      >
        Belum ada hasil final untuk periode tersebut.
      </EmptyPanel>
    );
  } else {
    panel = <ResultDetail result={current} previous={previous} />;
  }

  return (
    <>
      <PageHeader title="Kinerja" description="Hasil evaluasi KPI per kuartal dari HR." />

      {waiting && (
        <p className="mb-5 flex items-start gap-2 rounded-lg bg-accent-soft px-4 py-3 text-[13px] text-accent-text">
          <Hourglass size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          Penilaian {activePeriod.name} sedang berlangsung (tenggat {formatDate(activePeriod.deadline)}).
          Hasilnya tampil di sini setelah HR memfinalkan penilaian Anda.
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        <Card className="self-start">
          <CardHeader title="Riwayat periode" />
          {rows.length === 0 ? (
            <p className="px-5 py-6 text-center text-[13px] text-muted">{results.loading ? 'Memuat…' : 'Belum ada periode.'}</p>
          ) : (
            <ul className="p-2" role="listbox" aria-label="Periode KPI">
              {rows.map((r) => {
                const active = r === current;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => select(r.period)}
                      className={cx(
                        'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                        active ? 'bg-accent-soft' : 'hover:bg-subtle',
                      )}
                    >
                      <div className="min-w-0">
                        <p className={cx('text-sm', active ? 'font-medium text-accent-text' : 'text-fg')}>{r.period.name}</p>
                        <p className="num truncate text-xs text-faint">Skor {formatScore(r.final_score)}</p>
                      </div>
                      <Badge tone={GRADE_TONE[r.grade]} className="num">{r.grade}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {panel}
      </div>
    </>
  );
}
