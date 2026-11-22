import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, AlertCircle, Calculator, Banknote, RotateCcw, MessageSquare, MessageSquareText,
  Lock, Info, TriangleAlert, Search,
} from 'lucide-react';
import {
  PageHeader, Card, CardHeader, Badge, Button, IconButton, Modal, Field, Avatar, Eyebrow, useToast, inputCls, cx,
} from '../ui';
import { FieldError } from '../LoginPage';
import { supabase } from '../../lib/supabase';
import { formatRupiah } from '../../lib/hr';
import { dateTimeJakarta } from '../../lib/leave';
import {
  RUN_STATUS, EMPLOYER_PARTS, PERIOD_RE, periodLabel, groupDigits, parseDigits, bpjsEmployee, payrollError,
  usePayrollRun, sumSlips,
} from '../../lib/payroll';

const MAX_AMOUNT = 99999999999;

/**
 * Input nominal di tabel: angka mentah saat fokus, berpemisah ribuan saat tidak.
 * Disimpan saat blur / Enter, Esc membatalkan. onCommit(n) -> Promise<boolean>.
 */
function MoneyInput({ value, label, onCommit }) {
  const [text, setText] = useState(groupDigits(value));
  const [saving, setSaving] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => { setText(groupDigits(value)); }, [value]);

  const commit = async () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setText(groupDigits(value));
      return;
    }
    const n = Math.min(parseDigits(text), MAX_AMOUNT);
    setText(groupDigits(n));
    if (n === Number(value)) return;
    setSaving(true);
    const ok = await onCommit(n);
    setSaving(false);
    if (!ok) setText(groupDigits(value));
  };

  return (
    <span className="relative inline-flex items-center">
      {saving && <Loader2 size={12} className="absolute -left-4 animate-spin text-faint" aria-hidden="true" />}
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={text}
        disabled={saving}
        onFocus={(e) => {
          const el = e.target;
          setText(String(parseDigits(el.value)));
          requestAnimationFrame(() => el.select());
        }}
        onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 11))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === 'Escape') { cancelRef.current = true; e.currentTarget.blur(); }
        }}
        className={cx(inputCls, 'num h-8 w-32 px-2 text-right text-[13px]')}
      />
    </span>
  );
}

function PayslipRow({ slip, editable, onSave, onOpenNote }) {
  const name = slip.employee?.full_name ?? '—';
  const negative = Number(slip.net) < 0;
  return (
    <tr className="transition-colors hover:bg-subtle">
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-3">
          <Avatar name={slip.employee?.full_name ?? ''} src={slip.employee?.photo_url} size={30} />
          <div className="min-w-0">
            <p className="truncate font-medium">{name}</p>
            <p className="truncate text-xs text-faint"><span className="num">{slip.employee?.nip ?? '—'}</span> · {slip.employee?.division?.name ?? '—'}</p>
          </div>
        </div>
      </td>
      <td className="num px-3 py-2.5 text-right">{groupDigits(slip.base_salary)}</td>
      <td className="num px-3 py-2.5 text-right">{groupDigits(slip.allowance)}</td>
      <td className="px-3 py-2.5 text-right">
        {editable
          ? <MoneyInput value={slip.bonus} label={`Bonus ${name}`} onCommit={(n) => onSave(slip, { bonus: n })} />
          : <span className="num">{groupDigits(slip.bonus)}</span>}
      </td>
      <td
        className="num px-3 py-2.5 text-right text-muted"
        title={`BPJS Kesehatan ${groupDigits(slip.bpjs_kes)} · JHT ${groupDigits(slip.bpjs_jht)} · JP ${groupDigits(slip.bpjs_jp)}`}
      >
        {groupDigits(bpjsEmployee(slip))}
      </td>
      <td className="px-3 py-2.5 text-right">
        {editable
          ? <MoneyInput value={slip.pph21} label={`PPh 21 ${name}`} onCommit={(n) => onSave(slip, { pph21: n })} />
          : <span className="num">{groupDigits(slip.pph21)}</span>}
      </td>
      <td className={cx('num px-3 py-2.5 text-right font-semibold', negative && 'text-danger')}>{groupDigits(slip.net)}</td>
      <td className="px-3 py-2.5 text-right">
        <IconButton
          label={slip.note ? `Catatan ${name}: ${slip.note}` : `Tambah catatan untuk ${name}`}
          onClick={() => onOpenNote(slip)}
          disabled={!editable && !slip.note}
          className={cx('h-8 w-8 disabled:opacity-40', slip.note && 'text-accent-text')}
        >
          {slip.note ? <MessageSquareText size={15} /> : <MessageSquare size={15} />}
        </IconButton>
      </td>
    </tr>
  );
}

