import React, { useState, useEffect, useCallback } from 'react';
import {
  Heart,
  Building2,
  Shield,
  ChevronRight,
  X,
  Download,
  CheckCircle2,
  CreditCard,
  BadgeCheck,
} from 'lucide-react';

const benefitsData = [
  {
    id: 'bpjs-kesehatan',
    title: 'BPJS Kesehatan Perusahaan',
    subtitle: 'Jaminan Pemeliharaan Kesehatan Nasional',
    icon: Heart,
    iconBgLight: 'bg-rose-50',
    iconBgDark: 'bg-rose-950/40',
    iconColorLight: 'text-rose-500',
    iconColorDark: 'text-rose-400',
    details: [
      { label: 'Nomor Kartu', value: '0002938172918' },
      { label: 'Fasilitas Kelas Rawat Inap', value: 'Kelas 1' },
      { label: 'Faskes Tingkat Pertama', value: 'Klinik Pratama Blue Rose Medical Center' },
      { label: 'Tanggungan', value: 'Karyawan + Keluarga Inti' },
      { label: 'Cakupan Manfaat', value: 'Rawat jalan, rawat inap, persalinan, dan tindakan medis sesuai indikasi.' },
    ],
  },
  {
    id: 'bpjs-ketenagakerjaan',
    title: 'BPJS Ketenagakerjaan',
    subtitle: 'JHT, JKK, JKM, dan Jaminan Pensiun',
    icon: Building2,
    iconBgLight: 'bg-amber-50',
    iconBgDark: 'bg-amber-950/40',
    iconColorLight: 'text-amber-600',
    iconColorDark: 'text-amber-400',
    details: [
      { label: 'Nomor KPJ', value: '21908237192' },
      { label: 'JHT (Jaminan Hari Tua)', value: 'Iuran ditanggung perusahaan & karyawan, dapat dicairkan sesuai ketentuan yang berlaku.' },
      { label: 'JKK (Jaminan Kecelakaan Kerja)', value: 'Perlindungan penuh saat bekerja dan perjalanan dinas.' },
      { label: 'JKM (Jaminan Kematian)', value: 'Santunan kepada ahli waris apabila peserta meninggal dunia.' },
      { label: 'JP (Jaminan Pensiun)', value: 'Manfaat pensiun bulanan setelah memasuki usia pensiun.' },
    ],
  },
  {
    id: 'prudential',
    title: 'Prudential Corporate VIP',
    subtitle: 'Asuransi Rawat Inap & Jalan Swasta Tier 1',
    icon: Shield,
    iconBgLight: 'bg-violet-50',
    iconBgDark: 'bg-violet-950/40',
    iconColorLight: 'text-violet-600',
    iconColorDark: 'text-violet-400',
    details: [
      { label: 'Nomor Polis', value: 'PRU-CORP-99214' },
      { label: 'Plafon Tahunan', value: 'Rp 150.000.000 / tahun' },
      { label: 'Sistem Klaim', value: 'Cashless dengan kartu E-Card di seluruh RS rekanan.' },
      { label: 'Cakupan Manfaat', value: 'Kamar VIP 1 tempat tidur, rawat jalan dokter umum & spesialis, perawatan gigi dasar, dan kacamata/optik.' },
    ],
  },
];

