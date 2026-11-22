import React, { useState } from 'react';
import { Loader2, Paperclip, XCircle } from 'lucide-react';
import { Card, CardHeader, Badge, Button, Modal } from './ui';
import { supabase } from '../lib/supabase';
import { REQUEST_STATUS, KIND_LABEL, rpcMessage, attachmentUrl } from '../lib/leave';
import { formatDate } from '../lib/hr';

const rangeText = (r) => (r.start_date === r.end_date ? formatDate(r.start_date) : `${formatDate(r.start_date)} – ${formatDate(r.end_date)}`);

function CancelModal({ request, onClose, onCancelled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    setBusy(true);
    const { error: err } = await supabase.rpc('cancel_request', { p_id: request.id });
    setBusy(false);
    if (err) return setError(rpcMessage(err, 'Pembatalan gagal. Coba lagi.'));
    onCancelled();
    return undefined;
  };

  return (
    <Modal
      size="sm"
      title="Batalkan pengajuan"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Kembali</Button>
          <Button variant="danger" onClick={confirm} disabled={busy} aria-busy={busy || undefined}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
            Batalkan pengajuan
          </Button>
        </>
      }
    >
      {error && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      <p className="text-sm text-muted">
        Batalkan <span className="font-medium text-fg">{request.leave_type?.name ?? KIND_LABEL[request.kind]}</span>{' '}
        <span className="num">{rangeText(request)}</span>? Pengajuan yang dibatalkan tidak bisa diaktifkan lagi.
      </p>
    </Modal>
  );
}

/** Daftar "Pengajuan saya". `requests` = hasil useMyRequests(). */
export default function MyRequestsCard({ requests, onChanged, className }) {
  const [cancelling, setCancelling] = useState(null);
  const { rows, loading, error, reload } = requests;

  const openAttachment = async (path) => {
    const url = await attachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <Card className={className}>
      <CardHeader title="Pengajuan saya" description={loading ? 'Memuat…' : `${rows.length} pengajuan terakhir`} />
      {error ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-danger">Pengajuan gagal dimuat.</p>
          <Button variant="secondary" className="mt-4" onClick={reload}>Coba lagi</Button>
        </div>
      ) : !loading && rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">Belum ada pengajuan.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const st = REQUEST_STATUS[r.status];
            return (
              <li key={r.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-start sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{r.leave_type?.name ?? KIND_LABEL[r.kind]}</p>
                    <Badge tone={st.tone} dot>{st.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted">
                    <span className="num">{rangeText(r)}</span>
                    <span className="text-faint"> · <span className="num">{r.working_days}</span> hari kerja</span>
                  </p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-muted">{r.reason}</p>
                  {r.status === 'ditolak' && r.review_note && (
                    <p className="mt-1 text-[13px] text-danger">Catatan HR: {r.review_note}</p>
                  )}
                  {r.attachment_path && (
                    <button
                      type="button" onClick={() => openAttachment(r.attachment_path)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
                    >
                      <Paperclip size={12} aria-hidden="true" /> Lihat lampiran
                    </button>
                  )}
                </div>
                {r.status === 'menunggu' && (
                  <Button variant="secondary" size="sm" onClick={() => setCancelling(r)}>Batalkan</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {cancelling && (
        <CancelModal
          request={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={() => { setCancelling(null); onChanged('Pengajuan dibatalkan.'); }}
        />
      )}
    </Card>
  );
}
