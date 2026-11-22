import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, X } from 'lucide-react';
import { Modal, Field, Segmented, Button, cx, inputCls } from './ui';
import { FieldError } from './LoginPage';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { isoJakarta, addDays } from '../lib/attendance';
import { MAX_ATTACHMENT_BYTES, ATTACHMENT_TYPES, rpcMessage } from '../lib/leave';

/** Hitung hari kerja di server (libur dari tabel holidays). */
function useWorkingDays(start, end) {
  const [state, setState] = useState({ loading: false, days: null });
  useEffect(() => {
    if (!start || !end || end < start) {
      setState({ loading: false, days: null });
      return undefined;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('working_days', { p_start: start, p_end: end });
      if (!cancelled) setState({ loading: false, days: error ? null : data });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [start, end]);
  return state;
}

/**
 * Form pengajuan cuti/sakit/izin khusus.
 * `types` dari leave_types, `balance` dari useLeaveBalance(). onSubmitted() setelah tersimpan.
 */
export default function LeaveRequestModal({ types, balance, onClose, onSubmitted }) {
  const { profile } = useAuth();
  const [code, setCode] = useState('tahunan');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const type = types.find((t) => t.code === code);
  const { days, loading: countingDays } = useWorkingDays(start, end || start);
  const today = isoJakarta();
  const minStart = addDays(today, -7);

  const showAttachment = type && !type.deducts_quota;
  const attachmentRequired = type?.requires_attachment_after_days != null && days != null
    && days > type.requires_attachment_after_days;
  const overQuota = type?.deducts_quota && balance && days != null && days > balance.available;

  const clear = (key) => setErrors((e) => (e[key] || e.form ? { ...e, [key]: null, form: null } : e));

  const pickFile = (e) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = '';
    clear('file');
    if (!f) return;
    if (!ATTACHMENT_TYPES[f.type]) return setErrors((x) => ({ ...x, file: 'Format harus JPG, PNG, atau PDF.' }));
    if (f.size > MAX_ATTACHMENT_BYTES) return setErrors((x) => ({ ...x, file: 'Ukuran file maksimal 2 MB.' }));
    setFile(f);
    return undefined;
  };

  const validate = () => {
    const e = {};
    if (!start) e.start = 'Pilih tanggal mulai.';
    else if (start < minStart) e.start = 'Tanggal mulai paling lambat 7 hari ke belakang.';
    if (end && start && end < start) e.end = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
    if (!reason.trim()) e.reason = 'Tuliskan alasan singkat.';
    if (days === 0) e.end = 'Rentang tanggal tidak berisi hari kerja.';
    if (attachmentRequired && !file) e.file = 'Sakit lebih dari 1 hari wajib melampirkan surat dokter.';
    if (overQuota) e.form = `Sisa kuota tidak cukup. Tersedia ${balance.available} hari kerja.`;
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;

    setBusy(true);
    let path = null;
    if (file && showAttachment) {
      path = `${profile.id}/${crypto.randomUUID()}.${ATTACHMENT_TYPES[file.type]}`;
      const { error: upErr } = await supabase.storage.from('attachments')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setBusy(false);
        setErrors({ file: 'Lampiran gagal diunggah. Coba lagi.' });
        return;
      }
    }

    const { error } = await supabase.rpc('submit_leave', {
      p_type: code, p_start: start, p_end: end || start, p_reason: reason.trim(), p_attachment_path: path,
    });
    setBusy(false);
    if (error) {
      setErrors({ form: rpcMessage(error, 'Pengajuan gagal dikirim. Coba lagi.') });
      return;
    }
    onSubmitted();
  };

  return (
    <Modal
      title="Ajukan cuti atau izin"
      description="Pengajuan dikirim ke HR untuk disetujui."
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="submit" form="leave-form" disabled={busy || countingDays || overQuota} aria-busy={busy || undefined}>
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {busy ? 'Mengirim…' : 'Kirim pengajuan'}
          </Button>
        </>
      }
    >
      <form id="leave-form" onSubmit={submit} className="space-y-4" noValidate>
        {errors.form && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errors.form}</p>}

        <Field label="Jenis">
          <Segmented
            name="Jenis pengajuan"
            options={types.map((t) => ({ value: t.code, label: t.name }))}
            value={code}
            onChange={(v) => { setCode(v); setErrors({}); }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mulai" required htmlFor="leave-start">
            <input
              id="leave-start" type="date" value={start} min={minStart}
              onChange={(e) => { setStart(e.target.value); clear('start'); clear('end'); }}
              aria-invalid={!!errors.start || undefined} className={cx(inputCls, 'num', errors.start && 'border-danger')}
            />
            <FieldError>{errors.start}</FieldError>
          </Field>
          <Field label="Selesai" htmlFor="leave-end" aside="Kosongkan jika 1 hari">
            <input
              id="leave-end" type="date" value={end} min={start || minStart}
              onChange={(e) => { setEnd(e.target.value); clear('end'); }}
              aria-invalid={!!errors.end || undefined} className={cx(inputCls, 'num', errors.end && 'border-danger')}
            />
            <FieldError>{errors.end}</FieldError>
          </Field>
        </div>

        <div className="rounded-lg bg-subtle px-3 py-2.5 text-[13px]" aria-live="polite">
          <p className="text-muted">
            Jumlah hari kerja:{' '}
            <span className="num font-medium text-fg">
              {countingDays ? '…' : days != null ? `${days} hari` : '—'}
            </span>
            <span className="text-faint"> (tanpa akhir pekan dan hari libur)</span>
          </p>
          {type?.deducts_quota && (
            <p className={cx('mt-1', overQuota ? 'text-danger' : 'text-muted')}>
              {balance ? (
                <>
                  Sisa kuota {balance.year}: <span className="num font-medium">{balance.remaining} hari</span>
                  {balance.pending > 0 && <> · <span className="num">{balance.pending}</span> hari menunggu persetujuan</>}
                  {' '}· tersedia <span className="num font-medium">{balance.available} hari</span>
                </>
              ) : 'Kuota cuti tahunan belum tersedia. Hubungi HR.'}
            </p>
          )}
          {code === 'sakit' && <p className="mt-1 text-muted">Lebih dari 1 hari kerja wajib melampirkan surat dokter.</p>}
        </div>

        <Field label="Alasan" required htmlFor="leave-reason" aside={`${reason.length}/500`}>
          <textarea
            id="leave-reason" rows={3} value={reason} maxLength={500}
            onChange={(e) => { setReason(e.target.value); clear('reason'); }}
            placeholder="Contoh: acara keluarga di luar kota"
            aria-invalid={!!errors.reason || undefined}
            className={cx(inputCls, 'h-auto resize-none py-2', errors.reason && 'border-danger')}
          />
          <FieldError>{errors.reason}</FieldError>
        </Field>

        {showAttachment && (
          <Field
            label={code === 'sakit' ? 'Surat dokter' : 'Lampiran'}
            required={attachmentRequired}
            aside={attachmentRequired ? undefined : 'Opsional'}
            hint="JPG, PNG, atau PDF. Maksimal 2 MB."
          >
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" onChange={pickFile} className="sr-only" id="leave-file" />
            {file ? (
              <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <Paperclip size={14} className="shrink-0 text-faint" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="num text-xs text-faint">{Math.ceil(file.size / 1024)} KB</span>
                <button type="button" onClick={() => setFile(null)} aria-label="Hapus lampiran" className="rounded p-1 text-muted hover:bg-subtle hover:text-fg">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                <Paperclip size={14} aria-hidden="true" /> Pilih file
              </Button>
            )}
            <FieldError>{errors.file}</FieldError>
          </Field>
        )}
      </form>
    </Modal>
  );
}
