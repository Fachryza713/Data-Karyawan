import React, { useState } from 'react';
import { ChevronRight, Download, HeartPulse, Briefcase, ShieldPlus } from 'lucide-react';
import { Card, CardHeader, Badge, Button, Modal, cx } from './ui';

export const benefitsData = [
  {
    id: 'bpjs-kesehatan',
    title: 'BPJS Kesehatan',
    subtitle: 'Kelas 1 · Karyawan + keluarga inti',
    number: '0002938172918',
    icon: HeartPulse,
    details: [
      { label: 'Nomor kartu', value: '0002938172918' },
      { label: 'Kelas rawat inap', value: 'Kelas 1' },
      { label: 'Faskes tingkat pertama', value: 'Klinik Pratama Blue Rose Medical Center' },
      { label: 'Tanggungan', value: 'Karyawan + keluarga inti' },
      { label: 'Cakupan', value: 'Rawat jalan, rawat inap, persalinan, dan tindakan medis sesuai indikasi.' },
    ],
  },
  {
    id: 'bpjs-ketenagakerjaan',
    title: 'BPJS Ketenagakerjaan',
    subtitle: 'JHT, JKK, JKM, dan Jaminan Pensiun',
    number: '21908237192',
    icon: Briefcase,
    details: [
      { label: 'Nomor KPJ', value: '21908237192' },
      { label: 'Jaminan Hari Tua (JHT)', value: 'Iuran ditanggung perusahaan & karyawan, dapat dicairkan sesuai ketentuan.' },
      { label: 'Jaminan Kecelakaan Kerja (JKK)', value: 'Perlindungan saat bekerja dan perjalanan dinas.' },
      { label: 'Jaminan Kematian (JKM)', value: 'Santunan kepada ahli waris.' },
      { label: 'Jaminan Pensiun (JP)', value: 'Manfaat pensiun bulanan setelah usia pensiun.' },
    ],
  },
  {
    id: 'prudential',
    title: 'Prudential Corporate',
    subtitle: 'Rawat inap & jalan · plafon Rp150 jt/tahun',
    number: 'PRU-CORP-99214',
    icon: ShieldPlus,
    details: [
      { label: 'Nomor polis', value: 'PRU-CORP-99214' },
      { label: 'Plafon tahunan', value: 'Rp150.000.000' },
      { label: 'Sistem klaim', value: 'Cashless dengan E-Card di seluruh RS rekanan.' },
      { label: 'Cakupan', value: 'Kamar VIP 1 tempat tidur, dokter umum & spesialis, perawatan gigi dasar, kacamata.' },
    ],
  },
];

export function BenefitModal({ benefit, onClose }) {
  return (
    <Modal
      title={benefit.title}
      description={benefit.subtitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Tutup</Button>
          <Button><Download size={16} aria-hidden="true" /> Unduh E-Card</Button>
        </>
      }
    >
      <Badge tone="success" dot>Aktif</Badge>
      <dl className="mt-4 divide-y divide-line">
        {benefit.details.map((item) => (
          <div key={item.label} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[180px_1fr] sm:gap-4">
            <dt className="text-[13px] text-faint">{item.label}</dt>
            <dd className="text-sm">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

export function BenefitList({ onSelect }) {
  return (
    <ul className="divide-y divide-line">
      {benefitsData.map((b) => {
        const Icon = b.icon;
        return (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => onSelect(b)}
              className="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-subtle"
            >
              <Icon size={20} strokeWidth={1.7} className="shrink-0 text-faint" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{b.title}</p>
                <p className="truncate text-[13px] text-muted">{b.subtitle}</p>
              </div>
              <span className="num hidden text-[13px] text-faint md:block">{b.number}</span>
              <ChevronRight size={16} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function BenefitsCard({ className }) {
  const [selected, setSelected] = useState(null);

  return (
    <>
      <Card className={cx('flex flex-col', className)}>
        <CardHeader
          title="Manfaat & asuransi"
          description="3 program aktif"
          action={<Button variant="ghost" size="sm"><Download size={14} aria-hidden="true" /> E-Card</Button>}
        />
        <BenefitList onSelect={setSelected} />
      </Card>
      {selected && <BenefitModal benefit={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