function NoteModal({ slip, editable, onClose, onSave }) {
  const [note, setNote] = useState(slip.note ?? '');
  const [busy, setBusy] = useState(false);

  const save = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await onSave(slip, { note: note.trim() || null });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      size="sm"
      title="Catatan slip"
      description={slip.employee?.full_name}
      onClose={busy ? () => {} : onClose}
      footer={editable ? (
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="submit" form="slip-note-form" disabled={busy} aria-busy={busy || undefined}>
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Simpan
          </Button>
        </>
      ) : <Button variant="secondary" onClick={onClose}>Tutup</Button>}
    >
      {editable ? (
        <form id="slip-note-form" onSubmit={save} noValidate>
          <Field label="Catatan" htmlFor="slip-note" aside={`${note.length}/300`} hint="Mis. dasar bonus atau perhitungan PPh 21.">
            <textarea
              id="slip-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
              className={cx(inputCls, 'h-auto resize-none py-2')}
            />
          </Field>
        </form>
      ) : (
        <p className="whitespace-pre-line break-words text-sm">{slip.note}</p>
      )}
    </Modal>
  );
}

/** Dialog konfirmasi aksi run. onConfirm(reason) -> Promise<string|null> (pesan error atau null). */
function ConfirmModal({ action, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const Icon = action.icon;

  const confirm = async () => {
    if (busy) return;
    if (action.reason && !reason.trim()) {
      setReasonError('Alasan wajib diisi.');
      return;
    }
    setBusy(true);
    setError(null);
    const msg = await onConfirm(reason.trim());
    setBusy(false);
    if (msg) setError(msg);
  };

  return (
    <Modal
      size="sm"
      title={action.title}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
          <Button variant={action.variant ?? 'primary'} onClick={confirm} disabled={busy} aria-busy={busy || undefined}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}
            {action.confirmLabel}
          </Button>
        </>
      }
    >
      {error && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      <div className="space-y-2 text-sm text-muted">{action.body}</div>
      {action.reason && (
        <div className="mt-4">
          <Field label="Alasan" required htmlFor="run-reason" aside={`${reason.length}/500`} hint="Dicatat di audit log.">
            <textarea
              id="run-reason" rows={3} maxLength={500} value={reason}
              onChange={(e) => { setReason(e.target.value); setReasonError(null); }}
              placeholder="Contoh: koreksi bonus divisi Pemasaran"
              aria-invalid={!!reasonError || undefined}
              className={cx(inputCls, 'h-auto resize-none py-2', reasonError && 'border-danger')}
            />
            <FieldError>{reasonError}</FieldError>
          </Field>
        </div>
      )}
    </Modal>
  );
}

