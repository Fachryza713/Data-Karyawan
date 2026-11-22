import React, { useMemo, useState } from 'react';
import { Download, Plus, ChevronRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { PageHeader, Card, CardHeader, Button, Badge, Eyebrow, Skeleton, useToast, cx } from '../ui';
import { formatDate, formatRupiah } from '../../lib/hr';
import { RUN_STATUS, periodMonth, periodLabel, currentPeriod } from '../../lib/payroll';
import { formatScore, gradeOf } from '../../lib/kpi';
import { rpcMessage } from '../../lib/leave';
import { longDateJakarta } from '../../lib/useTodayAttendance';
import { useHrDashboard, buildTasks, dueText, downloadMonthlyReport } from '../../lib/hrDashboard';

/* Kategori kehadiran hari ini (kunci = kolom hr_attendance_summary). */
const SPLIT = [
  { key: 'tepat_waktu', label: 'Tepat waktu', color: 'bg-success' },
  { key: 'terlambat', label: 'Terlambat', color: 'bg-warning' },
  { key: 'luar_radius', label: 'WFH / dinas luar', color: 'bg-accent' },
  { key: 'cuti_sakit', label: 'Cuti / izin / sakit', color: 'bg-faint' },
  { key: 'alpa', label: 'Alpa', color: 'bg-danger' },
  { key: 'belum_absen', label: 'Belum absen', color: 'bg-line-strong' },
];
const RUN_STEPS = ['draft', 'final', 'paid'];

/** Karyawan yang sudah absen masuk hari ini (tepat waktu, terlambat, WFH/dinas). */
const presentCount = (a) => (a ? a.tepat_waktu + a.terlambat + a.luar_radius : 0);

function Stat({ label, value, unit, note, onClick, loading, extra }) {
  return (
    <button type="button" onClick={onClick} className="bg-surface p-5 text-left transition-colors hover:bg-subtle">
      <Eyebrow>{label}</Eyebrow>
      {loading ? (
        <>
          <Skeleton className="mt-2 h-7 w-20" />
          <Skeleton className="mt-2 h-4 w-32" />
        </>
      ) : (
        <>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight">
            <span className="num">{value}</span>
            {unit && <span className="text-sm font-medium text-faint"> {unit}</span>}
          </p>
          <p className="mt-1 text-[13px] text-muted">{note}</p>
          {extra}
        </>
      )}
    </button>
  );
}

/** Status payroll bulan berjalan + langkah Draft → Final → Dibayar. */
function PayrollStat({ payroll, loading, go }) {
  const period = payroll?.period ?? currentPeriod();
  const run = payroll?.run;
  if (loading || !run) {
    return (
      <Stat
        label={`Payroll ${periodMonth(period)}`}
        value="Belum dibuat"
        note={`${payroll?.eligible ?? 0} karyawan siap dihitung`}
        loading={loading}
        onClick={() => go('penggajian')}
      />
    );
  }
  const step = RUN_STEPS.indexOf(run.status);
  return (
    <Stat
      label={`Payroll ${periodMonth(period)}`}
      value={RUN_STATUS[run.status].label}
      note={`${formatRupiah(run.total_net)} · ${run.employee_count} dari ${payroll.eligible} karyawan`}
      onClick={() => go(`penggajian/${period}`)}
      extra={(
        <div className="mt-2 flex gap-1" role="img" aria-label={`Tahap ${step + 1} dari 3: ${RUN_STATUS[run.status].label}`}>
          {RUN_STEPS.map((s, i) => (
            <span key={s} className={cx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-accent' : 'bg-subtle')} />
          ))}
        </div>
      )}
    />
  );
}

function TaskList({ tasks, today, loading, go }) {
  if (loading) {
    return (
      <ul className="divide-y divide-line" aria-label="Memuat daftar tindakan">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-4 px-5 py-3.5">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3.5 w-72 max-w-full" />
            </div>
            <Skeleton className="h-5 w-8" />
          </li>
        ))}
      </ul>
    );
  }
  if (tasks.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted">
        <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
        Tidak ada yang perlu ditindaklanjuti.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {tasks.map((task) => {
        const overdue = task.due < today;
        return (
          <li key={task.key}>
            <button
              type="button"
              onClick={() => go(task.to)}
              className="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-subtle"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{task.label}</p>
                <p className="text-[13px] text-muted">{task.detail}</p>
              </div>
              <span className={cx('hidden whitespace-nowrap text-xs sm:block', overdue ? 'font-medium text-danger' : 'text-faint')}>
                {dueText(task.due, today)}
              </span>
              {task.count != null && <Badge tone={task.tone} className="num">{task.count}</Badge>}
              <ChevronRight size={16} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function AttendanceSplit({ att, isWorkday, loading }) {
  if (loading) {
    return (
      <div className="p-5" aria-label="Memuat kehadiran">
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="mt-5 space-y-3">
          {SPLIT.map((s) => <Skeleton key={s.key} className="h-4 w-full" />)}
        </div>
      </div>
    );
  }
  const total = att?.total ?? 0;
  if (total === 0) return <p className="px-5 py-10 text-center text-sm text-muted">Belum ada karyawan yang wajib absen.</p>;
  const pct = (v) => Math.round((v / total) * 100);
  return (
    <div className="p-5">
      {!isWorkday && (
        <p className="mb-4 rounded-lg bg-subtle px-3 py-2 text-[13px] text-muted">Hari ini bukan hari kerja (akhir pekan atau libur).</p>
      )}
      <div
        className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-subtle"
        role="img"
        aria-label={SPLIT.map((s) => `${s.label} ${att[s.key]}`).join(', ')}
      >
        {SPLIT.filter((s) => att[s.key] > 0).map((s) => (
          <div key={s.key} className={s.color} style={{ width: `${(att[s.key] / total) * 100}%` }} />
        ))}
      </div>
      <dl className="mt-5 space-y-2.5">
        {SPLIT.map((s) => (
          <div key={s.key} className="flex items-center gap-3 text-sm">
            <span className={cx('h-2.5 w-2.5 rounded-sm', s.color)} aria-hidden="true" />
            <dt className="flex-1 text-muted">{s.label}</dt>
            <dd className="num font-medium">{att[s.key]}</dd>
            <dd className="num w-10 text-right text-faint">{pct(att[s.key])}%</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Kartu "Evaluasi kinerja": periode aktif (atau selesai terbaru), progres final, tenggat, rata-rata skor. */
function KpiProgressCard({ kpi, today, loading, go }) {
  const action = <Button variant="secondary" size="sm" onClick={() => go('kpi')}>Kelola KPI</Button>;

  if (loading || !kpi) {
    return (
      <Card className="mt-5">
        <CardHeader title="Evaluasi kinerja" action={action} />
        {loading ? (
          <div className="grid gap-6 p-5 sm:grid-cols-3" aria-label="Memuat KPI">
            <div className="space-y-2 sm:col-span-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-12 w-32" />
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted">Belum ada periode penilaian aktif.</p>
        )}
      </Card>
    );
  }

  const active = kpi.status === 'aktif';
  const pending = kpi.total - kpi.done;
  const overdue = active && pending > 0 && today > kpi.deadline;
  const pct = kpi.total ? Math.round((kpi.done / kpi.total) * 100) : 0;
  const average = kpi.average == null ? null : Number(kpi.average);
  let note;
  if (kpi.total === 0) note = 'Belum ada karyawan dalam periode ini.';
  else if (pending === 0) note = 'Semua karyawan sudah dinilai.';
  else note = `${pending} karyawan belum final${kpi.draft ? ` (${kpi.draft} draft)` : ''}.`;

  return (
    <Card className="mt-5">
      <CardHeader
        title={`Evaluasi kinerja ${kpi.name}`}
        description={active
          ? <>Tenggat pengisian {formatDate(kpi.deadline)}{overdue && <span className="font-medium text-warning"> · lewat tenggat</span>}</>
          : 'Periode selesai. Belum ada periode aktif.'}
        action={action}
      />
      <div className="grid gap-6 p-5 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Sudah dinilai</span>
            <span className="num font-medium">{kpi.done} / {kpi.total}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={kpi.done} aria-valuemin={0} aria-valuemax={kpi.total} aria-label="Progres penilaian KPI">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-muted">{note}</p>
        </div>
        <div>
          <Eyebrow>Rata-rata skor</Eyebrow>
          <p className="mt-1 font-display text-2xl font-semibold">
            <span className="num">{formatScore(average)}</span><span className="text-sm font-medium text-faint"> / 100</span>
          </p>
          <p className="text-[13px] text-muted">{average == null ? 'Belum ada penilaian final' : `Grade ${gradeOf(average)}`}</p>
        </div>
      </div>
    </Card>
  );
}

/* ── Beranda HR: semua angka dari satu panggilan hr_dashboard() ── */
export default function HRHome({ go }) {
  const dash = useHrDashboard();
  const d = dash.data;
  const loading = dash.loading && !d;
  const [toast, toastNode] = useToast();
  const [exporting, setExporting] = useState(false);
  const tasks = useMemo(() => buildTasks(d), [d]);
  const period = d?.payroll?.period ?? currentPeriod();

  const exportReport = async () => {
    if (exporting) return;
    setExporting(true);
    const err = await downloadMonthlyReport(period);
    setExporting(false);
    if (err) toast(rpcMessage(err, 'Laporan gagal dibuat. Coba lagi.'), 'error');
    else toast(`Laporan ${periodLabel(period)} diunduh.`);
  };

  const header = (
    <PageHeader
      title="Ringkasan HR"
      description={longDateJakarta()}
      actions={
        <>
          <Button variant="secondary" onClick={exportReport} disabled={exporting} aria-busy={exporting || undefined}>
            {exporting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
            Laporan bulanan
          </Button>
          <Button onClick={() => go('karyawan/baru')}><Plus size={16} aria-hidden="true" /> Tambah karyawan</Button>
        </>
      }
    />
  );

  if (dash.error && !d) {
    return (
      <>
        {header}
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <AlertCircle size={28} strokeWidth={1.6} className="text-danger" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold">Ringkasan gagal dimuat</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">{rpcMessage(dash.error, 'Periksa koneksi internet, lalu coba lagi.')}</p>
          <Button variant="secondary" className="mt-5" onClick={dash.reload}>Coba lagi</Button>
        </Card>
        {toastNode}
      </>
    );
  }

  const att = d?.attendance;
  const present = presentCount(att);
  const pr = d?.pending_requests;

  return (
    <>
      {header}

      <Card className="overflow-hidden" aria-busy={loading || undefined}>
        <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          <Stat
            label="Karyawan aktif"
            value={d?.employees.active}
            note={`${d?.employees.divisions} divisi · ${d?.employees.positions} jabatan`}
            loading={loading}
            onClick={() => go('karyawan')}
          />
          <Stat
            label="Hadir hari ini"
            value={present}
            unit={`/ ${att?.total ?? 0}`}
            note={!d?.is_workday ? 'Hari ini bukan hari kerja'
              : att?.total ? `${Math.round((present / att.total) * 100)}% tingkat kehadiran` : 'Belum ada karyawan'}
            loading={loading}
            onClick={() => go('kehadiran')}
          />
          <Stat
            label="Pengajuan menunggu"
            value={pr?.count}
            note={pr?.count ? `Mulai terdekat ${formatDate(pr.nearest_start)}` : 'Tidak ada yang menunggu'}
            loading={loading}
            onClick={() => go('kehadiran')}
          />
          <PayrollStat payroll={d?.payroll} loading={loading} go={go} />
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Perlu tindakan" description="Diurutkan berdasarkan tenggat terdekat" />
          <TaskList tasks={tasks} today={d?.today} loading={loading} go={go} />
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Kehadiran hari ini"
            action={<button type="button" onClick={() => go('kehadiran')} className="text-[13px] font-medium text-accent-text hover:underline">Detail</button>}
          />
          <AttendanceSplit att={att} isWorkday={d?.is_workday} loading={loading} />
        </Card>
      </div>

      <KpiProgressCard kpi={d?.kpi} today={d?.today} loading={loading} go={go} />
      {toastNode}
    </>
  );
}
