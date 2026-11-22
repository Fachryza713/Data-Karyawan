import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, HeartPulse, Briefcase, ShieldPlus } from 'lucide-react';
import { Card, CardHeader, Badge, Button, Modal, cx } from './ui';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

/* BPJS Kesehatan & Ketenagakerjaan selalu di atas, asuransi swasta menyusul. */
const PROVIDER_ORDER = ['BPJS Kesehatan', 'BPJS Ketenagakerjaan'];
const rank = (p) => {
  const i = PROVIDER_ORDER.indexOf(p);
  return i === -1 ? PROVIDER_ORDER.length : i;
};

const iconFor = (provider) => {
  if (provider === 'BPJS Kesehatan') return HeartPulse;
  if (provider === 'BPJS Ketenagakerjaan') return Briefcase;
  return ShieldPlus;
};

const cardNoLabel = (provider) => {
  if (provider === 'BPJS Kesehatan') return 'Nomor kartu';
  if (provider === 'BPJS Ketenagakerjaan') return 'Nomor KPJ';
  return 'Nomor polis / kartu';
};

const dependentsText = (n) => (n > 0 ? `Karyawan + ${n} tanggungan` : 'Karyawan saja');
const subtitle = (b) => [b.program, b.class, dependentsText(b.dependents)].filter(Boolean).join(' · ');
const STATUS = {
  aktif: { label: 'Aktif', tone: 'success' },
  nonaktif: { label: 'Nonaktif', tone: 'neutral' },
};

/** Manfaat & asuransi milik karyawan login (RLS: hanya baris sendiri). */
export function useMyBenefits() {
  const { profile } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.from('benefits')
      .select('id, provider, program, card_no, class, dependents, status')
      .eq('employee_id', profile.id);
    const rows = (data ?? []).slice()
      .sort((a, b) => rank(a.provider) - rank(b.provider) || a.provider.localeCompare(b.provider, 'id'));
    setState({ loading: false, error, rows });
  }, [profile.id]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, activeCount: state.rows.filter((b) => b.status === 'aktif').length };
}

export function BenefitModal({ benefit: b, onClose }) {
  const st = STATUS[b.status] ?? STATUS.nonaktif;
  const details = [
    { label: cardNoLabel(b.provider), value: b.card_no, num: true },
    { label: 'Program', value: b.program },
    { label: 'Kelas', value: b.class },
    { label: 'Tanggungan', value: dependentsText(b.dependents) },
  ];
  return (
    <Modal
      title={b.provider}
      description={subtitle(b)}
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Tutup</Button>}
    >
      <Badge tone={st.tone} dot>{st.label}</Badge>
      <dl className="mt-4 divide-y divide-line">
        {details.map((item) => (
          <div key={item.label} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[180px_1fr] sm:gap-4">
            <dt className="text-[13px] text-faint">{item.label}</dt>
            <dd className={cx('text-sm', item.num && 'num', !item.value && 'text-faint')}>{item.value || 'Belum diisi'}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-faint">Data tidak sesuai? Hubungi HR untuk pembaruan.</p>
    </Modal>
  );
}

/** Daftar manfaat. `benefits` = hasil useMyBenefits(). */
export function BenefitList({ benefits, onSelect }) {
  const { rows, loading, error, reload } = benefits;
  if (error) {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-sm text-danger">Data manfaat gagal dimuat.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>Coba lagi</Button>
      </div>
    );
  }
  if (loading && rows.length === 0) return <p className="px-5 py-8 text-center text-sm text-muted">Memuat…</p>;
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted">Belum ada data manfaat. Hubungi HR.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {rows.map((b) => {
        const Icon = iconFor(b.provider);
        const st = STATUS[b.status] ?? STATUS.nonaktif;
        return (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => onSelect(b)}
              className="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-subtle"
            >
              <Icon size={20} strokeWidth={1.7} className="shrink-0 text-faint" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{b.provider}</p>
                <p className="truncate text-[13px] text-muted">{subtitle(b)}</p>
              </div>
              <span className="num hidden text-[13px] text-faint md:block">{b.card_no ?? '—'}</span>
              <Badge tone={st.tone}>{st.label}</Badge>
              <ChevronRight size={16} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function BenefitsCard({ className }) {
  const benefits = useMyBenefits();
  const [selected, setSelected] = useState(null);

  return (
    <>
      <Card className={cx('flex flex-col', className)}>
        <CardHeader
          title="Manfaat & asuransi"
          description={benefits.loading ? 'Memuat…' : `${benefits.activeCount} program aktif`}
        />
        <BenefitList benefits={benefits} onSelect={setSelected} />
      </Card>
      {selected && <BenefitModal benefit={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
