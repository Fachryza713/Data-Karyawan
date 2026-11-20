import React from 'react';

const greeting = (h) => {
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
};

/* Sapaan halaman beranda — teks biasa, bukan kartu/banner. */
export default function WelcomeBanner({ userName = 'Raditya Pratama' }) {
  const firstName = userName.split(' ')[0];
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {greeting(new Date().getHours())}, {firstName}
      </h1>
      <p className="mt-1 text-sm text-muted">
        Senin, 24 Februari 2026 <span className="text-faint">·</span> NIP <span className="num">BRT-2023-0884</span>
      </p>
    </div>
  );
}