function StatusNote({ status }) {
  const text = {
    draft: 'Draft: bonus dan PPh 21 bisa diubah langsung di tabel (simpan dengan Enter atau pindah kolom). Slip belum terlihat oleh karyawan.',
    final: 'Final: slip sudah terbit ke karyawan dan terkunci. Buka kembali untuk koreksi.',
    paid: 'Dibayar: payroll sudah ditransfer dan tidak bisa diubah lagi.',
  }[status];
  return (
    <p className="mb-5 flex items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-muted">
      <Info size={15} className="mt-0.5 shrink-0 text-faint" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

function SkippedNote({ skipped, onDismiss }) {
  if (!skipped?.length) return null;
  const names = skipped.map((s) => s.full_name);
  return (
    <div role="status" className="mb-5 flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-[13px] text-warning">
      <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="flex-1">
        <span className="font-medium"><span className="num">{names.length}</span> karyawan aktif tanpa data gaji tidak ikut dihitung:</span>{' '}
        {names.slice(0, 5).join(', ')}{names.length > 5 && ` dan ${names.length - 5} lainnya`}.
        {' '}Lengkapi gaji di Data karyawan, lalu klik Hitung ulang.
      </p>
      <button type="button" onClick={onDismiss} className="text-xs font-medium underline underline-offset-2">Tutup</button>
    </div>
  );
}

export default function PayrollRunDetailPage() {
  const { period } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const validPeriod = PERIOD_RE.test(period ?? '');
  const data = usePayrollRun(validPeriod ? period : '');
  const [toast, toastNode] = useToast();
  const [confirm, setConfirm] = useState(null); // kunci aksi: finalize | paid | reopen | recalc
  const [noteSlip, setNoteSlip] = useState(null);
  const [skipped, setSkipped] = useState(() => location.state?.created?.skipped ?? []);
  const [query, setQuery] = useState('');

  // Pesan "draft dibuat" dari halaman daftar; state navigasi dihapus agar tidak muncul lagi saat refresh.
  useEffect(() => {
    const created = location.state?.created;
    if (!created) return;
    toast(`Draft payroll dibuat untuk ${created.payslips} karyawan.`);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { run, slips } = data;
  const label = periodLabel(period);
  const totals = useMemo(() => sumSlips(slips), [slips]);
  const editable = run?.status === 'draft';
  const hasNegative = slips.some((s) => Number(s.net) < 0);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return slips;
    return slips.filter((s) => (s.employee?.full_name ?? '').toLowerCase().includes(q)
      || (s.employee?.nip ?? '').toLowerCase().includes(q));
  }, [slips, query]);

  // Hanya kolom yang diubah yang dikirim (null = tidak diubah di server), jadi simpan bonus
  // dan PPh 21 beruntun pada baris yang sama tidak saling menimpa.
  const saveSlip = async (slip, patch) => {
    const { data: row, error } = await supabase.rpc('update_payslip_manual', {
      p_id: slip.id,
      p_bonus: 'bonus' in patch ? patch.bonus : null,
      p_pph21: 'pph21' in patch ? patch.pph21 : null,
      p_note: 'note' in patch ? patch.note : slip.note,
    });
    if (error) {
      toast(payrollError(error, 'Slip gagal disimpan. Coba lagi.'), 'error');
      if (/tidak bisa diubah/.test(error.message ?? '')) data.reload(); // status berubah di tab lain
      return false;
    }
    data.replaceSlip(row);
    return true;
  };

  const actions = run ? {
    recalc: {
      title: 'Hitung ulang payroll',
      icon: Calculator,
      variant: 'secondary',
      confirmLabel: 'Hitung ulang',
      body: (
        <>
          <p>Gaji pokok, tunjangan, dan potongan BPJS dihitung ulang dari data gaji dan tarif terbaru untuk {label}.</p>
          <p>Bonus, PPh 21, dan catatan yang sudah diisi tetap. Karyawan yang baru aktif ditambahkan, yang nonaktif dikeluarkan.</p>
        </>
      ),
      call: () => supabase.rpc('recalculate_payroll_run', { p_run_id: run.id }),
    },
    finalize: {
      title: 'Finalisasi payroll',
      icon: Lock,
      confirmLabel: 'Finalisasi',
      body: (
        <>
          <p>
            Finalisasi payroll {label} untuk <span className="num font-medium text-fg">{slips.length}</span> karyawan dengan total take home pay{' '}
            <span className="num font-medium text-fg">{formatRupiah(totals.net)}</span>?
          </p>
          <p>Setelah final, slip terbit ke karyawan dan tidak bisa diubah kecuali payroll dibuka kembali.</p>
        </>
      ),
      call: () => supabase.rpc('finalize_payroll_run', { p_run_id: run.id }),
      success: `Payroll ${label} difinalisasi. Slip sudah terbit ke karyawan.`,
    },
    paid: {
      title: 'Tandai sudah dibayar',
      icon: Banknote,
      confirmLabel: 'Tandai dibayar',
      body: (
        <>
          <p>
            Tandai payroll {label} sudah dibayar? Total transfer <span className="num font-medium text-fg">{formatRupiah(totals.net)}</span> ke{' '}
            <span className="num font-medium text-fg">{slips.length}</span> karyawan.
          </p>
          <p>Payroll yang sudah dibayar tidak bisa dibuka kembali.</p>
        </>
      ),
      call: () => supabase.rpc('mark_payroll_paid', { p_run_id: run.id }),
      success: `Payroll ${label} ditandai dibayar.`,
    },
    reopen: {
      title: 'Buka kembali payroll',
      icon: RotateCcw,
      variant: 'danger',
      confirmLabel: 'Buka kembali',
      reason: true,
      body: <p>Payroll {label} kembali menjadi draft. Slip disembunyikan dari karyawan sampai difinalisasi lagi.</p>,
      call: (reason) => supabase.rpc('reopen_payroll_run', { p_run_id: run.id, p_reason: reason }),
      success: `Payroll ${label} dibuka kembali sebagai draft.`,
    },
  } : {};

  const runAction = async (key, reason) => {
    const { data: result, error } = await actions[key].call(reason);
    if (error) {
      if (error.code === 'P0001') data.reload();
      return payrollError(error);
    }
    setConfirm(null);
    if (key === 'recalc') {
      setSkipped(result?.skipped ?? []);
      await data.reload();
      toast(`Payroll dihitung ulang untuk ${result?.payslips ?? 0} karyawan.`);
    } else {
      data.setRun(result);
      toast(actions[key].success);
    }
    return null;
  };

  const back = (
    <button
      type="button"
      onClick={() => navigate('/hr/penggajian')}
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg"
    >
      <ArrowLeft size={16} aria-hidden="true" /> Penggajian & manfaat
    </button>
  );

  if (!validPeriod || (!data.loading && !run)) {
    return (
      <>
        {back}
        <Card className="px-6 py-16 text-center">
          {data.error ? (
            <p className="text-sm text-danger">
              <AlertCircle size={16} className="mr-1.5 inline" aria-hidden="true" />
              {payrollError(data.error, 'Payroll gagal dimuat.')}
            </p>
          ) : (
            <p className="text-sm text-muted">Payroll {validPeriod ? label : 'periode ini'} belum dibuat.</p>
          )}
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/hr/penggajian')}>Kembali ke daftar</Button>
        </Card>
      </>
    );
  }

  if (!run) {
    return (
      <>
        {back}
        <Card className="px-6 py-16 text-center text-sm text-muted">
          <Loader2 size={18} className="mr-2 inline animate-spin" aria-hidden="true" />Memuat payroll…
        </Card>
      </>
    );
  }

  const st = RUN_STATUS[run.status];
  const since = {
    draft: `dibuat ${dateTimeJakarta(run.created_at)}`,
    final: `final sejak ${dateTimeJakarta(run.finalized_at)}`,
    paid: `dibayar ${dateTimeJakarta(run.paid_at)}`,
  }[run.status];

  const metrics = [
    { label: 'Bruto', value: totals.gross, note: 'Gaji pokok + tunjangan + bonus' },
    { label: 'BPJS karyawan', value: totals.bpjs, note: 'Kesehatan, JHT, JP' },
    { label: 'PPh 21', value: totals.pph21, note: 'Diisi manual oleh HR' },
    { label: 'Take home pay', value: totals.net, note: `${slips.length} karyawan`, strong: true },
    { label: 'BPJS perusahaan', value: totals.employer.total, note: 'Tidak memotong slip' },
  ];

  return (
    <>
      {back}
      <PageHeader
        title={`Payroll ${label}`}
        description={`${st.label} · ${since}`}
        actions={
          <>
            <Badge tone={st.tone} dot>{st.label}</Badge>
            {run.status === 'draft' && (
              <>
                <Button variant="secondary" onClick={() => setConfirm('recalc')}>
                  <Calculator size={16} aria-hidden="true" /> Hitung ulang
                </Button>
                <Button
                  onClick={() => setConfirm('finalize')}
                  disabled={slips.length === 0 || hasNegative}
                  title={hasNegative ? 'Ada slip dengan take home pay negatif' : undefined}
                >
                  <Lock size={16} aria-hidden="true" /> Finalisasi
                </Button>
              </>
            )}
            {run.status === 'final' && (
              <>
                <Button variant="danger" onClick={() => setConfirm('reopen')}>
                  <RotateCcw size={16} aria-hidden="true" /> Buka kembali
                </Button>
                <Button onClick={() => setConfirm('paid')}>
                  <Banknote size={16} aria-hidden="true" /> Tandai dibayar
                </Button>
              </>
            )}
          </>
        }
      />

      <StatusNote status={run.status} />
      <SkippedNote skipped={skipped} onDismiss={() => setSkipped([])} />

      <Card className="overflow-hidden">
        <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((m) => (
            <div key={m.label} className="bg-surface p-5">
              <dt><Eyebrow>{m.label}</Eyebrow></dt>
              <dd className={cx('num mt-1 font-display text-xl font-semibold', m.strong && 'text-accent-text')}>{formatRupiah(m.value)}</dd>
              <dd className="mt-0.5 text-[13px] text-muted">{m.note}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="mt-5">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold">Slip gaji</h2>
            <p className="mt-0.5 text-[13px] text-muted">Nominal dalam rupiah. Arahkan kursor ke kolom BPJS untuk rinciannya.</p>
          </div>
          <div className="relative sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
            <label htmlFor="slip-q" className="sr-only">Cari nama atau NIP</label>
            <input
              id="slip-q" type="search" value={query} placeholder="Cari nama atau NIP"
              onChange={(e) => setQuery(e.target.value)}
              className={cx(inputCls, 'h-8 pl-8 text-[13px]')}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-faint">
                <th scope="col" className="px-5 py-2.5 text-left font-medium">Karyawan</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Gaji pokok</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Tunjangan</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Bonus</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">BPJS</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">PPh 21</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Take home pay</th>
                <th scope="col" className="w-12 px-3 py-2.5"><span className="sr-only">Catatan</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">
                  {slips.length === 0 ? 'Belum ada slip di payroll ini.' : 'Tidak ada karyawan yang cocok.'}
                </td></tr>
              )}
              {visible.map((s) => (
                <PayslipRow key={s.id} slip={s} editable={editable} onSave={saveSlip} onOpenNote={setNoteSlip} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-strong bg-subtle font-semibold">
                <th scope="row" className="px-5 py-3 text-left">
                  Total <span className="num font-normal text-muted">· {slips.length} karyawan</span>
                </th>
                <td className="num px-3 py-3 text-right">{groupDigits(totals.base_salary)}</td>
                <td className="num px-3 py-3 text-right">{groupDigits(totals.allowance)}</td>
                <td className="num px-3 py-3 text-right">{groupDigits(totals.bonus)}</td>
                <td className="num px-3 py-3 text-right">{groupDigits(totals.bpjs)}</td>
                <td className="num px-3 py-3 text-right">{groupDigits(totals.pph21)}</td>
                <td className="num px-3 py-3 text-right">{groupDigits(totals.net)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card className="mt-5 overflow-hidden">
        <CardHeader title="Ringkasan BPJS" description="Kontribusi perusahaan dibayar terpisah dan tidak memotong slip karyawan." />
        <div className="grid gap-px bg-line sm:grid-cols-2">
          <div className="bg-surface p-5">
            <Eyebrow>Bagian perusahaan</Eyebrow>
            <dl className="mt-3 space-y-2 text-sm">
              {EMPLOYER_PARTS.map((p) => (
                <div key={p.key} className="flex justify-between gap-3">
                  <dt className="text-muted">{p.label}</dt>
                  <dd className="num">{formatRupiah(totals.employer[p.key])}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                <dt>Total perusahaan</dt>
                <dd className="num">{formatRupiah(totals.employer.total)}</dd>
              </div>
            </dl>
          </div>
          <div className="bg-surface p-5">
            <Eyebrow>Bagian karyawan (dipotong dari slip)</Eyebrow>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['BPJS Kesehatan', totals.bpjs_kes],
                ['JHT', totals.bpjs_jht],
                ['Jaminan Pensiun', totals.bpjs_jp],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="num">{formatRupiah(v)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                <dt>Total karyawan</dt>
                <dd className="num">{formatRupiah(totals.bpjs)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-faint">
              Total setoran BPJS bulan ini: <span className="num font-medium text-muted">{formatRupiah(totals.bpjs + totals.employer.total)}</span>
            </p>
          </div>
        </div>
      </Card>

      {noteSlip && (
        <NoteModal
          key={noteSlip.id}
          slip={noteSlip}
          editable={editable}
          onClose={() => setNoteSlip(null)}
          onSave={saveSlip}
        />
      )}
      {confirm && actions[confirm] && (
        <ConfirmModal
          action={actions[confirm]}
          onClose={() => setConfirm(null)}
          onConfirm={(reason) => runAction(confirm, reason)}
        />
      )}
      {toastNode}
    </>
  );
}