function BenefitModal({ benefit, onClose, isDark }) {
  const Icon = benefit.icon;

  const handleKeyDown = useCallback(
    (e) => { if (e.key === 'Escape') onClose(); },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-backdrop-in" />

      <div
        className={`relative rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-modal-in border ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header modal */}
        <div className={`sticky top-0 z-10 px-6 py-5 border-b flex items-start justify-between gap-4 rounded-t-2xl ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? benefit.iconBgDark : benefit.iconBgLight}`}>
              <Icon size={24} className={isDark ? benefit.iconColorDark : benefit.iconColorLight} />
            </div>
            <div>
              <h3 className={`font-headline font-bold text-[15px] leading-snug ${isDark ? 'text-white' : 'text-neutral'}`}>
                {benefit.title}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{benefit.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Isi modal */}
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-tertiary text-[11px] font-bold rounded-full border ${isDark ? 'bg-emerald-950/40 border-emerald-800/60' : 'bg-emerald-50 border-emerald-200'}`}>
              <CheckCircle2 size={13} />
              Status Aktif
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-full border ${isDark ? 'bg-blue-950/40 border-blue-800/60 text-blue-300' : 'bg-blue-50 border-blue-200 text-secondary'}`}>
              <BadgeCheck size={13} />
              Terverifikasi
            </span>
          </div>

          {benefit.details.map((item, idx) => (
            <div key={idx} className={`px-4 py-3 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">{item.label}</p>
              <p className={`text-[13px] font-medium leading-relaxed ${isDark ? 'text-slate-100' : 'text-neutral'}`}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Footer modal */}
        <div className={`sticky bottom-0 px-6 py-4 border-t flex items-center justify-end gap-3 rounded-b-2xl ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-100'}`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 text-[13px] font-medium rounded-xl transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Tutup
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-blue-700 text-white text-[13px] font-semibold rounded-xl transition-colors shadow-md shadow-secondary/20">
            <Download size={15} />
            Unduh E-Card
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BenefitsCard({ isDark }) {
  const [selectedBenefit, setSelectedBenefit] = useState(null);

  return (
    <>
      <div className={`rounded-2xl border flex flex-col transition-colors duration-300 ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}>
        {/* Header */}
        <div className={`px-5 py-4 flex items-center justify-between border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-emerald-950/40' : 'bg-emerald-50'}`}>
              <Shield size={17} className="text-tertiary" />
            </div>
            <h3 className={`font-headline font-semibold text-sm ${isDark ? 'text-white' : 'text-neutral'}`}>
              Manfaat &amp; Asuransi Aktif
            </h3>
          </div>
          <span className={`px-2.5 py-1 text-tertiary text-[11px] font-bold rounded-full ${isDark ? 'bg-emerald-950/40' : 'bg-emerald-50'}`}>
            3 Terdaftar
          </span>
        </div>

        {/* Sub-teks */}
        <div className="px-5 pt-4">
          <p className="text-[12px] text-slate-400 leading-relaxed">
            Program perlindungan kesehatan dan ketenagakerjaan resmi dari Blue Rose Tech. Klik salah satu modul untuk melihat detail polis dan klaim.
          </p>
        </div>

        {/* 3 kotak manfaat */}
        <div className="p-5 flex-1 space-y-3">
          {benefitsData.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <button
                key={benefit.id}
                onClick={() => setSelectedBenefit(benefit)}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-150 group flex items-center gap-4 cursor-pointer ${
                  isDark
                    ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600 hover:shadow-sm'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? benefit.iconBgDark : benefit.iconBgLight}`}>
                  <Icon size={21} className={isDark ? benefit.iconColorDark : benefit.iconColorLight} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-semibold leading-snug ${isDark ? 'text-slate-100' : 'text-neutral'}`}>
                    {benefit.title}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{benefit.subtitle}</p>
                </div>

                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-tertiary text-[10px] font-bold rounded-full ${isDark ? 'bg-emerald-950/40' : 'bg-emerald-50'}`}>
                    <span className="w-1.5 h-1.5 bg-tertiary rounded-full" />
                    Aktif
                  </span>
                  <div className={`w-7 h-7 rounded-lg border flex items-center justify-center group-hover:bg-secondary group-hover:border-secondary transition-colors ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                    <ChevronRight size={15} className="text-slate-400 group-hover:text-white transition-colors" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <CreditCard size={13} />
            Keterangan nomor polis &amp; plafon ditampilkan saat kartu diklik
          </span>
          <button className={`inline-flex items-center gap-1 text-[11px] font-semibold hover:underline ${isDark ? 'text-blue-400' : 'text-secondary'}`}>
            <Download size={12} />
            Unduh E-Card
          </button>
        </div>
      </div>

      {selectedBenefit && (
        <BenefitModal benefit={selectedBenefit} onClose={() => setSelectedBenefit(null)} isDark={isDark} />
      )}
    </>
  );
}
