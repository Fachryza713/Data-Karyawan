import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Copy, Loader2, Save, AlertCircle,
} from 'lucide-react';
import { PageHeader, Card, Badge, Button, IconButton, Modal, Field, useToast, inputCls, cx } from '../ui';
import { FieldError } from '../LoginPage';
import { supabase } from '../../lib/supabase';
import {
  templateStatus, kpiError, useKpiTemplate, useKpiPositions, fetchTemplateIndicators,
} from '../../lib/kpi';

const MAX_ITEMS = 20;
const newKey = () => crypto.randomUUID();
const blank = () => ({ key: newKey(), id: null, name: '', description: '', weight: '', target: '' });
const toItem = (i) => ({
  key: i.id ?? newKey(), id: i.id ?? null, name: i.name ?? '', description: i.description ?? '',
  weight: i.weight == null ? '' : String(i.weight), target: i.target ?? '',
});
/** Isi form yang dibandingkan untuk menandai perubahan belum disimpan. */
const snapshot = (name, items) => JSON.stringify({
  name: name.trim(),
  items: items.map((i) => [i.id, i.name.trim(), i.description.trim(), String(i.weight).trim(), i.target.trim()]),
});
const weightOf = (i) => {
  const n = Number(i.weight);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

function validate(name, items) {
  const errors = {};
  if (!name.trim()) errors.name = 'Nama template wajib diisi.';
  if (items.length === 0) errors.form = 'Tambahkan minimal satu indikator.';
  const seen = new Set();
  items.forEach((i) => {
    const e = {};
    const nm = i.name.trim().toLowerCase();
    if (!nm) e.name = 'Nama indikator wajib diisi.';
    else if (seen.has(nm)) e.name = 'Nama indikator tidak boleh sama.';
    seen.add(nm);
    const w = Number(i.weight);
    if (!/^\d{1,3}$/.test(String(i.weight).trim()) || w < 1 || w > 100) e.weight = 'Bobot 1–100.';
    if (Object.keys(e).length) errors[i.key] = e;
  });
  return errors;
}

function WeightMeter({ total }) {
  const tone = total === 100 ? 'success' : total > 100 ? 'danger' : 'warning';
  const bar = { success: 'bg-success', danger: 'bg-danger', warning: 'bg-warning' }[tone];
  const text = { success: 'text-success', danger: 'text-danger', warning: 'text-warning' }[tone];
  const msg = total === 100
    ? 'Total bobot 100%. Template siap dipakai.'
    : total > 100 ? `Kelebihan ${total - 100}%. Kurangi bobot indikator.` : `Kurang ${100 - total}% lagi agar template bisa dipakai.`;
  return (
    <div className="min-w-0 flex-1" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">Total bobot</span>
        <span className={cx('num font-semibold', text)}>{total}% <span className="font-normal text-faint">/ 100%</span></span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-subtle"
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(total, 100)} aria-label="Total bobot"
      >
        <div className={cx('h-full rounded-full transition-all', bar)} style={{ width: `${Math.min(total, 100)}%` }} />
      </div>
      <p className={cx('mt-1 text-xs', text)}>{msg}</p>
    </div>
  );
}

function IndicatorRow({ item, index, count, errors, onChange, onMove, onRemove }) {
  const id = (f) => `ind-${item.key}-${f}`;
  const set = (field) => (e) => onChange(item.key, field, e.target.value);
  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="num mt-7 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-subtle text-xs font-semibold text-muted">
          {index + 1}
        </span>
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_110px]">
          <Field label="Nama indikator" required htmlFor={id('name')}>
            <input
              id={id('name')} value={item.name} maxLength={120} onChange={set('name')}
              placeholder="Contoh: Penyelesaian sprint"
              aria-invalid={!!errors?.name || undefined}
              className={cx(inputCls, errors?.name && 'border-danger')}
            />
            <FieldError>{errors?.name}</FieldError>
          </Field>
          <Field label="Bobot (%)" required htmlFor={id('weight')}>
            <input
              id={id('weight')} value={item.weight} inputMode="numeric" maxLength={3}
              onChange={(e) => onChange(item.key, 'weight', e.target.value.replace(/\D/g, '').slice(0, 3))}
              aria-invalid={!!errors?.weight || undefined}
              className={cx(inputCls, 'num text-right', errors?.weight && 'border-danger')}
            />
            <FieldError>{errors?.weight}</FieldError>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Deskripsi" htmlFor={id('desc')} aside={`${item.description.length}/500`}>
              <textarea
                id={id('desc')} rows={2} value={item.description} maxLength={500} onChange={set('description')}
                placeholder="Apa yang diukur dan bagaimana cara menghitungnya"
                className={cx(inputCls, 'h-auto resize-none py-2')}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Target" htmlFor={id('target')}>
              <input
                id={id('target')} value={item.target} maxLength={120} onChange={set('target')}
                placeholder="Contoh: ≥ 90% story point"
                className={inputCls}
              />
            </Field>
          </div>
        </div>
        <div className="mt-6 flex shrink-0 flex-col gap-1">
          <IconButton label={`Naikkan indikator ${index + 1}`} className="h-8 w-8" onClick={() => onMove(index, -1)} disabled={index === 0}>
            <ChevronUp size={16} />
          </IconButton>
          <IconButton label={`Turunkan indikator ${index + 1}`} className="h-8 w-8" onClick={() => onMove(index, 1)} disabled={index === count - 1}>
            <ChevronDown size={16} />
          </IconButton>
          <IconButton label={`Hapus indikator ${index + 1}`} className="h-8 w-8 hover:bg-danger-soft hover:text-danger" onClick={() => onRemove(item.key)}>
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>
    </li>
  );
}

