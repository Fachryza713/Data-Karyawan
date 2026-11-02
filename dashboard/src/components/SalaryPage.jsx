import React, { useState, useEffect } from 'react';
import {
  History, FileText, Eye, EyeOff, Check, Plus, Minus, ShieldCheck, Info,
  ArrowRight, Briefcase, Shield, Heart, X, Printer, CalendarClock,
} from 'lucide-react';
import { benefitsData, BenefitModal } from './BenefitsCard';

const HIDDEN = 'Rp •••••••••';
const fmt = (n) => 'Rp ' + n.toLocaleString('id-ID');

const periods = [
  { id: 'feb-2026', label: 'Februari 2026', published: false, estimate: '27 Feb 2026' },
  { id: 'jan-2026', label: 'Januari 2026', published: true, ref: 'SLP/BRT/2026/01-089', transfer: '25 Januari 2026 • 10:14 WIB' },
  { id: 'des-2025', label: 'Desember 2025', published: true, ref: 'SLP/BRT/2025/12-091', transfer: '25 Desember 2025 • 09:42 WIB' },
  { id: 'nov-2025', label: 'November 2025', published: true, ref: 'SLP/BRT/2025/11-087', transfer: '25 November 2025 • 10:05 WIB' },
];

const pay = { basic: 12000000, allowance: 3850000, deduction: 1000000 };
const gross = pay.basic + pay.allowance;
const thp = gross - pay.deduction;

const cardBenefits = {
  'bpjs-kesehatan': { icon: Briefcase, light: 'bg-emerald-50 text-emerald-600', dark: 'bg-emerald-950/40 text-emerald-400' },
  'bpjs-ketenagakerjaan': { icon: Shield, light: 'bg-blue-50 text-blue-600', dark: 'bg-blue-950/50 text-blue-400' },
  prudential: { icon: Heart, light: 'bg-purple-50 text-purple-600', dark: 'bg-purple-950/40 text-purple-400' },
};

function PaidBadge({ isDark }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-full whitespace-nowrap ${isDark ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Terbit (Paid)
    </span>
  );
}

