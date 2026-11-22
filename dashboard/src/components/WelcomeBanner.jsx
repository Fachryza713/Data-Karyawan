import React, { useEffect, useState } from 'react';
import { longDateJakarta } from '../lib/useTodayAttendance';
import { greetingFor, hourJakarta } from '../lib/dashboard';

/* Sapaan halaman beranda — teks biasa, bukan kartu/banner. Jam & tanggal mengikuti WIB. */
export default function WelcomeBanner({ profile }) {
  const [now, setNow] = useState(() => new Date());
  // Perbarui tiap menit agar sapaan dan tanggal ikut berganti bila halaman dibiarkan terbuka.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0];
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {greetingFor(hourJakarta(now))}{firstName ? `, ${firstName}` : ''}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {longDateJakarta(now)}
        {profile?.nip && (
          <> <span className="text-faint">·</span> NIP <span className="num">{profile.nip}</span></>
        )}
      </p>
    </div>
  );
}