/** Pilih jabatan sumber lalu salin indikatornya ke editor (belum tersimpan). */
function CopyModal({ currentId, hasItems, onClose, onCopy }) {
  const positions = useKpiPositions();
  const sources = positions.rows.filter((p) => p.position_id !== currentId && p.indicator_count > 0);
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const chosen = sources.find((s) => s.position_id === source);

  const copy = async () => {
    if (!source || busy) return;
    setBusy(true);
    setError(null);
    const { rows, error: err } = await fetchTemplateIndicators(source);
    setBusy(false);
    if (err || rows.length === 0) {
      setError(kpiError(err, 'Indikator gagal dimuat.'));
      return;
    }
    onCopy(rows, chosen);
  };

  return (
    <Modal
      size="sm"
      title="Salin dari jabatan lain"
      description="Indikator disalin ke editor. Simpan untuk menerapkannya."
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
          <Button onClick={copy} disabled={!source || busy} aria-busy={busy || undefined}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            Salin indikator
          </Button>
        </>
      }
    >
      {error && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      {positions.loading && positions.rows.length === 0 ? (
        <p className="text-sm text-muted">Memuat jabatan…</p>
      ) : sources.length === 0 ? (
        <p className="text-sm text-muted">Belum ada jabatan lain yang punya template.</p>
      ) : (
        <Field label="Jabatan sumber" htmlFor="copy-source">
          <select id="copy-source" value={source} onChange={(e) => setSource(e.target.value)} className={cx(inputCls, 'pr-8')}>
            <option value="">Pilih jabatan…</option>
            {sources.map((s) => (
              <option key={s.position_id} value={s.position_id}>
                {s.position_name} · {s.indicator_count} indikator · {s.total_weight}%
              </option>
            ))}
          </select>
        </Field>
      )}
      {hasItems && source && (
        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning">
          Indikator yang ada di editor sekarang akan diganti.
        </p>
      )}
    </Modal>
  );
}

