import React from 'react';
import { LogIn, LogOut, Loader2, AlertCircle, House, Briefcase } from 'lucide-react';
import { Button, cx } from './ui';
import { timeJakarta, attendanceBadge } from '../lib/useTodayAttendance';

/** Teks status hari ini: belum absen / sudah masuk jam X / sudah pulang jam Y. */
export function todayStatusText(att) {
  const { today, checkedIn, checkedOut } = att;
  if (checkedOut) return `Sudah pulang pukul ${timeJakarta(today.clock_out_at)} WIB`;
  if (checkedIn) return `Sudah masuk pukul ${timeJakarta(today.clock_in_at)} WIB`;
  if (today) return `Hari ini tercatat ${attendanceBadge(today)?.label.toLowerCase() ?? today.status}`;
  return 'Belum absen hari ini';
}

/**
 * Penanda izin WFH/dinas luar yang disetujui untuk hari ini, supaya karyawan tahu
 * ia boleh absen di luar radius kantor. `remote` = att.remote dari useTodayAttendance().
 */
export function RemoteTodayNote({ remote, className }) {
  if (!remote) return null;
  const dinas = remote.kind === 'dinas';
  const Icon = dinas ? Briefcase : House;
  return (
    <p className={cx('flex items-start gap-1.5 rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success', className)}>
      <Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">
        <span className="font-medium">{dinas ? `Dinas luar ke ${remote.destination}` : 'Hari ini: WFH disetujui'}</span>
        {' '}· Absen boleh di luar radius kantor.
      </span>
    </p>
  );
}

function busyLabel(phase) {
  return phase === 'locating' ? 'Mengambil lokasi…' : 'Mengirim…';
}

/**
 * Tombol Absen masuk + Absen pulang, aktif sesuai kondisi, beserta pesan penolakan.
 * `att` = hasil useTodayAttendance(). `onSuccess(msg)` dipanggil setelah absen tercatat.
 */
export default function ClockActions({ att, onSuccess, size = 'md', className }) {
  const { phase, action, error, canClockIn, canClockOut, configured, loading, loadError } = att;

  const doIn = async () => {
    const row = await att.clockIn();
    if (row) onSuccess?.(`Absen masuk tercatat ${timeJakarta(row.clock_in_at)} WIB`);
  };
  const doOut = async () => {
    const row = await att.clockOut();
    if (row) onSuccess?.(`Absen pulang tercatat ${timeJakarta(row.clock_out_at)} WIB`);
  };

  const pendingIn = action === 'clock_in';
  const pendingOut = action === 'clock_out';
  const blocked = loading || !!loadError;

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div className="grid grid-cols-2 gap-2">
        <Button size={size} onClick={doIn} disabled={blocked || !canClockIn} aria-busy={pendingIn || undefined}>
          {pendingIn ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
          {pendingIn ? busyLabel(phase) : 'Masuk'}
        </Button>
        <Button
          size={size}
          variant={att.checkedIn && !att.checkedOut ? 'primary' : 'secondary'}
          onClick={doOut}
          disabled={blocked || !canClockOut}
          aria-busy={pendingOut || undefined}
        >
          {pendingOut ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
          {pendingOut ? busyLabel(phase) : 'Pulang'}
        </Button>
      </div>

      {!loading && !loadError && !configured && (
        <p className="text-xs text-warning">Kantor atau shift Anda belum diatur. Hubungi HR.</p>
      )}
      {loadError && (
        <p className="text-xs text-danger">
          Status presensi gagal dimuat.{' '}
          <button type="button" onClick={att.reload} className="font-medium underline underline-offset-2">Muat ulang</button>
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