function PayslipModal({ period, onClose, isDark, show }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = [
    ['Gaji Pokok Karyawan', pay.basic],
    ['Tunjangan Fungsional & Keahlian', pay.allowance],
    ['Total Penghasilan Kotor (Gross)', gross],
    ['Potongan PPh 21 & BPJS', -pay.deduction],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className={`relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`px-6 py-4 flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <h3 className={`font-headline font-bold text-[15px] ${isDark ? 'text-white' : 'text-neutral'}`}>Preview Slip Gaji (PDF)</h3>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'}`}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div id="payslip-print" className={`rounded-xl border p-5 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
            <div className="text-center mb-4">
              <p className={`font-headline font-bold ${isDark ? 'text-white' : 'text-neutral'}`}>Blue Rose Tech</p>
              <p className="text-[11px] text-slate-400">Slip Gaji • Periode {period.label}</p>
              <p className="text-[11px] text-slate-400">No. Ref: {period.ref}</p>
            </div>
            <div className={`text-[12px] mb-3 ${isDark ? 'text-slate-200' : 'text-neutral'}`}>
              <p>Nama: Raditya Pratama</p>
              <p>Bank: BCA •••• 8821</p>
              <p>Tanggal Transfer: {period.transfer}</p>
            </div>
            <div className={`border-t pt-3 space-y-2 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
              {rows.map(([l, v]) => (
                <div key={l} className={`flex justify-between text-[12px] ${isDark ? 'text-slate-200' : 'text-neutral'}`}>
                  <span>{l}</span>
                  <span className={`font-semibold ${v < 0 ? 'text-red-500' : ''}`}>{show(Math.abs(v), v < 0 ? '- ' : '')}</span>
                </div>
              ))}
              <div className={`flex justify-between text-[13px] font-bold border-t pt-2 ${isDark ? 'border-slate-700 text-white' : 'border-slate-200 text-neutral'}`}>
                <span>Take Home Pay</span>
                <span>{show(thp)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`px-6 py-4 border-t flex justify-end gap-3 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <button onClick={onClose} className={`px-4 py-2 text-[13px] font-medium rounded-xl ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>Tutup</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 bg-[#1E3A8A] hover:bg-blue-900 text-white text-[13px] font-semibold rounded-xl">
            <Printer size={15} /> Cetak
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SalaryPage({ isDark }) {
  const [selectedPeriod, setSelectedPeriod] = useState('jan-2026');
  const [hideSalary, setHideSalary] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [selectedBenefit, setSelectedBenefit] = useState(null);

  const period = periods.find((p) => p.id === selectedPeriod);
  const show = (n, prefix = '') => (hideSalary ? (prefix ? `${prefix}${HIDDEN}` : HIDDEN) : prefix + fmt(n));

  const card = `rounded-2xl border transition-colors duration-300 ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`;
  const divider = isDark ? 'border-slate-800' : 'border-slate-100';
  const title = isDark ? 'text-white' : 'text-neutral';
  const iconBox = isDark ? 'bg-blue-950/50 text-blue-400' : 'bg-blue-50 text-secondary';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className={`font-headline font-extrabold text-2xl ${title}`}>Gaji &amp; Manfaat Karyawan</h1>
        <p className="text-[13px] text-slate-400 mt-1">
          Kelola transparansi rincian slip gaji bulanan serta informasi manfaat perlindungan aktif Anda.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[35fr_65fr] gap-6">
        {/* Riwayat */}
        <div className={`${card} flex flex-col self-start`}>
          <div className={`px-5 py-4 flex items-center justify-between border-b ${divider}`}>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${iconBox}`}><History size={16} /></div>
              <h3 className={`font-headline font-semibold text-sm ${title}`}>Riwayat Slip Gaji</h3>
            </div>
            <select className={`text-[12px] font-medium rounded-lg border px-2.5 py-1.5 outline-none ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-600'}`}>
              <option>Tahun 2026</option>
            </select>
          </div>

          <div className="p-4 space-y-3">
            {periods.map((p) => {
              const active = p.id === selectedPeriod;
              let cls;
              if (!p.published) {
                cls = `border border-dashed ${isDark ? 'border-slate-600 bg-slate-800/30' : 'border-slate-300 bg-slate-50'} ${active ? (isDark ? '!border-blue-500' : '!border-[#2563EB]') : ''}`;
              } else if (active) {
                cls = `border-2 border-[#2563EB] ${isDark ? 'bg-blue-950/20' : 'bg-blue-50/40'}`;
              } else {
                cls = `border ${isDark ? 'border-slate-700 hover:bg-slate-800/60' : 'border-slate-200 hover:bg-slate-50'}`;
              }
              return (
                <button key={p.id} onClick={() => setSelectedPeriod(p.id)} className={`w-full text-left rounded-xl p-4 transition-colors ${cls}`}>
                  {p.published ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${title}`}>
                          {p.label}
                          {active && <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />}
                        </span>
                        <PaidBadge isDark={isDark} />
                      </div>
                      <div className="flex items-center justify-between mt-2.5">
                        <span className="text-[12px] text-slate-400">Total THP:</span>
                        <span className={`text-[13px] ${active ? 'font-bold' : 'font-medium'} ${title}`}>{show(thp)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className={`text-[13px] font-semibold ${title}`}>{p.label}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Estimasi transfer: {p.estimate}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-full ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-500'}`}>Belum Terbit</span>
                        <p className="text-[10px] text-slate-400 mt-1">Terbit akhir bulan</p>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <p className={`px-5 py-3 border-t text-center text-[11px] text-slate-400 ${divider}`}>Menampilkan 4 periode penggajian terbaru</p>
        </div>

        {/* Detail */}
        {!period.published ? (
          <div className={`${card} flex items-center justify-center p-10`}>
            <div className="text-center max-w-sm">
              <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 ${iconBox}`}><CalendarClock size={24} /></div>
              <h4 className={`font-headline font-bold text-base mb-2 ${title}`}>Slip Gaji Periode {period.label} Belum Diterbitkan</h4>
              <p className="text-[13px] text-slate-400 leading-relaxed">
                Penggajian reguler dijadwalkan terbit pada akhir bulan. Estimasi transfer: {period.estimate}.
              </p>
            </div>
          </div>
        ) : (
          <div className={card}>
            <div className={`px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b ${divider}`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBox}`}><FileText size={18} /></div>
                <div>
                  <h3 className={`font-headline font-bold text-sm ${title}`}>Slip Gaji • Periode {period.label}</h3>
                  <p className="text-[11px] text-slate-400">Nomor Referensi Slip: {period.ref}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <PaidBadge isDark={isDark} />
                <button
                  onClick={() => setHideSalary((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-colors ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                  {hideSalary ? <Eye size={13} /> : <EyeOff size={13} />}
                  {hideSalary ? 'Tampilkan Nominal' : 'Sembunyikan Nominal'}
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Banner THP */}
              <div className="rounded-2xl p-5 text-white flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-[#1E3A8A] to-[#1E1B4B]">
                <div>
                  <p className="text-[10px] font-bold tracking-wider uppercase text-blue-200">GAJI BERSIH DITERIMA (TAKE HOME PAY)</p>
                  <p className="font-headline font-extrabold text-3xl md:text-4xl my-1.5">{show(thp)}</p>
                  <p className="flex items-center gap-1.5 text-[12px] text-blue-100">
                    <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center"><Check size={10} strokeWidth={3} /></span>
                    Ditransfer ke Bank BCA •••• 8821 a/n Raditya Pratama
                  </p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-right">
                  <p className="text-[10px] text-blue-200">Tanggal Transfer Resmi</p>
                  <p className="text-[13px] font-bold">{period.transfer}</p>
                </div>
              </div>

              {/* Penerimaan */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isDark ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}><Plus size={14} /></div>
                  <h4 className={`text-[11px] font-bold uppercase tracking-wider ${title}`}>KOMPONEN PENERIMAAN (PENGHASILAN BRUTO)</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between gap-4">
                    <span className={`text-[13px] ${title}`}>Gaji Pokok Karyawan</span>
                    <span className={`text-[13px] font-semibold ${title}`}>{show(pay.basic)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className={`text-[13px] ${title}`}>Tunjangan Fungsional &amp; Keahlian</p>
                      <p className="text-[11px] text-slate-400">Keahlian Rekayasa Frontend Web &amp; Akselerasi Produk</p>
                    </div>
                    <span className={`text-[13px] font-semibold ${title}`}>{show(pay.allowance)}</span>
                  </div>
                  <div className={`flex justify-between pt-3 border-t ${divider}`}>
                    <span className={`text-[13px] font-bold ${title}`}>Total Penghasilan Kotor (Gross)</span>
                    <span className={`text-[13px] font-bold ${title}`}>{show(gross)}</span>
                  </div>
                </div>
              </div>

              {/* Potongan */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isDark ? 'bg-red-950/40 text-red-400' : 'bg-red-50 text-red-500'}`}><Minus size={14} /></div>
                  <h4 className={`text-[11px] font-bold uppercase tracking-wider ${title}`}>KOMPONEN POTONGAN (PAJAK &amp; JAMINAN)</h4>
                </div>
                <div className="flex justify-between gap-4">
                  <div>
                    <p className={`text-[13px] ${title}`}>Potongan Pajak PPh 21 &amp; Iuran BPJS</p>
                    <p className="text-[11px] text-slate-400">PPh 21 Pasal 21 Terutang, BPJS Ketenagakerjaan (JHT, JP), &amp; BPJS Kes</p>
                  </div>
                  <span className="text-[13px] font-bold text-red-500 whitespace-nowrap">{show(pay.deduction, '- ')}</span>
                </div>
              </div>

              <button
                onClick={() => setShowPdf(true)}
                className="w-full bg-[#1E3A8A] hover:bg-blue-900 text-white py-3.5 rounded-xl font-semibold text-[13px] inline-flex items-center justify-center gap-2 transition-colors"
              >
                <FileText size={16} /> Lihat &amp; Cetak Slip Gaji (PDF)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manfaat */}
      <div className={card}>
        <div className={`px-5 py-4 flex items-center justify-between border-b ${divider}`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBox}`}><ShieldCheck size={18} /></div>
            <div>
              <h3 className={`font-headline font-bold text-sm ${title}`}>Manfaat &amp; Asuransi Aktif</h3>
              <p className="text-[11px] text-slate-400">Program perlindungan kesehatan, ketenagakerjaan, dan benefit komprehensif perusahaan</p>
            </div>
          </div>
          <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full whitespace-nowrap ${isDark ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>3 Terdaftar</span>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {benefitsData.map((b) => {
            const meta = cardBenefits[b.id];
            const Icon = meta.icon;
            return (
              <button
                key={b.id}
                onClick={() => setSelectedBenefit(b)}
                className={`text-left p-4 rounded-xl border transition-all hover:shadow-sm ${isDark ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
              >
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? meta.dark : meta.light}`}><Icon size={20} /></div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full ${isDark ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Aktif
                  </span>
                </div>
                <p className={`mt-3 text-[13px] font-semibold ${title}`}>{b.title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{b.subtitle}</p>
                <div className={`mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-semibold ${isDark ? 'border-slate-700 text-blue-400' : 'border-slate-200 text-secondary'}`}>
                  Lihat detail kepesertaan <ArrowRight size={14} />
                </div>
              </button>
            );
          })}
        </div>

        <div className={`px-5 py-3 border-t flex items-center gap-1.5 text-[11px] text-slate-400 ${divider}`}>
          <Info size={13} className="text-secondary" />
          Klik salah satu kartu manfaat untuk melihat nomor kepesertaan, rincian plafon, dan mengunduh E-Card
        </div>
      </div>

      {showPdf && period.published && <PayslipModal period={period} onClose={() => setShowPdf(false)} isDark={isDark} show={show} />}
      {selectedBenefit && <BenefitModal benefit={selectedBenefit} onClose={() => setSelectedBenefit(null)} isDark={isDark} />}
    </div>
  );
}