export default function KpiTemplateEditor() {
  const { positionId } = useParams();
  const navigate = useNavigate();
  const data = useKpiTemplate(positionId);
  const [toast, toastNode] = useToast();
  const [name, setName] = useState('');
  const [items, setItems] = useState([]);
  const [initial, setInitial] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showCopy, setShowCopy] = useState(false);

  // Isi form dari database setiap kali data dimuat (awal dan setelah simpan).
  useEffect(() => {
    if (data.loading || !data.position) return;
    const n = data.template?.name ?? `KPI ${data.position.name}`;
    const list = data.indicators.map(toItem);
    setName(n);
    setItems(list);
    setInitial(snapshot(n, list));
    setErrors({});
  }, [data.loading, data.position, data.template, data.indicators]);

  const total = useMemo(() => items.reduce((n, i) => n + weightOf(i), 0), [items]);
  const dirty = initial !== null && snapshot(name, items) !== initial;
  // Template baru: boleh disimpan begitu ada indikator, walau nama default belum diubah.
  const canSave = dirty || (!data.template && items.length > 0);

  // Peringatan browser saat menutup tab dengan perubahan belum disimpan.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBefore = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [dirty]);

  const goBack = () => {
    if (dirty && !window.confirm('Perubahan template belum disimpan. Tinggalkan halaman?')) return;
    navigate('/hr/kpi/template');
  };

  const clearErr = (key, field) => setErrors((e) => {
    if (!e[key]?.[field] && !e.form) return e;
    const next = { ...e, form: null };
    if (next[key]) next[key] = { ...next[key], [field]: null };
    return next;
  });
  const change = (key, field, value) => {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
    clearErr(key, field);
  };
  const move = (index, dir) => setItems((list) => {
    const next = list.slice();
    const [it] = next.splice(index, 1);
    next.splice(index + dir, 0, it);
    return next;
  });
  const remove = (key) => setItems((list) => list.filter((i) => i.key !== key));
  const add = () => setItems((list) => (list.length >= MAX_ITEMS ? list : [...list, blank()]));

  const save = async () => {
    if (busy) return;
    const e = validate(name, items);
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    const { data: result, error } = await supabase.rpc('hr_save_kpi_template', {
      p_position_id: positionId,
      p_name: name.trim(),
      p_indicators: items.map((i) => ({
        id: i.id, name: i.name.trim(), description: i.description.trim(), weight: Number(i.weight), target: i.target.trim(),
      })),
    });
    setBusy(false);
    if (error) {
      setErrors({ form: kpiError(error, 'Template gagal disimpan. Coba lagi.') });
      return;
    }
    toast(result.is_valid
      ? 'Template disimpan dan siap dipakai.'
      : `Template disimpan. Total bobot ${result.total_weight}%, belum bisa dipakai sampai tepat 100%.`);
    data.reload();
  };

  const back = (
    <button type="button" onClick={goBack} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg">
      <ArrowLeft size={16} aria-hidden="true" /> Evaluasi kinerja
    </button>
  );

  if (data.loading && !data.position) {
    return (
      <>
        {back}
        <Card className="px-6 py-16 text-center text-sm text-muted">
          <Loader2 size={18} className="mr-2 inline animate-spin" aria-hidden="true" />Memuat template…
        </Card>
      </>
    );
  }
  if (!data.position) {
    return (
      <>
        {back}
        <Card className="px-6 py-16 text-center">
          <p className="text-sm text-danger">
            <AlertCircle size={16} className="mr-1.5 inline" aria-hidden="true" />
            {data.error ? kpiError(data.error, 'Template gagal dimuat.') : 'Jabatan tidak ditemukan.'}
          </p>
        </Card>
      </>
    );
  }

  const savedStatus = templateStatus({
    template_id: data.template?.id,
    indicator_count: data.indicators.length,
    is_valid: data.indicators.length > 0 && data.indicators.reduce((n, i) => n + i.weight, 0) === 100,
  });

  return (
    <>
      {back}
      <PageHeader
        title={`Template KPI · ${data.position.name}`}
        description={data.position.division?.name ?? 'Tanpa divisi'}
        actions={
          <>
            <Badge tone={savedStatus.tone} dot={savedStatus.key !== 'none'}>{savedStatus.label}</Badge>
            <Button variant="secondary" onClick={() => setShowCopy(true)}>
              <Copy size={16} aria-hidden="true" /> Salin dari jabatan lain
            </Button>
          </>
        }
      />

      <Card className="p-5">
        <Field label="Nama template" required htmlFor="tpl-name" aside={`${name.length}/120`}>
          <input
            id="tpl-name" value={name} maxLength={120}
            onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: null, form: null })); }}
            aria-invalid={!!errors.name || undefined}
            className={cx(inputCls, 'sm:max-w-md', errors.name && 'border-danger')}
          />
          <FieldError>{errors.name}</FieldError>
        </Field>
      </Card>

      <div className="mt-5 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">
          Indikator <span className="num font-normal text-faint">{items.length}/{MAX_ITEMS}</span>
        </h2>
        <Button variant="secondary" size="sm" onClick={add} disabled={items.length >= MAX_ITEMS}>
          <Plus size={14} aria-hidden="true" /> Tambah indikator
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="mt-3 px-6 py-12 text-center">
          <p className="text-sm text-muted">Belum ada indikator. Tambahkan indikator atau salin dari jabatan lain.</p>
          <Button className="mt-4" size="sm" onClick={add}><Plus size={14} aria-hidden="true" /> Tambah indikator</Button>
        </Card>
      ) : (
        <ol className="mt-3 space-y-3">
          {items.map((item, idx) => (
            <IndicatorRow
              key={item.key}
              item={item}
              index={idx}
              count={items.length}
              errors={errors[item.key]}
              onChange={change}
              onMove={move}
              onRemove={remove}
            />
          ))}
        </ol>
      )}

      {/* Bar bawah: total bobot langsung + simpan */}
      <div className="sticky bottom-0 z-10 mt-5 border-t border-line bg-canvas/95 py-3 backdrop-blur">
        {errors.form && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{errors.form}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <WeightMeter total={total} />
          <div className="flex shrink-0 items-center justify-end gap-2">
            {dirty && <span className="text-xs text-faint">Belum disimpan</span>}
            <Button onClick={save} disabled={busy || !canSave} aria-busy={busy || undefined}>
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              Simpan template
            </Button>
          </div>
        </div>
      </div>

      {showCopy && (
        <CopyModal
          currentId={positionId}
          hasItems={items.length > 0}
          onClose={() => setShowCopy(false)}
          onCopy={(rows, src) => {
            setItems(rows.map((r) => toItem({ ...r, id: null })));
            setErrors({});
            setShowCopy(false);
            toast(`${rows.length} indikator disalin dari ${src.position_name}. Simpan untuk menerapkan.`);
          }}
        />
      )}
      {toastNode}
    </>
  );
}
